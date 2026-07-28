'use strict';

const express = require('express');

const config = require('../config');
const { dbAll, dbGet, dbRun, withTransaction } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { isStarAvailable, currentStarId } = require('../services/graph');
const { publicLog } = require('../utils/serialize');
const { safeJsonArray } = require('../utils/serialize');

const router = express.Router();

const starSchema = z.object({ starId: z.coerce.number().int().positive() });

async function loadGraph() {
  const [stars, edges] = await Promise.all([
    dbAll('SELECT * FROM stars ORDER BY constellation_id, order_index, id'),
    dbAll('SELECT * FROM star_edges'),
  ]);
  return { stars, edges };
}

async function completedFor(userId) {
  const rows = await dbAll('SELECT star_id FROM user_progress WHERE user_id = ?', [userId]);
  return rows.map((r) => r.star_id);
}

function visibleFor(user, stars) {
  const rec = safeJsonArray(user.recommended_graphs);
  return rec.length ? rec : [...new Set(stars.map((s) => s.constellation_id))];
}

/**
 * Mark a skill complete.
 *
 * Three prototype defects fixed here:
 *  - it accepted any starId, so a locked skill could be completed out of order;
 *  - the history entry took its name from `resources.title`, meaning the log
 *    recorded a workshop name instead of the skill;
 *  - progress, XP and the log were three unguarded writes that could half-apply.
 */
router.post(
  '/complete',
  requireAuth,
  validate(starSchema),
  asyncHandler(async (req, res) => {
    const { starId } = req.body;
    const userId = req.user.id;

    const star = await dbGet('SELECT * FROM stars WHERE id = ?', [starId]);
    if (!star) throw ApiError.notFound('Навык не найден');

    const already = await dbGet('SELECT 1 FROM user_progress WHERE user_id = ? AND star_id = ?', [userId, starId]);
    if (already) throw ApiError.conflict('Этот навык уже отмечен как пройденный');

    const { stars, edges } = await loadGraph();
    const completed = await completedFor(userId);
    const visible = visibleFor(req.user, stars);

    if (!isStarAvailable(stars, edges, completed, starId, visible)) {
      throw ApiError.badRequest('Сначала нужно пройти предыдущие навыки этого созвездия');
    }

    // Free plan limit — enforced on the server, not just hidden in the UI.
    if (req.user.subscription_status !== 'pro' && completed.length >= config.gamification.trialStarLimit) {
      throw new ApiError(402, 'Достигнут лимит бесплатного доступа. Оформите подписку, чтобы продолжить.');
    }

    const xp = config.gamification.xpPerStar;

    await withTransaction(async () => {
      await dbRun('INSERT INTO user_progress (user_id, star_id) VALUES (?, ?)', [userId, starId]);
      await dbRun('UPDATE users SET xp_points = xp_points + ? WHERE id = ?', [xp, userId]);
      await dbRun('INSERT INTO history_logs (user_id, log_text) VALUES (?, ?)', [
        userId,
        `Отмечен выполненным шаг: «${star.name}». Получено ${xp} XP!`,
      ]);
    });

    const nowCompleted = await completedFor(userId);
    const logs = await dbAll('SELECT * FROM history_logs WHERE user_id = ? ORDER BY id DESC LIMIT 100', [userId]);
    const fresh = await dbGet('SELECT xp_points FROM users WHERE id = ?', [userId]);

    res.json({
      success: true,
      completedStars: nowCompleted,
      currentStarId: currentStarId(stars, edges, nowCompleted, visible),
      xp: fresh.xp_points,
      xpGained: xp,
      historyLogs: logs.map(publicLog),
    });
  })
);

/** Undo a completion (also refunds the XP, which the prototype never did). */
router.post(
  '/reset',
  requireAuth,
  validate(starSchema),
  asyncHandler(async (req, res) => {
    const { starId } = req.body;
    const userId = req.user.id;

    const star = await dbGet('SELECT * FROM stars WHERE id = ?', [starId]);
    if (!star) throw ApiError.notFound('Навык не найден');

    const existing = await dbGet('SELECT 1 FROM user_progress WHERE user_id = ? AND star_id = ?', [userId, starId]);
    if (!existing) throw ApiError.badRequest('Этот навык ещё не отмечен');

    const xp = config.gamification.xpPerStar;

    await withTransaction(async () => {
      await dbRun('DELETE FROM user_progress WHERE user_id = ? AND star_id = ?', [userId, starId]);
      await dbRun('UPDATE users SET xp_points = MAX(0, xp_points - ?) WHERE id = ?', [xp, userId]);
      await dbRun('INSERT INTO history_logs (user_id, log_text) VALUES (?, ?)', [
        userId,
        `Сброшен прогресс по навыку «${star.name}».`,
      ]);
    });

    const { stars, edges } = await loadGraph();
    const nowCompleted = await completedFor(userId);
    const logs = await dbAll('SELECT * FROM history_logs WHERE user_id = ? ORDER BY id DESC LIMIT 100', [userId]);
    const fresh = await dbGet('SELECT xp_points FROM users WHERE id = ?', [userId]);

    res.json({
      success: true,
      completedStars: nowCompleted,
      currentStarId: currentStarId(stars, edges, nowCompleted, visibleFor(req.user, stars)),
      xp: fresh.xp_points,
      historyLogs: logs.map(publicLog),
    });
  })
);

module.exports = router;
