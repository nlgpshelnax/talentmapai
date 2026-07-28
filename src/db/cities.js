'use strict';

const { dbAll, dbGet, dbRun } = require('./index');

/**
 * Reference list of cities.
 *
 * The TZ asks the admin panel to manage cities alongside workshops, so the list
 * lives in the database rather than being hardcoded in the diagnostics route.
 * It drives the city autocomplete during onboarding and the city field on
 * offline resources.
 */
const DEFAULT_CITIES = [
  'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород',
  'Челябинск', 'Самара', 'Уфа', 'Ростов-на-Дону', 'Омск', 'Красноярск', 'Воронеж', 'Пермь',
  'Волгоград', 'Краснодар', 'Саратов', 'Тюмень', 'Тольятти', 'Ижевск', 'Барнаул', 'Ульяновск',
  'Иркутск', 'Хабаровск', 'Ярославль', 'Владивосток', 'Махачкала', 'Томск', 'Оренбург',
  'Кемерово', 'Новокузнецк', 'Рязань', 'Астрахань', 'Пенза', 'Липецк', 'Тула', 'Киров',
  'Чебоксары', 'Калининград', 'Курск', 'Сочи', 'Ставрополь', 'Тверь', 'Магнитогорск', 'Брянск',
];

async function seedCities() {
  const row = await dbGet('SELECT COUNT(*) AS n FROM cities');
  if (row.n > 0) return { skipped: true };

  for (const [index, name] of DEFAULT_CITIES.entries()) {
    await dbRun('INSERT OR IGNORE INTO cities (name, sort_order) VALUES (?, ?)', [name, index]);
  }
  return { skipped: false, count: DEFAULT_CITIES.length };
}

async function listCities() {
  return dbAll('SELECT id, name, sort_order FROM cities ORDER BY sort_order, name');
}

/**
 * Autocomplete: prefix matches first, then substring matches.
 *
 * Filtering happens in JS rather than SQL on purpose. SQLite's LIKE and lower()
 * are ASCII-only, so `LIKE '%каз%'` never matches «Казань» — the query silently
 * returned nothing for most Russian input. The table is a few dozen rows, so a
 * JS pass costs nothing and handles Cyrillic case correctly.
 */
async function searchCities(query, limit = 8) {
  const all = await listCities();
  const q = String(query || '').trim().toLowerCase();
  if (!q) return all.slice(0, limit).map((c) => c.name);

  const matches = [];
  for (const city of all) {
    const name = city.name.toLowerCase();
    const at = name.indexOf(q);
    if (at !== -1) matches.push({ name: city.name, prefix: at === 0 ? 0 : 1, order: city.sort_order });
  }

  matches.sort((a, b) => a.prefix - b.prefix || a.order - b.order || a.name.localeCompare(b.name, 'ru'));
  return matches.slice(0, limit).map((m) => m.name);
}

module.exports = { DEFAULT_CITIES, seedCities, listCities, searchCities };
