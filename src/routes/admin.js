'use strict';

const express = require('express');

const { dbAll, dbGet, dbRun, withTransaction } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validate, z, fields } = require('../middleware/validate');
const { findCycle } = require('../services/graph');
const { publicConstellation, publicStar, publicResource, formatRuDate } = require('../utils/serialize');

const router = express.Router();

/**
 * EVERY route below is admin-only.
 *
 * In the prototype this entire surface was unauthenticated: any visitor could
 * POST /api/admin/graphs or DELETE a constellation and wipe the curriculum for
 * all users. Two middlewares, applied once, close that.
 */
router.use(requireAuth, requireAdmin);

// ------------------------------------------------------------------ graph

router.get(
  '/graph',
  asyncHandler(async (req, res) => {
    const [constellations, stars, edges, resources] = await Promise.all([
      dbAll('SELECT * FROM constellations ORDER BY sort_order, id'),
      dbAll('SELECT * FROM stars ORDER BY constellation_id, order_index, id'),
      dbAll('SELECT * FROM star_edges'),
      dbAll('SELECT * FROM resources ORDER BY star_id, type'),
    ]);
    res.json({
      constellations: constellations.map(publicConstellation),
      stars: stars.map(publicStar),
      edges: edges.map((e) => ({ parent: e.parent_star_id, child: e.child_star_id })),
      resources: resources.map(publicResource),
    });
  })
);

// --------------------------------------------------------- constellations

const constellationSchema = z.object({
  name: fields.plainText(80, { min: 2, minMsg: 'Название от 2 символов' }),
  description: fields.multilineText(500).default(''),
  x: z.coerce.number().int().min(-5000).max(10000).default(500),
  y: z.coerce.number().int().min(-5000).max(10000).default(300),
  stroke: z.string().trim().max(60).default('rgba(99,102,241,0.28)'),
  accent: z.string().trim().max(30).default('#818cf8'),
  icon: z.string().trim().max(8).default('✨'),
});

router.post(
  '/constellations',
  validate(constellationSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const max = await dbGet('SELECT COALESCE(MAX(sort_order), -1) AS m FROM constellations');
    const { lastID } = await dbRun(
      `INSERT INTO constellations (name, description_for_ai, x, y, stroke, accent, icon, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.name, b.description, b.x, b.y, b.stroke, b.accent, b.icon, max.m + 1]
    );
    res.status(201).json({ success: true, id: lastID });
  })
);

router.put(
  '/constellations/:id',
  validate(constellationSchema.partial()),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM constellations WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Созвездие не найдено');

    const map = {
      name: 'name',
      description: 'description_for_ai',
      x: 'x',
      y: 'y',
      stroke: 'stroke',
      accent: 'accent',
      icon: 'icon',
    };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(map)) {
      if (req.body[key] !== undefined) (sets.push(`${column} = ?`), params.push(req.body[key]));
    }
    if (!sets.length) throw ApiError.badRequest('Нет полей для обновления');

    params.push(id);
    await dbRun(`UPDATE constellations SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  })
);

router.delete(
  '/constellations/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM constellations WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Созвездие не найдено');

    // ON DELETE CASCADE clears stars → edges/resources/progress automatically.
    await dbRun('DELETE FROM constellations WHERE id = ?', [id]);
    res.json({ success: true });
  })
);

// ------------------------------------------------------------------ stars

const LEVELS = ['Низкий (Начальный)', 'Допустимый (Базовый)', 'Высокий (Прогрессивный)', 'Экспертный (Профи)'];

const starSchema = z.object({
  constellationId: z.coerce.number().int().positive(),
  name: fields.plainText(120, { min: 2, minMsg: 'Название от 2 символов' }),
  level: z.enum(LEVELS).default(LEVELS[0]),
  description: fields.multilineText(600).default(''),
  x: z.coerce.number().int().min(-5000).max(10000).default(0),
  y: z.coerce.number().int().min(-5000).max(10000).default(0),
});

router.post(
  '/stars',
  validate(starSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const parent = await dbGet('SELECT id FROM constellations WHERE id = ?', [b.constellationId]);
    if (!parent) throw ApiError.badRequest('Созвездие не найдено');

    const max = await dbGet('SELECT COALESCE(MAX(order_index), -1) AS m FROM stars WHERE constellation_id = ?', [
      b.constellationId,
    ]);
    const { lastID } = await dbRun(
      `INSERT INTO stars (constellation_id, name, level, x, y, description, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.constellationId, b.name, b.level, b.x, b.y, b.description, max.m + 1]
    );
    res.status(201).json({ success: true, id: lastID });
  })
);

router.put(
  '/stars/:id',
  validate(starSchema.partial().omit({ constellationId: true })),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM stars WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Навык не найден');

    const map = { name: 'name', level: 'level', description: 'description', x: 'x', y: 'y' };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(map)) {
      if (req.body[key] !== undefined) (sets.push(`${column} = ?`), params.push(req.body[key]));
    }
    if (!sets.length) throw ApiError.badRequest('Нет полей для обновления');

    params.push(id);
    await dbRun(`UPDATE stars SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  })
);

