'use strict';

const config = require('../config');

/** Error with an intended HTTP status and a user-safe Russian message. */
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
  static badRequest(msg = 'Некорректный запрос', details) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'Требуется вход в систему') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'Недостаточно прав') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'Не найдено') {
    return new ApiError(404, msg);
  }
  static conflict(msg = 'Конфликт данных') {
    return new ApiError(409, msg);
  }
  static tooLarge(msg = 'Файл слишком большой') {
    return new ApiError(413, msg);
  }
}

/** Wraps an async handler so rejected promises reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** JSON 404 for unmatched /api routes (so the SPA fallback never swallows them). */
function apiNotFound(req, res) {
  res.status(404).json({ error: 'Эндпоинт не найден', path: req.originalUrl });
}

/**
 * Central error handler. Anything unexpected becomes a generic 500 —
 * internal messages and stack traces are never sent to the client in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // multer file-size / file-type rejections
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл слишком большой' });
  }
  if (err && err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ error: 'Недопустимый тип файла. Разрешены JPEG, PNG, WebP и GIF.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Тело запроса слишком большое' });
  }

  console.error('[error]', req.method, req.originalUrl, '\n', err);

  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    ...(config.isProd ? {} : { debug: err.message }),
  });
}

module.exports = { ApiError, asyncHandler, apiNotFound, errorHandler };
