'use strict';

const { z } = require('zod');
const { ApiError } = require('./error');
const { cleanText, plainText, safeUrl, graphemeLength, isZalgo } = require('../utils/sanitize');

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

/**
 * Одностраничные текстовые поля (имя, город) чистятся ПЕРЕД проверкой длины.
 * Порядок критичен: если сначала мерить длину, строку из 2 «настоящих» букв,
 * добитую 200 zero-width символами, можно протащить мимо max-cap, а в БД лягут
 * невидимки. Поэтому:
 *   1) .transform(cleanText) — NFC, снятие невидимок/bidi/управляющих, пробелы;
 *   2) .superRefine — длина В ГРАФЕМАХ (эмодзи-семья = 1 символ) и анти-Zalgo.
 *
 * `.trim()` на входе оставлен намеренно (дешёвая обрезка до тяжёлой обработки);
 * cleanText всё равно сделает финальную нормализацию пробелов.
 */
function oneLineText({ min, max, minMsg, maxMsg, emptyMsg }) {
  return z
    .string()
    /**
     * Имя и город — это обычный текст, разметки в них не бывает никогда.
     * `cleanText` снимает невидимки и управляющие символы, но теги оставляет,
     * поэтому здесь нужен `plainText`. React экранирует вывод, так что прямой
     * угрозы исполнения нет, — но имя вида `<img src=x onerror=…>` уходит
     * дальше в места, где экранирования нет: в письма, в отчёты на печать и в
     * запрос к языковой модели. Хранить разметку в имени незачем.
     */
    .transform((v) => plainText(v))
    .superRefine((v, ctx) => {
      const len = graphemeLength(v);
      if (min && len < min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: minMsg || emptyMsg || `Не короче ${min} символов` });
      }
      if (max && len > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: maxMsg || `Слишком длинное значение` });
      }
      if (isZalgo(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Недопустимые символы' });
      }
    });
}

const name = oneLineText({
  min: 2,
  max: 60,
  minMsg: 'Имя должно быть не короче 2 символов',
  maxMsg: 'Слишком длинное имя',
});

const age = z.coerce.number().int().min(3, 'Возраст от 3 лет').max(18, 'Возраст до 18 лет');

const city = oneLineText({
  min: 2,
  max: 80,
  minMsg: 'Укажите город',
  maxMsg: 'Слишком длинное название города',
});

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

// ---- Новые переиспользуемые поля для маршрутов ------------------------------

/**
 * Однострочный «обычный текст» без разметки. Санитайзинг (снятие тегов,
 * декодирование сущностей один раз, гашение CSV-префикса) идёт ДО проверки
 * длины в графемах. Подходит для названий работ, заголовков ресурсов и т.п.
 */
function plainTextField(max, { min = 0, minMsg, maxMsg } = {}) {
  return z
    .string()
    .transform((v) => plainText(v))
    .superRefine((v, ctx) => {
      const len = graphemeLength(v);
      if (min && len < min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: minMsg || `Не короче ${min} символов` });
      }
      if (max && len > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: maxMsg || 'Слишком длинный текст' });
      }
      if (isZalgo(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Недопустимые символы' });
      }
    });
}

/**
 * Многострочный текст: сохраняет переводы строк (\n) и табуляцию, но чистит
 * невидимки/bidi/управляющие, схлопывает 3+ пустых строк в одну, снимает теги.
 * Для комментариев к портфолио и описаний. Длина — в графемах, после чистки.
 */
function multilineTextField(max, { min = 0, minMsg, maxMsg } = {}) {
  return z
    .string()
    .transform((v) => {
      // Многострочная чистка + снятие разметки с сохранением переводов строк.
      let out = cleanText(v, { multiline: true });
      out = out.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
      return out;
    })
    .superRefine((v, ctx) => {
      const len = graphemeLength(v);
      if (min && len < min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: minMsg || `Не короче ${min} символов` });
      }
      if (max && len > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: maxMsg || 'Слишком длинный текст' });
      }
      if (isZalgo(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Недопустимые символы' });
      }
    });
}

/**
 * Безопасная http(s)-ссылка. Пропускает только то, что прошло safeUrl()
 * (разбор через new URL, белый список схем, без встроенных кредов, без
 * протокол-относительных), и возвращает нормализованную форму. Пустую строку
 * оставляем пустой (поле опциональное). Максимум 500 символов на сырой вход,
 * чтобы не гонять URL-парсер по мусору.
 */
const safeHttpUrl = z
  .string()
  .trim()
  .max(500, 'Слишком длинная ссылка')
  .transform((v, ctx) => {
    if (v === '') return '';
    const clean = safeUrl(v);
    if (!clean) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Недопустимая ссылка: разрешены только http:// и https://',
      });
      return z.NEVER;
    }
    return clean;
  });

module.exports = {
  validate,
  z,
  fields: {
    email,
    password,
    name,
    age,
    city,
    pin,
    optionalUrl,
    // новые
    plainText: plainTextField,
    multilineText: multilineTextField,
    safeHttpUrl,
  },
};
