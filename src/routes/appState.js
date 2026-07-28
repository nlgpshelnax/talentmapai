'use strict';

const express = require('express');

const { dbAll, dbGet } = require('../db');
const { asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { currentStarId } = require('../services/graph');
const {
  publicUser,
  publicStar,
  publicConstellation,
  publicResource,
  publicPortfolioItem,
  publicLog,
} = require('../utils/serialize');

const router = express.Router();

/**
 * One call returns everything the app shell needs.
 *
 * Critically, there is no `userId` parameter any more — the prototype accepted
 * `?userId=` and happily handed over any account's profile, portfolio and
 * history. The identity is the authenticated user, full stop.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const [constellations, stars, edges, resources, progressRows, portfolio, logs, purchases] = await Promise.all([
      dbAll('SELECT * FROM constellations ORDER BY sort_order, id'),
      dbAll('SELECT * FROM stars ORDER BY constellation_id, order_index, id'),
      dbAll('SELECT * FROM star_edges'),
      dbAll('SELECT * FROM resources ORDER BY star_id, type'),
      dbAll('SELECT star_id FROM user_progress WHERE user_id = ?', [userId]),
      dbAll('SELECT * FROM portfolio WHERE user_id = ? ORDER BY id DESC', [userId]),
      dbAll('SELECT * FROM history_logs WHERE user_id = ? ORDER BY id DESC LIMIT 100', [userId]),
      dbAll(
        `SELECT si.* FROM purchases p JOIN store_items si ON si.id = p.item_id
          WHERE p.user_id = ? ORDER BY si.sort_order`,
        [userId]
      ),
    ]);

    const completedStars = progressRows.map((r) => r.star_id);
    const recommended = publicUser(req.user).recommendedGraphs;

    // Which constellations the map shows by default: the recommended set,
    // or everything if diagnostics hasn't run yet.
    const visibleConstellationIds = recommended.length ? recommended : constellations.map((c) => c.id);

    res.json({
      user: publicUser(req.user),
      completedStars,
      currentStarId: currentStarId(stars, edges, completedStars, visibleConstellationIds),
      constellations: constellations.map(publicConstellation),
      stars: stars.map(publicStar),
      edges: edges.map((e) => ({ parent: e.parent_star_id, child: e.child_star_id })),
      resources: resources.map(publicResource),
      portfolio: portfolio.map(publicPortfolioItem),
      historyLogs: logs.map(publicLog),
      purchases: purchases.map((p) => ({ id: p.id, code: p.code, type: p.type, payload: p.payload, title: p.title })),
      totals: {
        stars: stars.length,
        completed: completedStars.length,
        constellations: constellations.length,
      },
    });
  })
);

/** Lightweight progress summary — used by the parent dashboard. */
router.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await dbGet(
      `SELECT (SELECT COUNT(*) FROM user_progress WHERE user_id = ?) AS completed,
              (SELECT COUNT(*) FROM stars)                            AS total,
              (SELECT COUNT(*) FROM portfolio WHERE user_id = ?)      AS works`,
      [req.user.id, req.user.id]
    );
    res.json({
      completed: row.completed,
      total: row.total,
      works: row.works,
      xp: req.user.xp_points || 0,
      percent: row.total ? Math.round((row.completed / row.total) * 100) : 0,
    });
  })
);

module.exports = router;
