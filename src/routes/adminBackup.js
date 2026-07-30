'use strict';

const express = require('express');

const { dbAll, dbGet, dbRun, withTransaction } = require('../db');
const { asyncHandler, ApiError } = require('../middleware/error');
const { validate, z } = require('../middleware/validate');

const router = express.Router();

/**
 * Резервные копии и выгрузка данных.
 *
 * Восстановление после сбоя важнее любой другой меры безопасности: от взлома
 * страдает репутация, от потери базы — весь продукт. Раньше единственным
 * способом сохранить данные было зайти на сервер и скопировать файл, то есть
 * владелец без доступа к консоли не мог сделать копию вообще.
 *
 * Копия делится на две части, и это принципиально:
 *   • содержимое — учебная программа, каталог площадок, магазин, города.
 *     Это то, что владелец наполняет руками и чего будет очень жалко;
 *   • люди — аккаунты, прогресс, работы, история.
 *
 * Выгружать людей одним нажатием и складывать в браузер администратора —
 * плохая идея: это персональные данные детей. Поэтому по умолчанию выгружается
 * только содержимое, а выгрузка людей требует отдельного подтверждения и
 * никогда не включает хеши паролей и PIN-коды.
 */

/** Версия формата. Пригодится, когда схема изменится. */
const FORMAT_VERSION = 1;

/* ────────────────────────────────────────────────────────── выгрузка */

/** Таблицы содержимого: то, что наполняет владелец. */
const CONTENT_TABLES = [
  ['constellations', 'SELECT * FROM constellations ORDER BY sort_order, id'],
  ['stars', 'SELECT * FROM stars ORDER BY constellation_id, order_index, id'],
  ['star_edges', 'SELECT * FROM star_edges ORDER BY parent_star_id, child_star_id'],
  ['resources', 'SELECT * FROM resources ORDER BY star_id, type, id'],
  ['venues', 'SELECT * FROM venues ORDER BY sort_order, id'],
  ['store_items', 'SELECT * FROM store_items ORDER BY sort_order, id'],
  ['cities', 'SELECT * FROM cities ORDER BY sort_order, name'],
];

const exportQuery = z.object({
  // Персональные данные выгружаются только по явному требованию.
  includeUsers: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});

router.get(
  '/export',
  validate(exportQuery, 'query'),
  asyncHandler(async (req, res) => {
    const dump = {
      format: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      includesPersonalData: req.query.includeUsers,
      content: {},
    };

    for (const [name, sql] of CONTENT_TABLES) {
      dump.content[name] = await dbAll(sql);
    }

    if (req.query.includeUsers) {
      /**
       * Хеши паролей и PIN-кодов не выгружаются никогда.
       *
       * Файл копии окажется в загрузках чьего-то ноутбука, в почте, в облаке.
       * Хеш bcrypt — не открытый пароль, но это всё же материал для перебора,
       * и утечка такого файла означает утечку учётных данных. Восстановление
       * без паролей означает, что людям придётся их сбросить, — это
       * приемлемая цена.
       */
      dump.people = {
        users: await dbAll(
          `SELECT id, name, email, age, city, weekly_hours, role, avatar, xp_points,
                  subscription_status, recommended_graph_id, recommended_graphs,
                  equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
                  created_at
             FROM users ORDER BY id`
        ),
        user_progress: await dbAll('SELECT * FROM user_progress ORDER BY user_id, star_id'),
        portfolio: await dbAll('SELECT * FROM portfolio ORDER BY user_id, id'),
        purchases: await dbAll('SELECT * FROM purchases ORDER BY user_id, item_id'),
        history_logs: await dbAll('SELECT * FROM history_logs ORDER BY user_id, id'),
        diagnostics_results: await dbAll('SELECT * FROM diagnostics_results ORDER BY user_id, id'),
      };
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    /**
     * Имя файла в двух видах.
     *
     * Заголовки HTTP передаются в latin-1: кириллица в Content-Disposition
     * роняет ответ с ошибкой «Invalid character in header content». Поэтому
     * латиницей — для совместимости, и вторым параметром по RFC 5987 —
     * настоящее русское имя, которое поймёт любой современный браузер.
     */
    const asciiName = `talentmap-${req.query.includeUsers ? 'full' : 'content'}-${stamp}.json`;
    const humanName = `talentmap-${req.query.includeUsers ? 'полная' : 'содержимое'}-${stamp}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(humanName)}`
    );
    res.send(JSON.stringify(dump, null, 2));
  })
);

