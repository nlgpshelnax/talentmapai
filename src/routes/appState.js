'use strict';

const express = require('express');

const config = require('../config');
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
    const unlocked = publicUser(req.user).recommendedGraphs;

    // Прогресс всегда считается по открытым направлениям, а не по всему
    // каталогу: иначе в шапке приложения и в отчёте родителя получались разные
    // проценты для одного и того же момента.
    const scopeSql = unlocked.length
      ? `SELECT id FROM stars WHERE constellation_id IN (${unlocked.map(() => '?').join(',')})`
      : 'SELECT id FROM stars';
    const scopeParams = unlocked.length ? unlocked : [];

    const [scopeStars, progress, works, catalogue, tempo, lastLog] = await Promise.all([
      dbAll(scopeSql, scopeParams),
      dbAll('SELECT star_id FROM user_progress WHERE user_id = ?', [req.user.id]),
      dbGet('SELECT COUNT(*) AS n FROM portfolio WHERE user_id = ?', [req.user.id]),
      dbGet('SELECT COUNT(*) AS n FROM stars'),
      // Темп занятий. Родителю важнее «занимается ли сейчас», чем «сколько
      // всего», а вычислять это на клиенте нельзя: обращение к часам во время
      // рендера — нечистая операция (React 19 ловит её правилом purity).
      dbGet(
        `SELECT
           SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS month,
           SUM(CASE WHEN created_at >= datetime('now', '-7 days')  THEN 1 ELSE 0 END) AS week
         FROM history_logs WHERE user_id = ? AND log_text LIKE '%шаг%'`,
        [req.user.id]
      ),
      dbGet(
        `SELECT CAST(julianday('now') - julianday(MAX(created_at)) AS INTEGER) AS days
           FROM history_logs WHERE user_id = ?`,
        [req.user.id]
      ),
    ]);

    const scopeIds = new Set(scopeStars.map((s) => s.id));
    const completedAll = progress.map((p) => p.star_id);
    const completed = completedAll.filter((id) => scopeIds.has(id)).length;

    res.json({
      completed,
      total: scopeIds.size,
      percent: scopeIds.size ? Math.round((completed / scopeIds.size) * 100) : 0,
      works: works.n,
      xp: req.user.xp_points || 0,
      // Родителю важно, сколько ребёнок заработал за всё время, а не сколько
      // осталось на счету: потратив опыт в магазине, ребёнок обнулял баланс и
      // в отчёте выглядел так, будто ничего не делал.
      xpEarned: completedAll.length * config.gamification.xpPerStar,
      catalogueTotal: catalogue.n,
      pace: { month: tempo?.month || 0, week: tempo?.week || 0 },
      daysSinceActivity: lastLog?.days == null ? null : Math.max(0, lastLog.days),
    });
  })
);

module.exports = router;
