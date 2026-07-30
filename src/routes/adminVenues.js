'use strict';

const express = require('express');

const { dbAll, dbGet, dbRun } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { validate, z, fields } = require('../middleware/validate');
const { publicVenue } = require('../utils/serialize');

const router = express.Router();

/**
 * Управление каталогом площадок (кружки, центры, школы).
 *
 * ВАЖНО: этот роутер монтируется РОДИТЕЛЕМ уже за `requireAuth` + `requireAdmin`
 * (так же, как весь остальной админский API в src/routes/admin.js). Поэтому
 * здесь эти middleware НЕ навешиваются повторно — иначе они выполнились бы
 * дважды. Дом-стиль полностью повторяет admin.js: validate(schema), asyncHandler,
 * ApiError и карта «поле → колонка» для частичного обновления.
 *
 * Прежде площадки можно было менять только пересборкой data/venues.js и
 * пересозданием базы. Клиент из своего города не мог добавить центр без
 * разработчика — эту дыру и закрывает раздел.
 */

// Допустимые значения справочных полей. Совпадают с тем, что реально лежит в
// каталоге (src/data/venues.js) и что понимает read-эндпоинт /api/venues.
const KINDS = ['state', 'nonprofit', 'university', 'commercial'];
const FORMATS = ['offline', 'hybrid', 'online'];

// ------------------------------------------------------------------ helpers

