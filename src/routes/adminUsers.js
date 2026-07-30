'use strict';

/**
 * Управление пользователями для администратора.
 *
 * Раньше админ мог только СМОТРЕТЬ список (старый `GET /users` в admin.js).
 * Здесь появляется полноценное управление: назначение прав, смена подписки и
 * опыта, сброс пароля, принудительный выход и удаление аккаунта.
 *
 * Маршруты рассчитаны на монтирование в admin.js ПОД общим шлюзом
 * `requireAuth + requireAdmin` (см. `router.use(requireAuth, requireAdmin)` в
 * начале admin.js). Здесь тот же шлюз навешивается ещё раз на всякий случай:
 * повторное применение безвредно (пользователь уже загружен), но если роутер
 * когда-нибудь смонтируют напрямую, он не окажется открытым.
 *
 * Ключевая часть — предохранители. Администратор способен по ошибке лишить себя
 * (и, если он последний, всех остальных) доступа к панели навсегда. Такие
 * действия отклоняются ДО записи в базу, с понятным русским объяснением.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');

const config = require('../config');
const { dbAll, dbGet, dbRun, withTransaction } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth, requireAdmin, revokeSessions } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { formatRuDate } = require('../utils/serialize');

const router = express.Router();

router.use(requireAuth, requireAdmin);

const BCRYPT_COST = 12;

// -------------------------------------------------------------- helpers

/**
 * Сколько всего администраторов в системе. Нужно, чтобы не дать снять права или
 * удалить ПОСЛЕДНЕГО админа — иначе в панель больше никто никогда не войдёт.
 */
async function countAdmins() {
  const row = await dbGet('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1');
  return row?.n ?? 0;
}

/**
 * Строгий бросок, если действие оставит систему без администраторов.
 * `target` — пользователь, которого демотируют или удаляют.
 */
async function assertNotLastAdmin(target) {
  if (!target.is_admin) return; // не админ — ограничение неактуально
  const admins = await countAdmins();
  if (admins <= 1) {
    throw ApiError.badRequest(
      'Это последний администратор. Сначала назначьте другого — иначе в панель управления больше никто не войдёт.'
    );
  }
}

/**
 * Генерация надёжного временного пароля. Показывается администратору РОВНО ОДИН
 * раз, поэтому он должен быть и стойким к подбору, и произносимым вслух (админ
 * зачитывает его пользователю). Берём базу64url от случайных байт и режем до
 * 16 символов: это ~96 бит энтропии, без похожих на вид символов не гонимся —
 * пароль одноразовый и живёт до первого входа.
 */
function generatePassword() {
  return crypto.randomBytes(18).toString('base64url').slice(0, 16);
}

/** Абсолютный путь к загруженному файлу, если значение указывает в /uploads/. */
function uploadPathOf(value) {
  if (typeof value !== 'string' || !value.startsWith('/uploads/')) return null;
  return path.join(config.uploads.dir, path.basename(value));
}

/** Тихо удалить файл с диска — отсутствие файла ошибкой не считаем. */
async function removeFileQuiet(filePath) {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => {});
}

/** Ряд БД → форма ответа. Совместима со старым `GET /users` (те же ключи). */
function serializeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    age: u.age,
    city: u.city,
    role: u.role,
    xp: u.xp_points,
    subscription: u.subscription_status,
    isAdmin: Boolean(u.is_admin),
    completed: u.completed,
    works: u.works,
    purchases: u.purchases,
    createdAt: u.created_at,
    registered: formatRuDate(u.created_at),
  };
}

// ------------------------------------------------------------------ list

/**
 * Список пользователей: поиск (имя/почта/город), фильтр по роли, пагинация.
 *
 * Поиск фильтруется в JS, а НЕ в SQL. `LIKE`/`lower()` в SQLite работают только
 * с латиницей, поэтому `name LIKE '%иван%'` никогда не найдёт «Иван» — этот баг
 * в проекте уже ловили и чинили именно так (см. старый `GET /users`).
 */