router.delete(
  '/stars/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM stars WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Навык не найден');
    await dbRun('DELETE FROM stars WHERE id = ?', [id]);
    res.json({ success: true });
  })
);

/** Batch position save — the editor drags several nodes then persists once. */
router.post(
  '/stars/positions',
  validate(
    z.object({
      positions: z
        .array(
          z.object({
            id: z.coerce.number().int().positive(),
            x: z.coerce.number().int().min(-5000).max(10000),
            y: z.coerce.number().int().min(-5000).max(10000),
          })
        )
        .min(1)
        .max(200),
    })
  ),
  asyncHandler(async (req, res) => {
    await withTransaction(async () => {
      for (const p of req.body.positions) {
        await dbRun('UPDATE stars SET x = ?, y = ? WHERE id = ?', [p.x, p.y, p.id]);
      }
    });
    res.json({ success: true, updated: req.body.positions.length });
  })
);

// ------------------------------------------------------------------ edges

const edgeSchema = z.object({
  parent: z.coerce.number().int().positive(),
  child: z.coerce.number().int().positive(),
});

router.post(
  '/edges',
  validate(edgeSchema),
  asyncHandler(async (req, res) => {
    const { parent, child } = req.body;
    if (parent === child) throw ApiError.badRequest('Навык нельзя связать сам с собой');

    const [p, c] = await Promise.all([
      dbGet('SELECT id FROM stars WHERE id = ?', [parent]),
      dbGet('SELECT id FROM stars WHERE id = ?', [child]),
    ]);
    if (!p || !c) throw ApiError.badRequest('Один из навыков не найден');

    // Reject cycles: a loop would leave every star in it permanently locked,
    // which the prototype allowed and had no way to detect.
    const [stars, edges] = await Promise.all([dbAll('SELECT * FROM stars'), dbAll('SELECT * FROM star_edges')]);
    const cycle = findCycle(stars, [...edges, { parent_star_id: parent, child_star_id: child }]);
    if (cycle) {
      throw ApiError.badRequest('Такая связь создаёт замкнутый круг — эти навыки станут недоступны навсегда');
    }

    await dbRun('INSERT OR IGNORE INTO star_edges (parent_star_id, child_star_id) VALUES (?, ?)', [parent, child]);
    res.status(201).json({ success: true });
  })
);

router.delete(
  '/edges',
  validate(edgeSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { parent, child } = req.query;
    await dbRun('DELETE FROM star_edges WHERE parent_star_id = ? AND child_star_id = ?', [parent, child]);
    res.json({ success: true });
  })
);

// -------------------------------------------------------------- resources

const resourceSchema = z.object({
  starId: z.coerce.number().int().positive(),
  type: z.enum(['offline', 'online', 'tool']),
  title: fields.plainText(160, { min: 2 }),
  detail1: fields.plainText(200).default(''),
  detail2: fields.plainText(200).default(''),
  link: fields.safeHttpUrl,
  city: z.string().trim().max(80).default('Все города'),
});

router.post(
  '/resources',
  validate(resourceSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const star = await dbGet('SELECT id FROM stars WHERE id = ?', [b.starId]);
    if (!star) throw ApiError.badRequest('Навык не найден');

    const { lastID } = await dbRun(
      `INSERT INTO resources (star_id, type, title, detail1, detail2, link, city)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.starId, b.type, b.title, b.detail1, b.detail2, b.link, b.city]
    );
    res.status(201).json({ success: true, id: lastID });
  })
);

router.put(
  '/resources/:id',
  validate(resourceSchema.partial().omit({ starId: true })),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM resources WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Ресурс не найден');

    const map = { type: 'type', title: 'title', detail1: 'detail1', detail2: 'detail2', link: 'link', city: 'city' };
    const sets = [];
    const params = [];
    for (const [key, column] of Object.entries(map)) {
      if (req.body[key] !== undefined) (sets.push(`${column} = ?`), params.push(req.body[key]));
    }
    if (!sets.length) throw ApiError.badRequest('Нет полей для обновления');

    params.push(id);
    await dbRun(`UPDATE resources SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
  })
);

/** Delete by primary key. The prototype deleted by (star_id, type, title), which
 *  removed every duplicate that happened to share a title. */
router.delete(
  '/resources/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await dbGet('SELECT id FROM resources WHERE id = ?', [id]);
    if (!existing) throw ApiError.notFound('Ресурс не найден');
    await dbRun('DELETE FROM resources WHERE id = ?', [id]);
    res.json({ success: true });
  })
);