/* ────────────────────────────────────────────────────────── сводка */

/** Что сейчас в базе — чтобы владелец видел, что именно он сохраняет. */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const counts = await dbGet(`
      SELECT (SELECT COUNT(*) FROM constellations)      AS constellations,
             (SELECT COUNT(*) FROM stars)               AS stars,
             (SELECT COUNT(*) FROM star_edges)          AS edges,
             (SELECT COUNT(*) FROM resources)           AS resources,
             (SELECT COUNT(*) FROM venues)              AS venues,
             (SELECT COUNT(DISTINCT city) FROM venues)  AS venueCities,
             (SELECT COUNT(*) FROM store_items)         AS storeItems,
             (SELECT COUNT(*) FROM cities)              AS cities,
             (SELECT COUNT(*) FROM users)               AS users,
             (SELECT COUNT(*) FROM portfolio)           AS works,
             (SELECT COUNT(*) FROM user_progress)       AS completions
    `);
    res.json(counts);
  })
);

/* ──────────────────────────────────────────────────────── загрузка */

/**
 * Восстановление содержимого из файла копии.
 *
 * Это разрушительная операция: содержимое заменяется целиком. Поэтому нужен
 * явный `confirm`, а не просто нажатие кнопки — случайный клик по «Восстановить»
 * не должен стирать полгода работы.
 *
 * Люди из копии НЕ восстанавливаются никогда. Восстановить аккаунты без паролей
 * и с чужими идентификаторами — значит получить базу, в которую никто не может
 * войти, но которая выглядит наполненной. Хуже пустой.
 */
const importSchema = z.object({
  confirm: z.literal('ВОССТАНОВИТЬ', {
    errorMap: () => ({ message: 'Для подтверждения введите слово ВОССТАНОВИТЬ' }),
  }),
  dump: z.object({
    format: z.number().int(),
    content: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
  }),
});

/** Колонки берём из самой базы: так копия переживёт добавление полей. */
async function columnsOf(table) {
  const info = await dbAll(`PRAGMA table_info(${table})`);
  return info.map((c) => c.name);
}

router.post(
  '/import',
  validate(importSchema),
  asyncHandler(async (req, res) => {
    const { dump } = req.body;

    if (dump.format !== FORMAT_VERSION) {
      throw ApiError.badRequest(
        `Файл сделан другой версией приложения (формат ${dump.format}, ожидается ${FORMAT_VERSION}).`
      );
    }

    const known = CONTENT_TABLES.map(([name]) => name);
    const unknown = Object.keys(dump.content).filter((t) => !known.includes(t));
    if (unknown.length) {
      throw ApiError.badRequest(`В файле есть неизвестные разделы: ${unknown.join(', ')}`);
    }

    const restored = {};

    await withTransaction(async () => {
      /**
       * Порядок удаления обратен порядку создания: сначала то, что ссылается,
       * потом то, на что ссылаются. Иначе внешние ключи не дадут стереть.
       */
      for (const table of [...known].reverse()) {
        await dbRun(`DELETE FROM ${table}`);
      }

      for (const [table] of CONTENT_TABLES) {
        const rows = dump.content[table] || [];
        if (!rows.length) {
          restored[table] = 0;
          continue;
        }

        // Берём только те колонки, которые есть и в файле, и в текущей схеме:
        // копия из старой версии не должна ронять восстановление.
        const available = await columnsOf(table);
        const columns = Object.keys(rows[0]).filter((c) => available.includes(c));
        if (!columns.length) throw ApiError.badRequest(`Раздел «${table}» не совпадает со схемой базы`);

        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        for (const row of rows) {
          await dbRun(sql, columns.map((c) => row[c] ?? null));
        }
        restored[table] = rows.length;
      }
    });

    res.json({
      success: true,
      restored,
      note: 'Восстановлено только содержимое. Аккаунты, прогресс и работы не затронуты.',
    });
  })
);

module.exports = router;