router.get(
  '/',
  validate(
    z.object({
      q: z.string().trim().max(120).optional(),
      role: z.enum(['parent', 'child']).optional(),
      admin: z.enum(['1', '0']).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const rows = await dbAll(
      `SELECT u.id, u.name, u.email, u.age, u.city, u.role, u.xp_points,
              u.subscription_status, u.is_admin, u.created_at,
              (SELECT COUNT(*) FROM user_progress p WHERE p.user_id = u.id) AS completed,
              (SELECT COUNT(*) FROM portfolio f WHERE f.user_id = u.id)     AS works,
              (SELECT COUNT(*) FROM purchases pu WHERE pu.user_id = u.id)   AS purchases
         FROM users u
        ORDER BY u.id DESC`
    );

    const q = String(req.query.q || '').trim().toLowerCase();
    let filtered = q
      ? rows.filter((u) => [u.name, u.email, u.city].some((v) => String(v || '').toLowerCase().includes(q)))
      : rows;

    if (req.query.role) filtered = filtered.filter((u) => u.role === req.query.role);
    if (req.query.admin !== undefined) {
      const wantAdmin = req.query.admin === '1';
      filtered = filtered.filter((u) => Boolean(u.is_admin) === wantAdmin);
    }

    const total = filtered.length;
    const { page, pageSize } = req.query;
    const start = (page - 1) * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);

    res.json({
      users: pageRows.map(serializeUser),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  })
);

// ---------------------------------------------------------------- update

/**
 * Изменение полей пользователя: роль, статус подписки, признак админа, опыт.
 *
 * Предохранители:
 *  - нельзя снять админ-права с самого себя (легко случайно закрыть себе вход);
 *  - нельзя снять права с последнего администратора, кто бы это ни делал.
 */
const patchSchema = z
  .object({
    role: z.enum(['parent', 'child']).optional(),
    subscription_status: z.enum(['trial', 'pro']).optional(),
    // Признак админа приходит настоящим булевым значением из JSON-тела.
    // `z.coerce.boolean()` брать нельзя: он считает строку "false" истиной.
    is_admin: z.boolean().optional(),
    xp_points: z.coerce.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Нет полей для обновления' });

router.patch(
  '/:id',
  validate(patchSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = await dbGet('SELECT id, is_admin FROM users WHERE id = ?', [id]);
    if (!target) throw ApiError.notFound('Пользователь не найден');

    const body = req.body;

    // Снятие админ-признака — самая опасная правка.
    if (body.is_admin === false && target.is_admin) {
      if (id === req.user.id) {
        throw ApiError.badRequest('Нельзя снять администраторские права с самого себя.');
      }
      await assertNotLastAdmin(target);
    }

    const map = {
      role: 'role',
      subscription_status: 'subscription_status',
      is_admin: 'is_admin',
      xp_points: 'xp_points',
    };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(map)) {
      if (body[key] === undefined) continue;
      const value = key === 'is_admin' ? (body[key] ? 1 : 0) : body[key];
      sets.push(`${column} = ?`);
      params.push(value);
    }
    if (!sets.length) throw ApiError.badRequest('Нет полей для обновления');

    params.push(id);
    await dbRun(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);

    const updated = await dbGet(
      `SELECT u.id, u.name, u.email, u.age, u.city, u.role, u.xp_points,
              u.subscription_status, u.is_admin, u.created_at,
              (SELECT COUNT(*) FROM user_progress p WHERE p.user_id = u.id) AS completed,
              (SELECT COUNT(*) FROM portfolio f WHERE f.user_id = u.id)     AS works,
              (SELECT COUNT(*) FROM purchases pu WHERE pu.user_id = u.id)   AS purchases
         FROM users u WHERE u.id = ?`,
      [id]
    );
    res.json({ success: true, user: serializeUser(updated) });
  })
);

// -------------------------------------------------------- reset password

/**
 * Сброс пароля администратором.
 *
 * Пароль генерируется на сервере (клиент его не присылает), хешируется bcrypt
 * с фактором 12 и возвращается в ответе ОДИН раз — админ зачитывает его
 * пользователю. Обязательно отзываем все прежние сессии: у забытого пароля
 * могли остаться живые токены, и смысл сброса — их оборвать.
 */
router.post(
  '/:id/reset-password',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
    if (!target) throw ApiError.notFound('Пользователь не найден');

    const password = generatePassword();
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    await dbRun('UPDATE users SET password = ? WHERE id = ?', [hash, id]);

    // Смена пароля обязана оборвать старые токены (сдвиг поколения).
    await revokeSessions(id);

    res.json({
      success: true,
      // Показывается ровно один раз: в базе лежит только хеш, восстановить
      // пароль потом невозможно.
      password,
      message: 'Пароль показан один раз. Передайте его пользователю и попросите сменить после входа.',
    });
  })
);

