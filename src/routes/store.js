'use strict';

const express = require('express');

const config = require('../config');
const { dbAll, dbGet, dbRun, withTransaction } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { publicStoreItem, publicUser } = require('../utils/serialize');

const router = express.Router();

const EQUIP_COLUMN = { avatar: 'equipped_avatar', frame: 'equipped_frame', title: 'equipped_title' };

/**
 * A cosmetic is "pro only" for this user when its price exceeds the total XP a
 * trial account can ever earn (trialStarLimit skills × xpPerStar each). At 3×50
 * that ceiling is 150 XP, so a 200 XP title is mathematically unreachable on the
 * free plan — offering it as a normal "keep going" purchase would be a lie.
 * The ceiling is derived from config, never hardcoded.
 */
const trialXpCeiling = () => config.gamification.trialStarLimit * config.gamification.xpPerStar;

function isProOnly(user, item) {
  return user.subscription_status !== 'pro' && item.price > trialXpCeiling();
}

/** Catalogue, annotated with what this user already owns and wears. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [items, owned] = await Promise.all([
      dbAll('SELECT * FROM store_items ORDER BY sort_order, id'),
      dbAll('SELECT item_id FROM purchases WHERE user_id = ?', [req.user.id]),
    ]);
    const ownedIds = new Set(owned.map((o) => o.item_id));

    res.json({
      xp: req.user.xp_points || 0,
      equipped: {
        avatar: req.user.equipped_avatar,
        frame: req.user.equipped_frame,
        title: req.user.equipped_title,
      },
      items: items.map((i) => ({
        ...publicStoreItem(i),
        owned: ownedIds.has(i.id),
        affordable: (req.user.xp_points || 0) >= i.price,
        proOnly: isProOnly(req.user, i),
      })),
    });
  })
);

/**
 * Buy an item.
 *
 * The prototype took the PRICE FROM THE REQUEST BODY (so any client could set
 * it to 0) and then stored nothing — XP vanished and the item never existed.
 * Here the price comes from the database, ownership is recorded, and the
 * purchase is auto-equipped so the effect is immediately visible.
 */
router.post(
  '/buy',
  requireAuth,
  validate(z.object({ itemId: z.coerce.number().int().positive() })),
  asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const item = await dbGet('SELECT * FROM store_items WHERE id = ?', [req.body.itemId]);
    if (!item) throw ApiError.notFound('Товар не найден');

    const owned = await dbGet('SELECT 1 FROM purchases WHERE user_id = ? AND item_id = ?', [userId, item.id]);
    if (owned) throw ApiError.conflict('Этот предмет уже куплен');

    // Reject a PRO-only item before the funds check, so a trial user hears the
    // real reason ("needs PRO") instead of a misleading "not enough XP".
    if (isProOnly(req.user, item)) {
      throw new ApiError(402, 'Этот предмет доступен с подпиской PRO');
    }

    // Re-read XP inside the transaction rather than trusting the request-time copy.
    await withTransaction(async () => {
      const fresh = await dbGet('SELECT xp_points FROM users WHERE id = ?', [userId]);
      if ((fresh.xp_points || 0) < item.price) {
        throw ApiError.badRequest(`Не хватает опыта: нужно ${item.price} XP`);
      }

      await dbRun('UPDATE users SET xp_points = xp_points - ? WHERE id = ?', [item.price, userId]);
      await dbRun('INSERT INTO purchases (user_id, item_id) VALUES (?, ?)', [userId, item.id]);
      await dbRun(`UPDATE users SET ${EQUIP_COLUMN[item.type]} = ? WHERE id = ?`, [item.payload, userId]);
      await dbRun('INSERT INTO history_logs (user_id, log_text) VALUES (?, ?)', [
        userId,
        `Куплено в магазине: «${item.title}» за ${item.price} XP.`,
      ]);
    });

    const updated = await dbGet(
      `SELECT id, name, email, age, city, weekly_hours, role, avatar, xp_points,
              subscription_status, recommended_graph_id, recommended_graphs,
              equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
              parent_pin IS NOT NULL AS has_pin
         FROM users WHERE id = ?`,
      [userId]
    );

    res.json({ success: true, item: publicStoreItem(item), user: publicUser(updated) });
  })
);

/** Equip / unequip an owned item, so the child can switch looks freely. */
router.post(
  '/equip',
  requireAuth,
  validate(
    z.object({
      itemId: z.coerce.number().int().positive().nullable().optional(),
      type: z.enum(['avatar', 'frame', 'title']),
    })
  ),
  asyncHandler(async (req, res) => {
    const { itemId, type } = req.body;
    const userId = req.user.id;

    let payload = null;
    if (itemId) {
      const item = await dbGet(
        `SELECT si.* FROM purchases p JOIN store_items si ON si.id = p.item_id
          WHERE p.user_id = ? AND si.id = ?`,
        [userId, itemId]
      );
      if (!item) throw ApiError.forbidden('Этот предмет не куплен');
      if (item.type !== type) throw ApiError.badRequest('Тип предмета не совпадает');
      payload = item.payload;
    }

    await dbRun(`UPDATE users SET ${EQUIP_COLUMN[type]} = ? WHERE id = ?`, [payload, userId]);

    const updated = await dbGet(
      `SELECT id, name, email, age, city, weekly_hours, role, avatar, xp_points,
              subscription_status, recommended_graph_id, recommended_graphs,
              equipped_avatar, equipped_frame, equipped_title, is_admin, onboarded,
              parent_pin IS NOT NULL AS has_pin
         FROM users WHERE id = ?`,
      [userId]
    );

    res.json({ success: true, user: publicUser(updated) });
  })
);

module.exports = router;
