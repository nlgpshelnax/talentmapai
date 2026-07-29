'use strict';

const express = require('express');
const bcrypt = require('bcrypt');

const { dbGet, dbRun } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { limits } = require('../middleware/security');
const lockout = require('../services/lockout');
const { validate, z, fields } = require('../middleware/validate');
const { publicUser } = require('../utils/serialize');

const router = express.Router();

async function reloadUser(id) {
  return dbGet(
    `SELECT id, name, email, age, city, weekly_hours, role, avatar, xp_points,
            subscription_status, recommended_graph_id, recommended_graphs,
            equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
            parent_pin IS NOT NULL AS has_pin
       FROM users WHERE id = ?`,
    [id]
  );
}

/** Update own profile. Note there is no `userId` field — you can only edit yourself. */
const profileSchema = z.object({
  name: fields.name.optional(),
  // Роль выбирается на онбординге (ТЗ 3.1) и определяет формулировки вопросов.
  role: z.enum(['parent', 'child']).optional(),
  age: fields.age.optional(),
  city: fields.city.optional(),
  weeklyHours: fields.plainText(40).optional(),
  avatar: fields.plainText(500).optional(),
});

router.patch(
  '/profile',
  requireAuth,
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const { name, role, age, city, weeklyHours, avatar } = req.body;

    const updates = [];
    const params = [];
    if (name !== undefined) (updates.push('name = ?'), params.push(name));
    if (role !== undefined) (updates.push('role = ?'), params.push(role));
    if (age !== undefined) (updates.push('age = ?'), params.push(age));
    if (city !== undefined) (updates.push('city = ?'), params.push(city));
    if (weeklyHours !== undefined) (updates.push('weekly_hours = ?'), params.push(weeklyHours));
    if (avatar !== undefined) (updates.push('avatar = ?'), params.push(avatar || null));

    if (!updates.length) throw ApiError.badRequest('Нет полей для обновления');

    params.push(req.user.id);
    await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, user: publicUser(await reloadUser(req.user.id)) });
  })
);

// ------------------------------------------------------------- parent PIN

/**
 * The parent PIN gates the analytics area from the child.
 * The prototype stored the four digits in plaintext and compared with `===`;
 * it is now a bcrypt hash like any other credential.
 *
 * Parent and child share one account, so once a PIN exists, changing it must
 * require the current PIN — otherwise the child could simply overwrite it.
 * `currentPin` is optional in the schema (it is only needed when a PIN already
 * exists) and enforced in the handler.
 */
router.post(
  '/pin',
  requireAuth,
  validate(z.object({ pin: fields.pin, currentPin: fields.pin.optional() })),
  asyncHandler(async (req, res) => {
    const row = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [req.user.id]);
    if (row?.parent_pin) {
      if (!req.body.currentPin) throw ApiError.badRequest('Введите текущий PIN-код');
      const ok = await bcrypt.compare(req.body.currentPin, row.parent_pin);
      if (!ok) throw ApiError.badRequest('Неверный текущий PIN-код');
    }
    await dbRun('UPDATE users SET parent_pin = ? WHERE id = ?', [
      await bcrypt.hash(req.body.pin, 10),
      req.user.id,
    ]);
    res.json({ success: true });
  })
);

/**
 * Проверка родительского PIN.
 *
 * Четыре цифры — это десять тысяч комбинаций. Скрипт переберёт их за минуты,
 * если ничего не мешает, и ребёнок получит доступ к разделу, который от него
 * закрыт. Ограничение по частоте здесь недостаточно: счётчик в памяти
 * обнуляется перезапуском. Поэтому неудачи копятся в базе и привязаны к
 * аккаунту.
 */
router.post(
  '/pin/verify',
  requireAuth,
  limits.pin,
  validate(z.object({ pin: fields.pin })),
  asyncHandler(async (req, res) => {
    const locked = await lockout.check(lockout.KIND.PIN, req.user.id);
    if (locked) {
      res.setHeader('Retry-After', String(locked.retryAfter));
      throw new ApiError(
        429,
        `Слишком много попыток. Повторите через ${Math.ceil(locked.retryAfter / 60)} мин.`
      );
    }

    const row = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [req.user.id]);
    if (!row?.parent_pin) throw ApiError.badRequest('PIN-код ещё не установлен');

    const ok = await bcrypt.compare(req.body.pin, row.parent_pin);
    if (!ok) {
      const state = await lockout.fail(lockout.KIND.PIN, req.user.id);
      if (state.locked) {
        res.setHeader('Retry-After', String(state.retryAfter));
        throw new ApiError(429, 'Слишком много попыток ввода PIN-кода. Раздел временно заблокирован.');
      }
      throw ApiError.badRequest(
        state.remaining <= 3
          ? `Неверный PIN-код. Осталось попыток: ${state.remaining}`
          : 'Неверный PIN-код'
      );
    }

    await lockout.reset(lockout.KIND.PIN, req.user.id);
    res.json({ success: true });
  })
);

// Removing a PIN also requires the current one. A DELETE body is awkward for
// clients, so the PIN comes in as a query parameter (?currentPin=1234), validated
// with the same `validate(schema, 'query')` form used elsewhere (see admin edges).
router.delete(
  '/pin',
  requireAuth,
  limits.pin,
  validate(z.object({ currentPin: fields.pin }), 'query'),
  asyncHandler(async (req, res) => {
    const locked = await lockout.check(lockout.KIND.PIN, req.user.id);
    if (locked) {
      res.setHeader('Retry-After', String(locked.retryAfter));
      throw new ApiError(429, 'Слишком много попыток. Повторите позже.');
    }

    const row = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [req.user.id]);
    if (row?.parent_pin) {
      const ok = await bcrypt.compare(req.query.currentPin, row.parent_pin);
      if (!ok) {
        await lockout.fail(lockout.KIND.PIN, req.user.id);
        throw ApiError.badRequest('Неверный текущий PIN-код');
      }
    }
    await dbRun('UPDATE users SET parent_pin = NULL WHERE id = ?', [req.user.id]);
    res.json({ success: true });
  })
);

// ----------------------------------------------------------- subscription

/**
 * Demo upgrade. There is no payment provider wired in, so this is explicitly
 * a demo action — but it can now only ever upgrade the caller's own account,
 * whereas the prototype accepted any userId in the body.
 */
router.post(
  '/subscription/upgrade',
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbRun("UPDATE users SET subscription_status = 'pro' WHERE id = ?", [req.user.id]);
    await dbRun('INSERT INTO history_logs (user_id, log_text) VALUES (?, ?)', [
      req.user.id,
      'Оформлена подписка PRO — открыты все созвездия.',
    ]);
    res.json({ success: true, user: publicUser(await reloadUser(req.user.id)) });
  })
);

router.post(
  '/subscription/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbRun("UPDATE users SET subscription_status = 'trial' WHERE id = ?", [req.user.id]);
    res.json({ success: true, user: publicUser(await reloadUser(req.user.id)) });
  })
);

module.exports = router;