// ------------------------------------------------------- revoke sessions

/** Принудительный выход со всех устройств: сдвигаем поколение токенов. */
router.post(
  '/:id/revoke-sessions',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
    if (!target) throw ApiError.notFound('Пользователь не найден');

    await revokeSessions(id);
    res.json({ success: true });
  })
);

// ---------------------------------------------------------------- delete

/**
 * Полное удаление аккаунта вместе со всем, что ему принадлежит.
 *
 * Предохранители:
 *  - нельзя удалить самого себя;
 *  - нельзя удалить последнего администратора.
 *
 * О целостности данных.
 * Внешние ключи в схеме описаны с `ON DELETE CASCADE` для user_progress,
 * portfolio, history_logs, purchases и diagnostics_results, а сам SQLite
 * запускается с `PRAGMA foreign_keys = ON` (см. src/db/index.js) — то есть
 * каскад РЕАЛЬНО срабатывает. Тем не менее удаляем в явной транзакции: во-первых,
 * это делает намерение видимым и не зависит от того, включит ли кто-то FK в
 * будущем; во-вторых, файлы на диске каскад не трогает — их надо снять руками,
 * иначе диск засоряется «сиротами» от портфолио и аватаров.
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const target = await dbGet('SELECT id, is_admin, avatar FROM users WHERE id = ?', [id]);
    if (!target) throw ApiError.notFound('Пользователь не найден');

    if (id === req.user.id) {
      throw ApiError.badRequest('Нельзя удалить собственный аккаунт из панели управления.');
    }
    await assertNotLastAdmin(target);

    // Сначала собираем пути к файлам на диске (портфолио + аватар), пока строки
    // ещё существуют. Удаляем файлы ПОСЛЕ успешного коммита, чтобы не потерять
    // их при откате транзакции.
    const works = await dbAll('SELECT image FROM portfolio WHERE user_id = ?', [id]);
    const diskFiles = [
      ...works.map((w) => uploadPathOf(w.image)),
      uploadPathOf(target.avatar),
    ].filter(Boolean);

    await withTransaction(async () => {
      // Явное удаление зависимостей — на случай, если FK когда-нибудь отключат.
      // Порядок: сначала дочерние строки, затем сам пользователь.
      await dbRun('DELETE FROM user_progress WHERE user_id = ?', [id]);
      await dbRun('DELETE FROM portfolio WHERE user_id = ?', [id]);
      await dbRun('DELETE FROM history_logs WHERE user_id = ?', [id]);
      await dbRun('DELETE FROM purchases WHERE user_id = ?', [id]);
      await dbRun('DELETE FROM diagnostics_results WHERE user_id = ?', [id]);
      await dbRun('DELETE FROM users WHERE id = ?', [id]);
    });

    // База очищена — теперь можно спокойно снять файлы с диска.
    await Promise.all(diskFiles.map(removeFileQuiet));

    res.json({ success: true });
  })
);

module.exports = router;
