'use strict';

const bcrypt = require('bcrypt');

const config = require('../config');
const { dbRun, dbGet, dbAll, withTransaction } = require('./index');
const { seedCities } = require('./cities');
const { seedVenues } = require('./venues');

const contentA = require('./content-a');
const contentB = require('./content-b');

/** All 14 constellations: the 10 from the specification merged with the 4
 *  extra directions that existed in the live prototype database, so nothing
 *  the client had already authored is lost. */
const CONTENT = [...contentA, ...contentB];

// ---------------------------------------------------------------- layout

/**
 * Constellations are laid out on a grid. Star coordinates in the content files
 * are offsets from their constellation's centre (±150), so a 620×560 cell
 * guarantees clusters never collide — the prototype had hand-tuned absolute
 * coordinates that overlapped once new constellations were added.
 */
const GRID = { cols: 4, cellW: 620, cellH: 560, originX: 340, originY: 300 };

function centreFor(index) {
  const col = index % GRID.cols;
  const row = Math.floor(index / GRID.cols);
  return {
    x: GRID.originX + col * GRID.cellW,
    y: GRID.originY + row * GRID.cellH,
  };
}

// ------------------------------------------------------------ store items

const STORE_ITEMS = [
  { code: 'avatar_cosmonaut', title: 'Аватар «Космонавт»', description: 'Шлем, скафандр и готовность к любому запуску.', price: 100, type: 'avatar', icon: '👨‍🚀', payload: '👨‍🚀', sort_order: 1 },
  { code: 'avatar_alien', title: 'Аватар «Пришелец»', description: 'Для тех, кто мыслит нестандартно.', price: 100, type: 'avatar', icon: '👽', payload: '👽', sort_order: 2 },
  { code: 'frame_gold', title: 'Золотая рамка', description: 'Золотое обрамление аватара и работ в портфолио.', price: 150, type: 'frame', icon: '🖼️', payload: 'gold', sort_order: 3 },
  { code: 'title_star_lord', title: 'Звание «Звёздный Лорд»', description: 'Титул рядом с именем во всём приложении.', price: 200, type: 'title', icon: '⭐', payload: 'Звёздный Лорд', sort_order: 4 },
  // Extras beyond the required four, so the store keeps rewarding progress.
  { code: 'avatar_robot', title: 'Аватар «Робот»', description: 'Собран из шестерёнок и любопытства.', price: 100, type: 'avatar', icon: '🤖', payload: '🤖', sort_order: 5 },
  { code: 'frame_comet', title: 'Кометная рамка', description: 'Бирюзовое свечение вокруг аватара.', price: 150, type: 'frame', icon: '☄️', payload: 'comet', sort_order: 6 },
  { code: 'title_explorer', title: 'Звание «Исследователь галактики»', description: 'Для тех, кто открыл сразу несколько направлений.', price: 200, type: 'title', icon: '🔭', payload: 'Исследователь галактики', sort_order: 7 },
];

async function seedStore() {
  for (const item of STORE_ITEMS) {
    await dbRun(
      `INSERT INTO store_items (code, title, description, price, type, icon, payload, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         title = excluded.title, description = excluded.description, price = excluded.price,
         type = excluded.type, icon = excluded.icon, payload = excluded.payload,
         sort_order = excluded.sort_order`,
      [item.code, item.title, item.description, item.price, item.type, item.icon, item.payload, item.sort_order]
    );
  }
}

// ----------------------------------------------------------- graph content

