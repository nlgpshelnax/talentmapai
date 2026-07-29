'use strict';

/**
 * Destructive reseed: drops all content + accounts and rebuilds from the
 * seed files. Used by `npm run seed`. Never called by the server itself.
 */

const { dbRun, close } = require('./index');
const { createSchema } = require('./schema');
const { seedAll } = require('./seed');

const TABLES = [
  'purchases',
  'diagnostics_results',
  'history_logs',
  'portfolio',
  'user_progress',
  'resources',
  'star_edges',
  'stars',
  'constellations',
  'store_items',
  'cities',
  'users',
];

async function main() {
  const keepUsers = process.argv.includes('--keep-users');

  await createSchema();

  await dbRun('PRAGMA foreign_keys = OFF');
  for (const table of TABLES) {
    if (keepUsers && table === 'users') continue;
    if (!/^[a-z_][a-z0-9_]*$/i.test(table)) throw new Error(`Недопустимое имя таблицы: ${table}`);
    await dbRun(`DELETE FROM ${table}`);
  }
  await dbRun("DELETE FROM sqlite_sequence WHERE name IN ('" + TABLES.join("','") + "')");
  await dbRun('PRAGMA foreign_keys = ON');

  const counts = await seedAll();
  console.log('[reseed] готово:', counts);
  await close();
}

main().catch((err) => {
  console.error('[reseed] ошибка:', err);
  process.exit(1);
});
