'use strict';

const express = require('express');
const { z } = require('zod');

const { dbAll, dbGet } = require('../db');
const { asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { publicVenue } = require('../utils/serialize');

const router = express.Router();

/** Площадки, доступные из любого города: олимпиады, онлайн-школы, конкурсы. */
const ANYWHERE = ['Вся Россия', 'Онлайн'];

const query = z.object({
  constellationId: z.coerce.number().int().positive().optional(),
  key: z.string().trim().max(64).optional(),
  city: z.string().trim().max(80).optional(),
});

/**
 * Где заниматься очно.
 *
 * Ответ разложен на три корзины, потому что это три разных ответа родителю:
 * «вот куда сходить», «очного рядом нет, но есть в соседнем городе» и
 * «можно участвовать откуда угодно». Раньше офлайн-ресурс был один на навык, с
 * жёстко вшитым городом, и для 13 городов из 14 экран был просто пустым.
 */
router.get(
  '/',
  requireAuth,
  validate(query, 'query'),
  asyncHandler(async (req, res) => {
    const { constellationId, key } = req.query;

    let constellationKey = key;
    if (!constellationKey && constellationId) {
      const row = await dbGet('SELECT key FROM constellations WHERE id = ?', [constellationId]);
      constellationKey = row?.key;
    }

    // Город берём из запроса, иначе из профиля: ребёнок мог не заполнить его.
    const city = (req.query.city || req.user.city || '').trim();

    const rows = await dbAll('SELECT * FROM venues ORDER BY sort_order, id');
    const all = rows.map(publicVenue).filter((v) => !constellationKey || v.directions.includes(constellationKey));

    const anywhere = all.filter((v) => ANYWHERE.includes(v.city));
    const placed = all.filter((v) => !ANYWHERE.includes(v.city));

    // Сравнение городов без учёта регистра: SQLite LIKE не работает с кириллицей,
    // поэтому фильтруем в JS — тот же приём, что в поиске по городам.
    const same = (a, b) => a.toLocaleLowerCase('ru') === b.toLocaleLowerCase('ru');
    const local = city ? placed.filter((v) => same(v.city, city)) : [];
    const elsewhere = city ? placed.filter((v) => !same(v.city, city)) : placed;

    res.json({
      city: city || null,
      local,
      elsewhere,
      anywhere,
      totals: { local: local.length, elsewhere: elsewhere.length, anywhere: anywhere.length },
    });
  })
);

module.exports = router;
