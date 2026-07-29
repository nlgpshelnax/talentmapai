'use strict';

const jwt = require('jsonwebtoken');

const config = require('../config');
const { dbGet, dbRun } = require('../db');
const { ApiError, asyncHandler } = require('./error');

/**
 * THE core security fix.
 *
 * The prototype defined an auth middleware and then never mounted it, while every
 * handler read `req.body.userId` and fell back to user 1. That meant any caller
 * could read or mutate any account, and the whole admin API was public.
 *
 * Here identity comes from the signed token and nowhere else. Handlers must use
 * `req.user.id`; a `userId` supplied by the client is ignored everywhere.
 */

function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, value] = header.split(' ');
  if (scheme && /^Bearer$/i.test(scheme) && value) return value.trim();
  return null;
}

/** Loads the user fresh from the DB so role/subscription changes take effect immediately. */
async function loadUser(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, {
      // Алгоритм фиксируем явно. Библиотека проверяет подпись тем алгоритмом,
      // который назван в самом токене, — а его выбирает тот, кто токен прислал.
      // Без этого ограничения возможна классическая подмена алгоритма.
      algorithms: ['HS256'],
    });
  } catch {
    throw ApiError.unauthorized('Сессия истекла, войдите заново');
  }

  const user = await dbGet(
    `SELECT id, name, email, age, city, weekly_hours, role, avatar,
            xp_points, subscription_status, recommended_graph_id, recommended_graphs,
            equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
            token_version,
            parent_pin IS NOT NULL AS has_pin
       FROM users WHERE id = ?`,
    [payload.userId]
  );

  if (!user) throw ApiError.unauthorized('Пользователь не найден');

  /**
   * Поколение токена.
   *
   * Смена пароля раньше выдавала новый токен, но старые продолжали работать до
   * конца своего трёхсуточного срока. То есть человек, у которого увели
   * сессию, менял пароль — и ничего не менялось: чужой доступ оставался.
   * Теперь в токене лежит номер поколения, и смена пароля его сдвигает.
   */
  if ((payload.v ?? 0) !== (user.token_version ?? 0)) {
    throw ApiError.unauthorized('Сессия больше не действительна, войдите заново');
  }

  return user;
}

/** Rejects the request unless a valid token is present. */
const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized();
  req.user = await loadUser(token);
  next();
});

/** Attaches req.user when a valid token is present, but never rejects. */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await loadUser(token);
    } catch {
      req.user = null;
    }
  }
  next();
});

/** Admin-only gate. Must be mounted after requireAuth. */
const requireAdmin = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.is_admin) return next(ApiError.forbidden('Доступ только для администратора'));
  next();
};

/**
 * Подпись токена. Поколение обязательно кладём внутрь — по нему проверка
 * решает, не отозвана ли сессия.
 */
function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ userId, v: tokenVersion }, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
  });
}

/** Отзывает все выданные сессии пользователя, сдвигая поколение. */
async function revokeSessions(userId) {
  await dbRun('UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?', [userId]);
  const row = await dbGet('SELECT token_version FROM users WHERE id = ?', [userId]);
  return row?.token_version ?? 0;
}

module.exports = { requireAuth, optionalAuth, requireAdmin, signToken, revokeSessions };