/**
 * Транслитерация кириллицы для генерации `code`. Код площадки — это стабильный
 * латинский идентификатор вида `сеть__город`; ids меняются между установками,
 * а код нет (по нему идёт upsert при засеве каталога). Русские буквы в URL-код
 * не годятся, поэтому переводим их в латиницу по стандартной схеме.
 */
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Строит slug: транслит кириллицы, всё нелатинское → дефис, схлопывание краёв. */
function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((ch) => (Object.prototype.hasOwnProperty.call(TRANSLIT, ch) ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `сеть__город` — та же схема, что и в засеве каталога (network__city). */
function buildCode(network, city) {
  const net = slugify(network) || 'venue';
  const town = slugify(city) || 'city';
  return `${net}__${town}`;
}

/**
 * Нормализует ЯВНО присланный код. В отличие от slugify, сохраняет `_`, потому
 * что коды каталога используют `__` как разделитель сеть/город. Иначе повторная
 * обработка валидного кода вида `kvantorium__kazan` схлопнула бы `__` в один `-`
 * и превратила бы его в другой код — проверка на дубликат прошла бы мимо.
 */
function normalizeCode(value) {
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((ch) => (Object.prototype.hasOwnProperty.call(TRANSLIT, ch) ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9_]+/g, '-') // всё, кроме латиницы/цифр/подчёркивания → дефис
    .replace(/^[-_]+|[-_]+$/g, ''); // обрезаем разделители по краям
}

/** Сравнение строк без учёта регистра по-русски: SQLite lower()/LIKE — только ASCII. */
const includesCi = (haystack, needle) =>
  String(haystack || '').toLocaleLowerCase('ru').includes(needle);

/**
 * Проверяет, что все ключи направлений существуют в таблице constellations.
 * Возвращает первый неизвестный ключ или null. Опечатка тут молча оставила бы
 * целое направление без площадок, поэтому отвергаем с явным указанием ключа.
 */
async function findUnknownDirection(keys) {
  const rows = await dbAll('SELECT key FROM constellations WHERE key IS NOT NULL');
  const known = new Set(rows.map((r) => r.key));
  for (const k of keys) {
    if (!known.has(k)) return k;
  }
  return null;
}

// ------------------------------------------------------------------- schemas

/**
 * Ключ направления — «обычный текст» без разметки. Реальные ключи выглядят как
 * `esports-streaming`, но существование ключа проверяется отдельно по БД
 * (findUnknownDirection): здесь только форма и защита от мусора.
 */
const directionKey = fields.plainText(64, { min: 1, minMsg: 'Пустой ключ направления' });

const directionsField = z
  .array(directionKey)
  .min(1, 'Выберите хотя бы одно направление')
  .max(30, 'Слишком много направлений');

const venueBase = {
  network: fields.plainText(120).default(''),
  name: fields.plainText(200, { min: 2, minMsg: 'Название от 2 символов' }),
  org: fields.plainText(300).optional(),
  city: fields.city, // required plain text (2..80), тот же валидатор, что и в профиле
  // Адрес необязателен. Правило каталога: пустой адрес честнее правдоподобного
  // вымысла — выдумывать его нельзя. Подсказку об этом даёт форма.
  address: fields.plainText(300).optional(),
  url: fields.safeHttpUrl, // admin-ссылки уходят в <a href>, а React не блокирует javascript:
  kind: z.enum(KINDS).default('commercial'),
  format: z.enum(FORMATS).default('offline'),
  priceNote: fields.plainText(160).optional(),
  ageRange: fields.plainText(80).optional(),
  summary: fields.multilineText(1000).optional(),
  directions: directionsField,
  verified: z.coerce.boolean().default(false),
};

const createSchema = z.object({
  ...venueBase,
  // Код можно не присылать — сгенерируем из network+city. Если прислали,
  // приводим к безопасной форме slug.
  code: z.string().trim().max(120).optional(),
});

// Частичное обновление: любое поле необязательно, но directions при передаче
// всё равно должен быть непустым валидным массивом.
const updateSchema = z
  .object({
    network: venueBase.network,
    name: venueBase.name,
    org: venueBase.org,
    city: venueBase.city,
    address: venueBase.address,
    url: venueBase.url,
    kind: venueBase.kind,
    format: venueBase.format,
    priceNote: venueBase.priceNote,
    ageRange: venueBase.ageRange,
    summary: venueBase.summary,
    directions: venueBase.directions,
    verified: venueBase.verified,
  })
  .partial();

const listQuery = z.object({
  city: z.string().trim().max(80).optional(),
  direction: z.string().trim().max(64).optional(),
  q: z.string().trim().max(120).optional(),
  verified: z.enum(['0', '1', 'true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

// ---------------------------------------------------------------------- meta

/**
 * Данные для формы: направления с человеческими названиями (не сырые ключи),
 * уже используемые города и допустимые значения kind/format. Клиент показывает
 * мульти-селект названий, а отправляет ключи — админ не должен печатать
 * `esports-streaming` руками.
 */
router.get(
  '/meta',
  asyncHandler(async (req, res) => {
    const [constellations, cityRows] = await Promise.all([
      dbAll('SELECT key, name FROM constellations WHERE key IS NOT NULL ORDER BY sort_order, name'),
      dbAll("SELECT DISTINCT city FROM venues WHERE city IS NOT NULL AND city <> '' ORDER BY city"),
    ]);

    res.json({
      directions: constellations.map((c) => ({ key: c.key, name: c.name })),
      cities: cityRows.map((r) => r.city).sort((a, b) => a.localeCompare(b, 'ru')),
      kinds: KINDS,
      formats: FORMATS,
    });
  })
);

// ---------------------------------------------------------------------- list

/**
 * Список с пагинацией и фильтрами: город, направление, свободный поиск и статус
 * «проверено».
 *
 * Критично: фильтрация по тексту и городу идёт в JS, а не в SQL. SQLite LIKE и
 * lower() работают только с ASCII — запрос `каз` никогда не совпал бы с
 * «Казань». Тот же приём уже применён в поиске по городам и пользователям
 * (см. регрессионный тест в tests/api.test.js). Каталог невелик (полторы сотни
 * строк), так что читаем всё и фильтруем в памяти.
 */
router.get(
  '/',
  validate(listQuery, 'query'),
  asyncHandler(async (req, res) => {
    const { city, direction, q, verified, page, pageSize } = req.query;

    const rows = await dbAll('SELECT * FROM venues ORDER BY sort_order, id');
    let items = rows.map(publicVenue);

    if (city) {
      const needle = city.toLocaleLowerCase('ru');
      items = items.filter((v) => v.city.toLocaleLowerCase('ru') === needle);
    }

    if (direction) {
      items = items.filter((v) => v.directions.includes(direction));
    }

    if (verified !== undefined) {
      const want = verified === '1' || verified === 'true';
      items = items.filter((v) => v.verified === want);
    }

    if (q) {
      const needle = q.toLocaleLowerCase('ru');
      items = items.filter(
        (v) => includesCi(v.name, needle) || includesCi(v.org, needle) || includesCi(v.address, needle)
      );
    }

    const total = items.length;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);

    res.json({
      venues: pageItems,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  })
);

// -------------------------------------------------------------------- create

router.post(
  '/',
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;

    const badKey = await findUnknownDirection(b.directions);
    if (badKey) {
      throw ApiError.badRequest(`Неизвестное направление: «${badKey}». Такого ключа нет в списке созвездий.`);
    }

    /**
     * Код площадки.
     *
     * Если администратор указал его сам — это осознанное решение, и совпадение
     * с существующим надо показать как ошибку. Если код генерируется из сети и
     * города, конфликт неизбежен: две площадки в одном городе без указанной
     * сети дают одинаковую основу. Ругаться на это бессмысленно — человек не
     * понимает, что за код и почему он занят. Просто подбираем свободный.
     */
    const explicitCode = b.code ? normalizeCode(b.code) : '';

    let code;
    if (explicitCode) {
      const clash = await dbGet('SELECT id FROM venues WHERE code = ?', [explicitCode]);
      if (clash) throw ApiError.conflict(`Площадка с кодом «${explicitCode}» уже существует.`);
      code = explicitCode;
    } else {
      const base = buildCode(b.network, b.city);
      code = base;
      for (let n = 2; n < 500; n++) {
        // eslint-disable-next-line no-await-in-loop
        const taken = await dbGet('SELECT id FROM venues WHERE code = ?', [code]);
        if (!taken) break;
        code = `${base}-${n}`;
      }
    }

    const max = await dbGet('SELECT COALESCE(MAX(sort_order), -1) AS m FROM venues');
    const { lastID } = await dbRun(
      `INSERT INTO venues (code, network, name, org, city, address, url, kind, format,
                           price_note, age_range, summary, directions, verified, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        b.network || '',
        b.name,
        b.org || null,
        b.city,
        b.address || null,
        b.url || null,
        b.kind,
        b.format,
        b.priceNote || null,
        b.ageRange || null,
        b.summary || null,
        JSON.stringify(b.directions),
        b.verified ? 1 : 0,
        max.m + 1,
      ]
    );

    const row = await dbGet('SELECT * FROM venues WHERE id = ?', [lastID]);
    res.status(201).json({ success: true, id: lastID, venue: publicVenue(row) });
  })
);

// -------------------------------------------------------------------- update

router.put(
  '/:id',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM venues WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Площадка не найдена');

    if (req.body.directions !== undefined) {
      const badKey = await findUnknownDirection(req.body.directions);
      if (badKey) {
        throw ApiError.badRequest(`Неизвестное направление: «${badKey}». Такого ключа нет в списке созвездий.`);
      }
    }

    // Карта «поле запроса → колонка», как в admin.js. directions и verified
    // требуют преобразования значения, остальные пишутся как есть.
    const map = {
      network: 'network',
      name: 'name',
      org: 'org',
      city: 'city',
      address: 'address',
      url: 'url',
      kind: 'kind',
      format: 'format',
      priceNote: 'price_note',
      ageRange: 'age_range',
      summary: 'summary',
    };

    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        sets.push(`${column} = ?`);
        // Пустая строка в необязательных полях → NULL (пустой адрес честнее вымысла).
        const value = req.body[key];
        params.push(value === '' && column !== 'network' ? null : value);
      }
    }
    if (req.body.directions !== undefined) {
      sets.push('directions = ?');
      params.push(JSON.stringify(req.body.directions));
    }
    if (req.body.verified !== undefined) {
      sets.push('verified = ?');
      params.push(req.body.verified ? 1 : 0);
    }

    if (!sets.length) throw ApiError.badRequest('Нет полей для обновления');

    params.push(id);
    await dbRun(`UPDATE venues SET ${sets.join(', ')} WHERE id = ?`, params);

    const row = await dbGet('SELECT * FROM venues WHERE id = ?', [id]);
    res.json({ success: true, venue: publicVenue(row) });
  })
);

// -------------------------------------------------------------------- delete

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM venues WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Площадка не найдена');

    await dbRun('DELETE FROM venues WHERE id = ?', [id]);
    res.json({ success: true });
  })
);

module.exports = router;
