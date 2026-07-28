'use strict';

const express = require('express');
const bcrypt = require('bcrypt');

const { dbGet, dbRun } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { validate, z, fields } = require('../middleware/validate');
const { publicUser } = require('../utils/serialize');

const router = express.Router();

async function reloadUser(id) {
  return dbGet(
    `SELECT id, name, email, age, city, weekly_hours, role, avatar, xp_points,
            subscription_status, recommended_graph_id, recommended_graphs,
            equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
            parent_pin IS NOT NULL AS has_pin
       FROM users WHERE id = ?`,
    [id]
  );
}

/** Update own profile. Note there is no `userId` field — you can only edit yourself. */
const profileSchema = z.object({
  name: fields.name.optional(),
  // Роль выбирается на онбординге (ТЗ 3.1) и определяет формулировки вопросов.
  role: z.enum(['parent', 'child']).optional(),
  age: fields.age.optional(),
  city: fields.city.optional(),
  weeklyHours: z.string().trim().max(40).optional(),
  avatar: z.string().trim().max(500).optional(),
});

router.patch(
  '/profile',
  requireAuth,
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const { name, role, age, city, weeklyHours, avatar } = req.body;

    const updates = [];
    const params = [];
    if (name !== undefined) (updates.push('name = ?'), params.push(name));
    if (role !== undefined) (updates.push('role = ?'), params.push(role));
    if (age !== undefined) (updates.push('age = ?'), params.push(age));
    if (city !== undefined) (updates.push('city = ?'), params.push(city));
    if (weeklyHours !== undefined) (updates.push('weekly_hours = ?'), params.push(weeklyHours));
    if (avatar !== undefined) (updates.push('avatar = ?'), params.push(avatar || null));

    if (!updates.length) throw ApiError.badRequest('Нет полей для обновления');

    params.push(req.user.id);
    await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true, user: publicUser(await reloadUser(req.user.id)) });
  })
);

// ------------------------------------------------------------- parent PIN

/**
 * The parent PIN gates the analytics area from the child.
 * The prototype stored the four digits in plaintext and compared with `===`;
 * it is now a bcrypt hash like any other credential.
 */
router.post(
  '/pin',
  requireAuth,
  validate(z.object({ pin: fields.pin })),
  asyncHandler(async (req, res) => {
    await dbRun('UPDATE users SET parent_pin = ? WHERE id = ?', [
      await bcrypt.hash(req.body.pin, 10),
      req.user.id,
    ]);
    res.json({ success: true });
  })
);

router.post(
  '/pin/verify',
  requireAuth,
  validate(z.object({ pin: fields.pin })),
  asyncHandler(async (req, res) => {
    const row = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [req.user.id]);
    if (!row?.parent_pin) throw ApiError.badRequest('PIN-код ещё не установлен');

    const ok = await bcrypt.compare(req.body.pin, row.parent_pin);
    if (!ok) throw ApiError.badRequest('Неверный PIN-код');

    res.json({ success: true });
  })
);

router.delete(
  '/pin',
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbRun('UPDATE users SET parent_pin = NULL WHERE id = ?', [req.user.id]);
    res.json({ success: true });
  })
);

// ----------------------------------------------------------- subscription

/**
 * Demo upgrade. There is no payment provider wired in, so this is explicitly
 * a demo action — but it can now only ever upgrade the caller's own account,
 * whereas the prototype accepted any userId in the body.
 */
router.post(
  '/subscription/upgrade',
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbRun("UPDATE users SET subscription_status = 'pro' WHERE id = ?", [req.user.id]);
    await dbRun('INSERT INTO history_logs (user_id, log_text) VALUES (?, ?)', [
      req.user.id,
      'Оформлена подписка PRO — открыты все созвездия.',
    ]);
    res.json({ success: true, user: publicUser(await reloadUser(req.user.id)) });
  })
);

router.post(
  '/subscription/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    await dbRun("UPDATE users SET subscription_status = 'trial' WHERE id = ?", [req.user.id]);
    res.json({ success: true, user: publicUser(await reloadUser(req.user.id)) });
  })
);

module.exports = router;
