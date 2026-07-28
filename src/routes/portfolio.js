'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const config = require('../config');
const { dbAll, dbGet, dbRun } = require('../db');
const { ApiError, asyncHandler } = require('../middleware/error');
const { requireAuth } = require('../middleware/auth');
const { critiquePortfolio } = require('../services/ai');
const { publicPortfolioItem, publicLog } = require('../utils/serialize');

const router = express.Router();

fs.mkdirSync(config.uploads.dir, { recursive: true });

/**
 * Real file uploads.
 *
 * The prototype had no uploader at all — the form took an image URL string, and
 * the avatar path base64-encoded whole images into the database via a hardcoded
 * Imgur client id committed in the client bundle. Files now land on disk with a
 * random name, a size cap and a MIME allowlist.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploads.dir),
  filename: (req, file, cb) => {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[file.mimetype] || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!config.uploads.allowedMime.includes(file.mimetype)) {
      const err = new Error('Invalid file type');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

/** List own works, newest first. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await dbAll('SELECT * FROM portfolio WHERE user_id = ? ORDER BY id DESC', [req.user.id]);
    res.json({ portfolio: rows.map(publicPortfolioItem) });
  })
);

router.post(
  '/',
  requireAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || '').trim();
    const comment = String(req.body.comment || '').trim();
    const starId = req.body.starId ? Number(req.body.starId) : null;

    if (title.length < 2 || title.length > 120) {
      throw ApiError.badRequest('Название работы должно быть от 2 до 120 символов');
    }
    if (comment.length > 1000) throw ApiError.badRequest('Комментарий слишком длинный');
    if (!req.file) throw ApiError.badRequest('Прикрепите изображение работы');

    let starName = '';
    if (starId) {
      const star = await dbGet('SELECT name FROM stars WHERE id = ?', [starId]);
      if (!star) throw ApiError.badRequest('Указанная компетенция не найдена');
      starName = star.name;
    }

    const { feedback, byModel } = await critiquePortfolio({ title, comment, starName });
    const imagePath = `/uploads/${req.file.filename}`;

    const { lastID } = await dbRun(
      `INSERT INTO portfolio (user_id, title, star_id, image, comment, verified_by_ai, ai_feedback)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title, starId, imagePath, comment, byModel ? 1 : 0, feedback]
    );

    await dbRun('INSERT INTO history_logs (user_id, log_text) VALUES (?, ?)', [
      req.user.id,
      starName
        ? `Загружена работа «${title}» к навыку «${starName}».`
        : `Загружена работа «${title}» в портфолио.`,
    ]);

    const [item, logs] = await Promise.all([
      dbGet('SELECT * FROM portfolio WHERE id = ?', [lastID]),
      dbAll('SELECT * FROM history_logs WHERE user_id = ? ORDER BY id DESC LIMIT 100', [req.user.id]),
    ]);

    res.status(201).json({
      success: true,
      item: publicPortfolioItem(item),
      historyLogs: logs.map(publicLog),
    });
  })
);

/** Delete own work, removing the file from disk too. */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = await dbGet('SELECT * FROM portfolio WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!row) throw ApiError.notFound('Работа не найдена');

    await dbRun('DELETE FROM portfolio WHERE id = ?', [id]);

    if (row.image && row.image.startsWith('/uploads/')) {
      const file = path.join(config.uploads.dir, path.basename(row.image));
      fs.promises.unlink(file).catch(() => {
        /* the row is gone either way; a missing file is not an error */
      });
    }

    res.json({ success: true });
  })
);

module.exports = router;