// ----------------------------------------------------------------- cities

/**
 * City registry (TZ 3.7: «Список городов — добавить/удалить»).
 * Feeds the onboarding autocomplete and the city field on offline resources.
 */
router.get(
  '/cities',
  asyncHandler(async (req, res) => {
    const cities = await dbAll(
      `SELECT c.id, c.name, c.sort_order,
              (SELECT COUNT(*) FROM resources r WHERE r.city = c.name) AS resources,
              (SELECT COUNT(*) FROM users u WHERE u.city = c.name)     AS users
         FROM cities c ORDER BY c.sort_order, c.name`
    );
    res.json({ cities });
  })
);

router.post(
  '/cities',
  validate(z.object({ name: z.string().trim().min(2, 'Название от 2 символов').max(80) })),
  asyncHandler(async (req, res) => {
    const existing = await dbGet('SELECT id FROM cities WHERE name = ? COLLATE NOCASE', [req.body.name]);
    if (existing) throw ApiError.conflict('Такой город уже есть в списке');

    const max = await dbGet('SELECT COALESCE(MAX(sort_order), -1) AS m FROM cities');
    const { lastID } = await dbRun('INSERT INTO cities (name, sort_order) VALUES (?, ?)', [
      req.body.name,
      max.m + 1,
    ]);
    res.status(201).json({ success: true, id: lastID });
  })
);

router.delete(
  '/cities/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const city = await dbGet('SELECT name FROM cities WHERE id = ?', [id]);
    if (!city) throw ApiError.notFound('Город не найден');

    // Resources keep their free-text city value; removing the entry only takes
    // it out of the suggestion list, it never orphans existing content.
    await dbRun('DELETE FROM cities WHERE id = ?', [id]);
    res.json({ success: true });
  })
);

// ------------------------------------------------------------------ users

/** Registered users list — the TZ asks for it and the prototype shipped a
 *  "в разработке" placeholder. Read-only, and never exposes password hashes. */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const rows = await dbAll(
      `SELECT u.id, u.name, u.email, u.age, u.city, u.role, u.xp_points,
              u.subscription_status, u.is_admin, u.created_at,
              (SELECT COUNT(*) FROM user_progress p WHERE p.user_id = u.id) AS completed,
              (SELECT COUNT(*) FROM portfolio f WHERE f.user_id = u.id)     AS works
         FROM users u
        ORDER BY u.id DESC
        LIMIT 1000`
    );

    // Filtering happens here rather than in SQL: SQLite's LIKE is ASCII-only,
    // so `name LIKE '%соф%'` never matches «София» and Russian searches came
    // back empty. JS toLowerCase handles Cyrillic correctly.
    const q = String(req.query.q || '').trim().toLowerCase();
    const filtered = q
      ? rows.filter((u) =>
          [u.name, u.email, u.city].some((v) => String(v || '').toLowerCase().includes(q))
        )
      : rows;

    res.json({
      users: filtered.slice(0, 200).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        age: u.age,
        city: u.city,
        role: u.role,
        xp: u.xp_points,
        subscription: u.subscription_status,
        isAdmin: Boolean(u.is_admin),
        completed: u.completed,
        works: u.works,
        createdAt: u.created_at,
        registered: formatRuDate(u.created_at),
      })),
      total: filtered.length,
    });
  })
);

// ------------------------------------------------------------------ stats

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const stats = await dbGet(`
      SELECT (SELECT COUNT(*) FROM users)                              AS users,
             (SELECT COUNT(*) FROM users WHERE subscription_status='pro') AS pro,
             (SELECT COUNT(*) FROM constellations)                     AS constellations,
             (SELECT COUNT(*) FROM stars)                              AS stars,
             (SELECT COUNT(*) FROM resources)                          AS resources,
             (SELECT COUNT(*) FROM portfolio)                          AS works,
             (SELECT COUNT(*) FROM user_progress)                      AS completions,
             (SELECT COUNT(*) FROM cities)                             AS cities,
             (SELECT COUNT(*) FROM venues)                             AS venues,
             (SELECT COUNT(DISTINCT city) FROM venues)                 AS venueCities
    `);

    const orphans = await dbGet(
      'SELECT COUNT(*) AS n FROM stars s WHERE NOT EXISTS (SELECT 1 FROM resources r WHERE r.star_id = s.id)'
    );

    const [stars, edges] = await Promise.all([dbAll('SELECT * FROM stars'), dbAll('SELECT * FROM star_edges')]);

    res.json({
      ...stats,
      starsWithoutResources: orphans.n,
      cycle: findCycle(stars, edges),
    });
  })
);

module.exports = router;
