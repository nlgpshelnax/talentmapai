'use strict';

const express = require('express');

const { dbAll, dbGet, dbRun, withTransaction } = require('../db');
const { asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { publicQuestions, AGE_RANGE_TO_NUMBER } = require('../services/questions');
const { searchCities } = require('../db/cities');
const { pickRecommended, describeProfile } = require('../services/recommend');
const { summariseDiagnostics } = require('../services/ai');
const { publicUser, publicConstellation } = require('../utils/serialize');

const router = express.Router();

/** The 12 questions, served from the server so the UI can't drift from the scoring. */
router.get('/questions', (req, res) => {
  res.json({ questions: publicQuestions() });
});

/** City suggestions for the autocomplete field required by the TZ.
 *  Sourced from the `cities` table so the admin panel can curate the list. */
router.get(
  '/cities',
  asyncHandler(async (req, res) => {
    res.json({ cities: await searchCities(req.query.q) });
  })
);

/**
 * Submit the 12 answers.
 *
 * The prototype asked an LLM for a constellation and, with no API key, always
 * fell through to "the first constellation" — every child got the same map.
 * Scoring is now deterministic (services/recommend.js); the LLM, when present,
 * only writes the human-facing summary text.
 */
const submitSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number()])),
  childName: z.string().trim().min(1).max(60).optional(),
});

router.post(
  '/submit',
  requireAuth,
  validate(submitSchema),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { answers } = req.body;

    const constellations = await dbAll('SELECT * FROM constellations ORDER BY sort_order, id');
    const { ids, chosen } = pickRecommended(answers, constellations);

    const name = req.body.childName || req.user.name;
    const age = AGE_RANGE_TO_NUMBER[answers.age] ?? req.user.age ?? 10;
    const city = typeof answers.city === 'string' && answers.city.trim() ? answers.city.trim() : req.user.city || 'Москва';
    const weeklyHours = answers.weeklyHours || req.user.weekly_hours || '3-5 часов';

    await withTransaction(async () => {
      await dbRun(
        `UPDATE users SET name = ?, age = ?, city = ?, weekly_hours = ?,
                          recommended_graph_id = ?, recommended_graphs = ?, onboarded = 1
          WHERE id = ?`,
        [name, age, city, weeklyHours, ids[0] ?? null, JSON.stringify(ids), userId]
      );

      await dbRun('INSERT INTO diagnostics_results (user_id, answers, profile) VALUES (?, ?, ?)', [
        userId,
        JSON.stringify(answers),
        JSON.stringify({ recommended: ids, age, city, weeklyHours }),
      ]);

      await dbRun('INSERT INTO history_logs (user_id, log_text) VALUES (?, ?)', [
        userId,
        'Пройдена диагностика интересов — построена персональная карта.',
      ]);
    });

    const profileText = describeProfile(answers, { name });
    const summary = await summariseDiagnostics({
      name,
      age,
      city,
      weeklyHours,
      topConstellations: chosen,
      profileText,
    });

    const updated = await dbGet(
      `SELECT id, name, email, age, city, weekly_hours, role, avatar, xp_points,
              subscription_status, recommended_graph_id, recommended_graphs,
              equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
              parent_pin IS NOT NULL AS has_pin
         FROM users WHERE id = ?`,
      [userId]
    );

    res.json({
      success: true,
      user: publicUser(updated),
      profileText,
      summary,
      recommended: chosen.map((c) => ({ ...publicConstellation(c), reason: c.reason })),
    });
  })
);

/** Latest saved diagnostics result, so the summary screen survives a refresh. */
router.get(
  '/result',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = await dbGet(
      'SELECT * FROM diagnostics_results WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [req.user.id]
    );
    if (!row) return res.json({ result: null });

    let answers = {};
    let profile = {};
    try {
      answers = JSON.parse(row.answers);
      profile = JSON.parse(row.profile);
    } catch {
      /* corrupted row — return the empty shape rather than failing the screen */
    }
    res.json({ result: { answers, profile, createdAt: row.created_at } });
  })
);

module.exports = router;
