'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const { dbGet } = require('../db');
const { asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { sanitizeForLLM } = require('../utils/sanitize');
const { tutorReply, enabled } = require('../services/ai');

const router = express.Router();

/** AI calls are the most expensive endpoint — cap them per user. */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Per-user when signed in; IPv6-safe subnet key otherwise.
  keyGenerator: (req) => (req.user?.id ? `u${req.user.id}` : ipKeyGenerator(req.ip)),
  message: { error: 'Слишком много сообщений подряд. Подождите минуту.' },
});

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        // Текст ребёнка уходит в языковую модель. Снимаем ролевые маркеры и
        // ограждения кода, которыми пытаются переписать системную инструкцию,
        // — но осторожно: фраза «хочу стать системным администратором» должна
        // дойти до модели нетронутой.
        content: z.string().min(1).max(4000).transform(sanitizeForLLM).pipe(z.string().min(1).max(2000)),
      })
    )
    .min(1)
    .max(30),
});

/** Status flag so the UI can label the demo mode honestly. */
router.get('/status', requireAuth, (req, res) => {
  res.json({ model: enabled() ? 'live' : 'offline' });
});

router.post(
  '/tutor',
  requireAuth,
  aiLimiter,
  validate(chatSchema),
  asyncHandler(async (req, res) => {
    const progress = await dbGet('SELECT COUNT(*) AS n FROM user_progress WHERE user_id = ?', [req.user.id]);

    const reply = await tutorReply(req.body.messages, {
      name: req.user.name,
      age: req.user.age,
      completedCount: progress.n,
    });

    res.json({ reply, model: enabled() ? 'live' : 'offline' });
  })
);

module.exports = router;
