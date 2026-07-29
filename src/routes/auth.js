'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const { dbRun, dbGet } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth, signToken, revokeSessions } = require('../middleware/auth');
const lockout = require('../services/lockout');
const { validate, z, fields } = require('../middleware/validate');
const { publicUser } = require('../utils/serialize');

const router = express.Router();

/**
 * Brute-force protection. The prototype had none: /api/auth/login could be
 * hammered indefinitely, and the mock OAuth route minted a real JWT for a
 * predictable address (that route is gone entirely).
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 10 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
});

/** Yandex SmartCaptcha. Only enforced when a secret is actually configured. */
async function assertCaptcha(token, ip) {
  if (!config.captcha.enabled) return;
  if (!token) throw ApiError.badRequest('Подтвердите, что вы не робот');

  try {
    const params = new URLSearchParams({ secret: config.captcha.secret, token });
    if (ip) params.append('ip', ip);
    const res = await fetch('https://smartcaptcha.yandexcloud.net/validate', {
      method: 'POST',
      body: params,
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.status !== 'ok') throw ApiError.badRequest('Проверка капчи не пройдена');
  } catch (err) {
    if (err instanceof ApiError) throw err;
    console.error('[captcha] validation failed:', err.message);
    throw new ApiError(503, 'Сервис проверки временно недоступен, попробуйте позже');
  }
}

const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

// ------------------------------------------------------------------ register

const registerSchema = z.object({
  name: fields.name,
  email: fields.email,
  password: fields.password,
  role: z.enum(['parent', 'child']).default('parent'),
  age: fields.age.optional(),
  city: fields.city.optional(),
  smartCaptchaToken: z.string().optional(),
});

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, role, age, city, smartCaptchaToken } = req.body;
    await assertCaptcha(smartCaptchaToken, clientIp(req));

    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) throw ApiError.conflict('Этот email уже зарегистрирован');

    const hash = await bcrypt.hash(password, 12);
    const { lastID } = await dbRun(
      `INSERT INTO users (name, email, password, role, age, city) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email, hash, role, age ?? null, city ?? null]
    );

    const user = await dbGet(
      `SELECT id, name, email, age, city, weekly_hours, role, avatar, xp_points,
              subscription_status, recommended_graph_id, recommended_graphs,
              equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
              parent_pin IS NOT NULL AS has_pin
         FROM users WHERE id = ?`,
      [lastID]
    );

    res.status(201).json({ token: signToken(lastID, 0), user: publicUser(user) });
  })
);

// --------------------------------------------------------------------- login

const loginSchema = z.object({
  email: fields.email,
  password: z.string().min(1, 'Введите пароль'),
  smartCaptchaToken: z.string().optional(),
});

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, smartCaptchaToken } = req.body;

    /**
     * Блокировка привязана к почте, а не к адресу.
     *
     * Ограничение по частоте с привязкой к адресу обходится ботнетом или
     * подменой заголовка прокси. Подбор пароля от конкретного ящика так не
     * ускоришь: счётчик у цели атаки один, откуда бы ни пришёл запрос.
     */
    const locked = await lockout.check(lockout.KIND.LOGIN, email);
    if (locked) {
      res.setHeader('Retry-After', String(locked.retryAfter));
      throw new ApiError(
        429,
        `Слишком много неудачных попыток входа. Повторите через ${Math.ceil(locked.retryAfter / 60)} мин.`
      );
    }

    await assertCaptcha(smartCaptchaToken, clientIp(req));

    const row = await dbGet('SELECT * FROM users WHERE email = ?', [email]);

    // Always run a comparison so a missing account and a wrong password take
    // the same time — otherwise response timing reveals which emails exist.
    const hash = row?.password || '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);

    if (!row || !ok) {
      const state = await lockout.fail(lockout.KIND.LOGIN, email);
      // Сообщение одинаковое для несуществующей почты и неверного пароля:
      // подсказывать, какие ящики зарегистрированы, незачем.
      if (state.locked) {
        res.setHeader('Retry-After', String(state.retryAfter));
        throw new ApiError(429, 'Слишком много неудачных попыток входа. Аккаунт временно заблокирован.');
      }
      throw ApiError.badRequest('Неверный email или пароль');
    }

    await lockout.reset(lockout.KIND.LOGIN, email);

    res.json({
      token: signToken(row.id, row.token_version ?? 0),
      user: publicUser({ ...row, has_pin: row.parent_pin ? 1 : 0 }),
    });
  })
);

// ----------------------------------------------------------------------- me

/**
 * Session check. The prototype trusted whatever user object sat in
 * localStorage, so a stale or hand-edited copy was believed indefinitely.
 * The client now revalidates against this on every load.
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: publicUser(req.user) });
  })
);

// ------------------------------------------------------------ password change

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Введите текущий пароль'),
  newPassword: fields.password,
});

router.post(
  '/change-password',
  requireAuth,
  validate(passwordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const row = await dbGet('SELECT password FROM users WHERE id = ?', [req.user.id]);
    const ok = await bcrypt.compare(currentPassword, row.password);
    if (!ok) throw ApiError.badRequest('Текущий пароль указан неверно');

    if (await bcrypt.compare(newPassword, row.password)) {
      throw ApiError.badRequest('Новый пароль должен отличаться от текущего');
    }

    await dbRun('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash(newPassword, 12), req.user.id]);

    /**
     * Все ранее выданные токены перестают действовать.
     *
     * Смысл смены пароля — выгнать того, кто получил доступ. Раньше старые
     * токены жили до конца срока, и смена пароля ничего не отнимала у
     * захватчика. Текущему устройству сразу выдаём новый токен, чтобы человека
     * не выбрасывало из собственного сеанса.
     */
    const version = await revokeSessions(req.user.id);
    await lockout.reset(lockout.KIND.LOGIN, req.user.email);

    res.json({ success: true, token: signToken(req.user.id, version) });
  })
);

module.exports = router;