async function seedConstellations() {
  const existing = await dbGet('SELECT COUNT(*) AS n FROM constellations');
  if (existing.n > 0) return { skipped: true };

  await withTransaction(async () => {
    for (const [index, con] of CONTENT.entries()) {
      const centre = centreFor(index);

      // `key` is the stable identifier the recommendation engine matches on;
      // ids shift between installs, keys do not.
      const { lastID: constellationId } = await dbRun(
        `INSERT INTO constellations (key, name, description_for_ai, x, y, stroke, accent, icon, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [con.key, con.name, con.descriptionForAi, centre.x, centre.y, con.stroke, con.accent, con.icon, index]
      );

      const starIds = [];
      for (const [starIndex, star] of con.stars.entries()) {
        const { lastID: starId } = await dbRun(
          `INSERT INTO stars (constellation_id, name, level, x, y, description, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            constellationId,
            star.name,
            star.level,
            centre.x + star.dx,
            centre.y + star.dy,
            star.description,
            starIndex,
          ]
        );
        starIds.push(starId);

        for (const type of ['offline', 'online', 'tool']) {
          const r = star.resources[type];
          if (!r) continue;
          await dbRun(
            `INSERT INTO resources (star_id, type, title, detail1, detail2, link, city)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [starId, type, r.title, r.detail1, r.detail2, r.link, r.city || 'Все города']
          );
        }
      }

      // Linear learning path: each skill unlocks the next.
      for (let i = 0; i < starIds.length - 1; i++) {
        await dbRun('INSERT OR IGNORE INTO star_edges (parent_star_id, child_star_id) VALUES (?, ?)', [
          starIds[i],
          starIds[i + 1],
        ]);
      }
    }
  });

  return { skipped: false, constellations: CONTENT.length };
}

// -------------------------------------------------------------- accounts

async function seedAdmin() {
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [config.admin.email]);
  if (existing) {
    await dbRun('UPDATE users SET is_admin = 1 WHERE id = ?', [existing.id]);
    return existing.id;
  }
  const hash = await bcrypt.hash(config.admin.password, 12);
  const { lastID } = await dbRun(
    `INSERT INTO users (name, email, password, role, is_admin, onboarded, subscription_status)
     VALUES (?, ?, ?, 'parent', 1, 1, 'pro')`,
    ['Администратор', config.admin.email, hash]
  );
  return lastID;
}

/**
 * Wrap a value in guillemets for a log line, but only if it is not already
 * quoted. Store titles like `Аватар «Космонавт»` carry their own « », so
 * wrapping them again produces broken nesting («…«…»…»). When the value is
 * already quoted we leave it as-is; otherwise we add the outer « ».
 */
function quoteValue(value) {
  const s = String(value ?? '');
  return /[«»]/.test(s) ? s : `«${s}»`;
}

/**
 * SQLite stores history timestamps as "YYYY-MM-DD HH:MM:SS" in UTC (the
 * column default is `datetime('now')`). This renders a Date the same way so a
 * seeded row is indistinguishable from one the app writes at runtime.
 */
function sqliteUtc(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Staggered timestamps for seeded history. Every row used to be written with
 * `datetime('now')`, so the activity feed showed the same minute on every line
 * and looked fake. This spreads events across recent history: each successive
 * seeded event is more recent than the last, so — because the feed sorts by
 * descending id (newest first) — creation order matches chronological order.
 */
function makeHistoryClock({ start, stepHours }) {
  let cursor = start; // ms before "now" applied to the FIRST-created event
  return () => {
    const at = sqliteUtc(new Date(Date.now() - cursor));
    cursor = Math.max(0, cursor - stepHours * 3600 * 1000);
    return at;
  };
}

/**
 * Demo account from the specification: София, 9 лет, Москва.
 * Seeded with a little progress so the map, portfolio and history all have
 * something to show on a fresh install.
 */
async function seedDemoUser() {
  const existing = await dbGet('SELECT id FROM users WHERE email = ?', [config.demo.email]);
  if (existing) return existing.id;

  const hash = await bcrypt.hash(config.demo.password, 12);

  const graphics = await dbGet("SELECT id FROM constellations WHERE key = 'computer-graphics'");
  const design = await dbGet("SELECT id FROM constellations WHERE key = 'design-project'");
  const recommended = [graphics?.id, design?.id].filter(Boolean);

  const { lastID: userId } = await dbRun(
    `INSERT INTO users (name, email, password, age, city, weekly_hours, role, xp_points,
                        subscription_status, recommended_graph_id, recommended_graphs, onboarded)
     VALUES (?, ?, ?, 9, 'Москва', '3-5 часов', 'child', 100, 'trial', ?, ?, 1)`,
    [ 'София', config.demo.email, hash, recommended[0] || null, JSON.stringify(recommended) ]
  );

  const firstStars = await dbAll(
    'SELECT id, name FROM stars WHERE constellation_id = ? ORDER BY order_index LIMIT 2',
    [recommended[0]]
  );

  // Spread the seeded history across the last few days (oldest event first,
  // each next one more recent) so the feed reads like real activity.
  const nextLogTime = makeHistoryClock({ start: 72 * 3600 * 1000, stepHours: 28 });

  for (const star of firstStars) {
    await dbRun('INSERT OR IGNORE INTO user_progress (user_id, star_id) VALUES (?, ?)', [userId, star.id]);
    await dbRun('INSERT INTO history_logs (user_id, log_text, created_at) VALUES (?, ?, ?)', [
      userId,
      `Отмечен выполненным шаг: ${quoteValue(star.name)}. Получено ${config.gamification.xpPerStar} XP!`,
      nextLogTime(),
    ]);
  }

  if (firstStars[1]) {
    await dbRun(
      `INSERT INTO portfolio (user_id, title, star_id, image, comment, verified_by_ai, ai_feedback)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [
        userId,
        'Мой первый коллаж «КосмоКот»',
        firstStars[1].id,
        '/img/demo/collage.svg',
        'Собрала из пяти разных фотографий. Научилась делать маски и полупрозрачность.',
        'Отличная работа! Идея читается сразу, а это самое сложное в творческой работе. В следующий раз попробуй поиграть с контрастом.',
      ]
    );
  }

  await dbRun('INSERT INTO history_logs (user_id, log_text, created_at) VALUES (?, ?, ?)', [
    userId,
    'Успешно пройдена диагностика интересов.',
    nextLogTime(),
  ]);

  return userId;
}

async function seedAll() {
  const graph = await seedConstellations();
  await seedCities();
  await seedVenues();
  await seedStore();
  await seedAdmin();
  await seedDemoUser();

  const counts = await dbGet(`
    SELECT (SELECT COUNT(*) FROM constellations) AS constellations,
           (SELECT COUNT(*) FROM stars)          AS stars,
           (SELECT COUNT(*) FROM resources)      AS resources,
           (SELECT COUNT(*) FROM star_edges)     AS edges,
           (SELECT COUNT(*) FROM store_items)    AS store,
           (SELECT COUNT(*) FROM cities)         AS cities,
           (SELECT COUNT(*) FROM venues)         AS venues,
           (SELECT COUNT(*) FROM users)          AS users,
           (SELECT COUNT(DISTINCT city) FROM venues) AS venueCities
  `);

  if (!graph.skipped) {
    console.log(
      `[seed] создано: ${counts.constellations} созвездий, ${counts.stars} звёзд, ` +
        `${counts.edges} связей, ${counts.resources} ресурсов, ${counts.store} товаров, ` +
        `${counts.venues} площадок в ${counts.venueCities} городах`
    );
  }
  return counts;
}

module.exports = { seedAll, CONTENT, STORE_ITEMS, centreFor };
