'use strict';

const jwt = require('jsonwebtoken');

const config = require('../config');
const { dbGet } = require('../db');
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
    payload = jwt.verify(token, config.jwt.secret);
  } catch {
    throw ApiError.unauthorized('Сессия истекла, войдите заново');
  }

  const user = await dbGet(
    `SELECT id, name, email, age, city, weekly_hours, role, avatar,
            xp_points, subscription_status, recommended_graph_id, recommended_graphs,
            equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
            parent_pin IS NOT NULL AS has_pin
       FROM users WHERE id = ?`,
    [payload.userId]
  );

  if (!user) throw ApiError.unauthorized('Пользователь не найден');
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

function signToken(userId) {
  return jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

module.exports = { requireAuth, optionalAuth, requireAdmin, signToken };
