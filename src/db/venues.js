'use strict';

const { dbRun, dbGet } = require('./index');
const VENUES = require('../data/venues');

/**
 * Засев каталога площадок.
 *
 * Upsert по `code`, а не «вставить, если таблица пуста»: каталог живой, в него
 * будут добавляться новые центры, и обновление приложения не должно требовать
 * пересоздания базы. Код площадки строится как `сеть__город` и стабилен.
 */
async function seedVenues() {
  for (const [index, v] of VENUES.entries()) {
    await dbRun(
      `INSERT INTO venues (code, network, name, org, city, address, url, kind, format,
                           price_note, age_range, summary, directions, verified, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         network = excluded.network, name = excluded.name, org = excluded.org,
         city = excluded.city, address = excluded.address, url = excluded.url,
         kind = excluded.kind, format = excluded.format, price_note = excluded.price_note,
         age_range = excluded.age_range, summary = excluded.summary,
         directions = excluded.directions, verified = excluded.verified,
         sort_order = excluded.sort_order`,
      [
        v.code,
        v.network || '',
        v.name,
        v.org || null,
        v.city,
        v.address || null,
        v.url || null,
        v.kind || 'commercial',
        v.format || 'offline',
        v.priceNote || null,
        v.ageRange || null,
        v.summary || null,
        JSON.stringify(v.directions || []),
        v.verified ? 1 : 0,
        v.sortOrder ?? index,
      ]
    );
  }

  const { n } = await dbGet('SELECT COUNT(*) AS n FROM venues');
  return n;
}

module.exports = { seedVenues, VENUES };
