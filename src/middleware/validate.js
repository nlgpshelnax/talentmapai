'use strict';

const { z } = require('zod');
const { ApiError } = require('./error');

/**
 * Body/query validation. The prototype validated nothing, so malformed input
 * reached SQL directly and produced 500s (or silently wrote junk rows).
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.') || '(корень)',
        message: i.message,
      }));
      return next(ApiError.badRequest('Проверьте правильность заполнения полей', details));
    }
    req[source] = result.data;
    next();
  };
}

// ---- Reusable field schemas -------------------------------------------------

const email = z
  .string()
  .trim()
  .min(1, 'Укажите email')
  .max(254, 'Слишком длинный email')
  .email('Некорректный email')
  .toLowerCase();

const password = z
  .string()
  .min(8, 'Пароль должен быть не короче 8 символов')
  .max(128, 'Слишком длинный пароль');

const name = z.string().trim().min(2, 'Имя должно быть не короче 2 символов').max(60, 'Слишком длинное имя');

const age = z.coerce.number().int().min(3, 'Возраст от 3 лет').max(18, 'Возраст до 18 лет');

const city = z.string().trim().min(2, 'Укажите город').max(80, 'Слишком длинное название города');

const pin = z
  .string()
  .regex(/^\d{4}$/, 'PIN-код должен состоять из 4 цифр');

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Ссылка должна начинаться с http:// или https://')
  .optional()
  .default('');

module.exports = { validate, z, fields: { email, password, name, age, city, pin, optionalUrl } };
