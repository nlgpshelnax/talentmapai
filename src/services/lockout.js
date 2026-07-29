'use strict';

const config = require('../config');
const { dbGet, dbRun } = require('../db');

/**
 * Блокировка после серии неудачных попыток.
 *
 * Ограничение по частоте в памяти процесса защищает слабо: оно обнуляется при
 * перезапуске, а если приложение стоит без обратного прокси — обходится
 * подменой заголовка с адресом. Поэтому счётчик неудач для входа и для
 * родительского PIN живёт в базе и привязан не к адресу, а к самой цели атаки:
 * к конкретной почте и к конкретному аккаунту.
 *
 * Смысл в том, что перебор пароля от чужого ящика нельзя ускорить ни сменой
 * адреса, ни перезапуском сервера, ни распределением по ботнету.
 */

/** Ключи разведены по виду попытки, чтобы вход и PIN не мешали друг другу. */
const KIND = { LOGIN: 'login', PIN: 'pin' };

/**
 * Почту приводим к нижнему регистру, чтобы Ivan@ и ivan@ считались одной
 * целью. Иначе счётчик обнуляется сменой регистра одной буквы.
 */
function normalizeKey(kind, subject) {
  return `${kind}:${String(subject || '').trim().toLowerCase()}`;
}

/** Сколько осталось ждать, в секундах, для заголовка Retry-After. */
const secondsUntil = (ts) => Math.max(1, Math.ceil((ts - Date.now()) / 1000));

/**
 * Проверка перед попыткой. Возвращает `null`, если можно пробовать, иначе
 * объект с временем разблокировки.
 */
async function check(kind, subject) {
  const key = normalizeKey(kind, subject);
  const row = await dbGet('SELECT attempts, locked_until FROM login_attempts WHERE key = ?', [key]);
  if (!row) return null;

  const lockedUntil = row.locked_until ? Date.parse(`${row.locked_until.replace(' ', 'T')}Z`) : 0;
  if (lockedUntil > Date.now()) {
    return { lockedUntil, retryAfter: secondsUntil(lockedUntil) };
  }
  return null;
}

/**
 * Отметить неудачу. Когда попыток набралось больше порога — ставим блокировку.
 *
 * Окно скользящее: серия из семи ошибок за месяц не должна копиться в
 * блокировку, а семь ошибок за пять минут — должна.
 */
async function fail(kind, subject) {
  const key = normalizeKey(kind, subject);
  const { maxAttempts, windowMs, lockMs } = config.lockout;

  const row = await dbGet('SELECT attempts, first_at FROM login_attempts WHERE key = ?', [key]);
  const firstAt = row?.first_at ? Date.parse(`${row.first_at.replace(' ', 'T')}Z`) : 0;
  const withinWindow = firstAt && Date.now() - firstAt < windowMs;

  const attempts = withinWindow ? (row.attempts || 0) + 1 : 1;
  const lockedUntil =
    attempts >= maxAttempts ? new Date(Date.now() + lockMs).toISOString().slice(0, 19).replace('T', ' ') : null;

  await dbRun(
    `INSERT INTO login_attempts (key, attempts, first_at, locked_until)
     VALUES (?, ?, COALESCE(?, datetime('now')), ?)
     ON CONFLICT(key) DO UPDATE SET
       attempts = excluded.attempts,
       first_at = excluded.first_at,
       locked_until = excluded.locked_until`,
    [
      key,
      attempts,
      withinWindow && row?.first_at ? row.first_at : null,
      lockedUntil,
    ]
  );

  return {
    attempts,
    remaining: Math.max(0, maxAttempts - attempts),
    locked: Boolean(lockedUntil),
    retryAfter: lockedUntil ? Math.ceil(lockMs / 1000) : 0,
  };
}

/** Успешный вход стирает историю неудач по этой цели. */
async function reset(kind, subject) {
  await dbRun('DELETE FROM login_attempts WHERE key = ?', [normalizeKey(kind, subject)]);
}

/**
 * Уборка старых записей. Таблица должна оставаться маленькой: она читается на
 * каждой попытке входа, и превращать её в журнал всех неудач за год незачем.
 */
async function sweep() {
  await dbRun(
    `DELETE FROM login_attempts
      WHERE (locked_until IS NULL OR locked_until < datetime('now'))
        AND first_at < datetime('now', '-1 day')`
  );
}

module.exports = { KIND, check, fail, reset, sweep };
