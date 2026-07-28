'use strict';

const { dbRun, dbAll } = require('./index');

/**
 * Table definitions. Everything is CREATE TABLE IF NOT EXISTS so init is idempotent.
 *
 * Notable differences from the prototype schema:
 *  - users.is_admin          — the admin API is now role-gated instead of wide open.
 *  - users.parent_pin        — stores a bcrypt hash, never the 4 digits themselves.
 *  - users.equipped_*        — what the child currently wears, so store purchases
 *                              actually change their appearance across the app.
 *  - store_items / purchases — the prototype deducted XP and stored nothing,
 *                              so bought items vanished. Purchases are now persisted.
 *  - stars.description       — renamed from the prototype's `desc` (a SQL keyword).
 *  - stars.order_index       — gives each constellation a deterministic skill order,
 *                              which is what makes a single "current star" possible.
 *  - diagnostics_results     — the 12-question answers are kept, not thrown away.
 */
const TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
     id                   INTEGER PRIMARY KEY AUTOINCREMENT,
     name                 TEXT    NOT NULL,
     email                TEXT    NOT NULL UNIQUE COLLATE NOCASE,
     password             TEXT    NOT NULL,
     age                  INTEGER,
     city                 TEXT,
     weekly_hours         TEXT,
     role                 TEXT    NOT NULL DEFAULT 'parent' CHECK (role IN ('parent','child')),
     avatar               TEXT,
     parent_pin           TEXT,
     xp_points            INTEGER NOT NULL DEFAULT 0,
     subscription_status  TEXT    NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial','pro')),
     recommended_graph_id INTEGER,
     recommended_graphs   TEXT    NOT NULL DEFAULT '[]',
     equipped_avatar      TEXT,
     equipped_frame       TEXT,
     equipped_title       TEXT,
     is_admin             INTEGER NOT NULL DEFAULT 0,
     onboarded            INTEGER NOT NULL DEFAULT 0,
     created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
   )`,

  `CREATE TABLE IF NOT EXISTS constellations (
     id                 INTEGER PRIMARY KEY AUTOINCREMENT,
     key                TEXT    UNIQUE,
     name               TEXT    NOT NULL,
     description_for_ai TEXT    NOT NULL DEFAULT '',
     x                  INTEGER NOT NULL DEFAULT 0,
     y                  INTEGER NOT NULL DEFAULT 0,
     stroke             TEXT    NOT NULL DEFAULT 'rgba(99,102,241,0.28)',
     accent             TEXT    NOT NULL DEFAULT '#818cf8',
     icon               TEXT    NOT NULL DEFAULT '✨',
     sort_order         INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS stars (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     constellation_id INTEGER NOT NULL,
     name             TEXT    NOT NULL,
     level            TEXT    NOT NULL DEFAULT 'Низкий (Начальный)',
     x                INTEGER NOT NULL DEFAULT 0,
     y                INTEGER NOT NULL DEFAULT 0,
     description      TEXT    NOT NULL DEFAULT '',
     order_index      INTEGER NOT NULL DEFAULT 0,
     FOREIGN KEY (constellation_id) REFERENCES constellations(id) ON DELETE CASCADE
   )`,

  `CREATE TABLE IF NOT EXISTS star_edges (
     parent_star_id INTEGER NOT NULL,
     child_star_id  INTEGER NOT NULL,
     PRIMARY KEY (parent_star_id, child_star_id),
     FOREIGN KEY (parent_star_id) REFERENCES stars(id) ON DELETE CASCADE,
     FOREIGN KEY (child_star_id)  REFERENCES stars(id) ON DELETE CASCADE
   )`,

  `CREATE TABLE IF NOT EXISTS resources (
     id       INTEGER PRIMARY KEY AUTOINCREMENT,
     star_id  INTEGER NOT NULL,
     type     TEXT    NOT NULL CHECK (type IN ('offline','online','tool')),
     title    TEXT    NOT NULL,
     detail1  TEXT    NOT NULL DEFAULT '',
     detail2  TEXT    NOT NULL DEFAULT '',
     link     TEXT    NOT NULL DEFAULT '',
     city     TEXT    NOT NULL DEFAULT 'Все города',
     FOREIGN KEY (star_id) REFERENCES stars(id) ON DELETE CASCADE
   )`,

  `CREATE TABLE IF NOT EXISTS user_progress (
     user_id      INTEGER NOT NULL,
     star_id      INTEGER NOT NULL,
     completed_at TEXT    NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (user_id, star_id),
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     FOREIGN KEY (star_id) REFERENCES stars(id) ON DELETE CASCADE
   )`,

  `CREATE TABLE IF NOT EXISTS portfolio (
     id             INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id        INTEGER NOT NULL,
     title          TEXT    NOT NULL,
     star_id        INTEGER,
     image          TEXT    NOT NULL DEFAULT '',
     comment        TEXT    NOT NULL DEFAULT '',
     verified_by_ai INTEGER NOT NULL DEFAULT 0,
     ai_feedback    TEXT    NOT NULL DEFAULT '',
     created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     FOREIGN KEY (star_id) REFERENCES stars(id) ON DELETE SET NULL
   )`,

  `CREATE TABLE IF NOT EXISTS history_logs (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL,
     log_text   TEXT    NOT NULL,
     created_at TEXT    NOT NULL DEFAULT (datetime('now')),
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   )`,

  `CREATE TABLE IF NOT EXISTS store_items (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     code       TEXT    NOT NULL UNIQUE,
     title      TEXT    NOT NULL,
     description TEXT   NOT NULL DEFAULT '',
     price      INTEGER NOT NULL,
     type       TEXT    NOT NULL CHECK (type IN ('avatar','frame','title')),
     icon       TEXT    NOT NULL DEFAULT '✨',
     payload    TEXT    NOT NULL DEFAULT '',
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS purchases (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id      INTEGER NOT NULL,
     item_id      INTEGER NOT NULL,
     purchased_at TEXT    NOT NULL DEFAULT (datetime('now')),
     UNIQUE (user_id, item_id),
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
     FOREIGN KEY (item_id) REFERENCES store_items(id) ON DELETE CASCADE
   )`,

  `CREATE TABLE IF NOT EXISTS cities (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,

  /**
   * Реальные площадки: кружки, центры и школы, где направление можно осваивать
   * очно. Прежде «офлайн-ресурс» был один на навык и с выдуманным адресом —
   * ребёнок из Омска видел мастер-класс в Казани и больше ничего. Площадка
   * привязана к направлению и городу, а не к отдельному навыку: в студию ходят
   * учиться графике, а не «работе со слоями».
   */
  `CREATE TABLE IF NOT EXISTS venues (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     code        TEXT    NOT NULL UNIQUE,
     network     TEXT    NOT NULL DEFAULT '',
     name        TEXT    NOT NULL,
     org         TEXT,
     city        TEXT    NOT NULL,
     address     TEXT,
     url         TEXT,
     kind        TEXT    NOT NULL DEFAULT 'commercial',
     format      TEXT    NOT NULL DEFAULT 'offline',
     price_note  TEXT,
     age_range   TEXT,
     summary     TEXT,
     directions  TEXT    NOT NULL DEFAULT '[]',
     verified    INTEGER NOT NULL DEFAULT 0,
     sort_order  INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city)`,

  `CREATE TABLE IF NOT EXISTS diagnostics_results (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id    INTEGER NOT NULL,
     answers    TEXT    NOT NULL DEFAULT '{}',
     profile    TEXT    NOT NULL DEFAULT '{}',
     created_at TEXT    NOT NULL DEFAULT (datetime('now')),
     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   )`,
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_stars_constellation ON stars(constellation_id)`,
  `CREATE INDEX IF NOT EXISTS idx_resources_star      ON resources(star_id)`,
  `CREATE INDEX IF NOT EXISTS idx_progress_user       ON user_progress(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_portfolio_user      ON portfolio(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_history_user        ON history_logs(user_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_purchases_user      ON purchases(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_edges_child         ON star_edges(child_star_id)`,
];

/**
 * Additive column migrations for databases created by an older build.
 * Each is attempted independently; "duplicate column" is the expected
 * no-op outcome and is swallowed.
 */
const COLUMN_MIGRATIONS = [
  ['users', 'equipped_avatar', 'TEXT'],
  ['users', 'equipped_frame', 'TEXT'],
  ['users', 'equipped_title', 'TEXT'],
  ['users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'onboarded', 'INTEGER NOT NULL DEFAULT 0'],
  ['users', 'recommended_graphs', "TEXT NOT NULL DEFAULT '[]'"],
  ['constellations', 'key', 'TEXT'],
  ['constellations', 'accent', "TEXT NOT NULL DEFAULT '#818cf8'"],
  ['constellations', 'icon', "TEXT NOT NULL DEFAULT '✨'"],
  ['constellations', 'sort_order', 'INTEGER NOT NULL DEFAULT 0'],
  ['stars', 'order_index', 'INTEGER NOT NULL DEFAULT 0'],
];

async function createSchema() {
  for (const ddl of TABLES) await dbRun(ddl);
  for (const ddl of INDEXES) await dbRun(ddl);

  for (const [table, column, type] of COLUMN_MIGRATIONS) {
    const cols = await dbAll(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) {
      await dbRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

module.exports = { createSchema };
