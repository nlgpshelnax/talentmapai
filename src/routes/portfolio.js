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
const { plainText, cleanText, graphemeLength, isZalgo } = require('../utils/sanitize');
const { inspectImage, FORMAT_RULES } = require('../utils/imageGuard');

const router = express.Router();

fs.mkdirSync(config.uploads.dir, { recursive: true });

/**
 * Real file uploads.
 *
 * The prototype had no uploader at all — the form took an image URL string, and
 * the avatar path base64-encoded whole images into the database via a hardcoded
 * Imgur client id committed in the client bundle. Files now land on disk with a
 * random name, a size cap and a MIME allowlist.
 *
 * Multer is only the FIRST line of defence: the size cap and a coarse MIME
 * allowlist. The declared MIME (`file.mimetype`) comes from the client's
 * `Content-Type` part header and is trivially forged, so it is NOT trusted for
 * anything security-relevant. The file is written with a random, EXTENSION-LESS
 * name; the real extension is derived from the sniffed magic bytes only after
 * `inspectImage` has validated the content (see the POST handler below).
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploads.dir),
  filename: (req, file, cb) => {
    // Никакого расширения из mimetype: имя временное, настоящее расширение
    // добавим после определения формата по магическим байтам.
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    // Грубая отсечка по заявленному MIME — только чтобы не писать на диск
    // заведомо неподходящее. Настоящая проверка идёт по содержимому файла.
    if (!config.uploads.allowedMime.includes(file.mimetype)) {
      const err = new Error('Invalid file type');
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }
    cb(null, true);
  },
});

/** Тихо удалить временный/отклонённый файл с диска, не роняя обработчик. */
async function removeFile(filePath) {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(() => {
    /* файла может уже не быть — это не ошибка */
  });
}

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
    // Файл обязателен. Если его нет, чистить нечего — просто отказ.
    if (!req.file) throw ApiError.badRequest('Прикрепите изображение работы');

    // С этого момента файл уже лежит на диске. Любая последующая ошибка —
    // валидация, отбраковка изображения, сбой записи в БД — обязана удалить
    // файл, иначе на диске копится «мусор» из отклонённых загрузок.
    try {
      // 1. Проверяем САМО содержимое файла: магические байты, соответствие
      //    заявленному типу, размеры, защита от бомбы и полиглота.
      const { format } = await inspectImage(req.file.path, req.file.mimetype);

      // 2. Расширение выводим из НАСТОЯЩЕГО формата, а не из присланного MIME.
      //    Переименовываем временный файл, добавляя корректное расширение.
      const ext = FORMAT_RULES[format].ext;
      const finalName = `${req.file.filename}${ext}`;
      const finalPath = path.join(config.uploads.dir, finalName);
      await fs.promises.rename(req.file.path, finalPath);
      req.file.filename = finalName;
      req.file.path = finalPath;

      // 3. Валидация текстовых полей (после проверки файла, чтобы отбитый файл
      //    не оставался на диске из-за неверного заголовка).
      /**
       * Поля приходят вместе с файлом (multipart), поэтому общий middleware
       * валидации здесь не подключить — фильтруем теми же функциями вручную.
       * Длину меряем в видимых символах: строку можно набить невидимыми и
       * пролезть под ограничение, а семейный смайлик занимает одиннадцать
       * позиций в строке, оставаясь одним символом на экране.
       */
      const title = plainText(String(req.body.title || ''));
      const comment = cleanText(String(req.body.comment || ''), { multiline: true });
      const starId = req.body.starId ? Number(req.body.starId) : null;

      const titleLength = graphemeLength(title);
      if (titleLength < 2 || titleLength > 120) {
        throw ApiError.badRequest('Название работы должно быть от 2 до 120 символов');
      }
      if (isZalgo(title)) throw ApiError.badRequest('Название содержит недопустимые символы');
      if (graphemeLength(comment) > 1000) throw ApiError.badRequest('Комментарий слишком длинный');

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
    } catch (err) {
      // req.file.path указывает либо на временный, либо на уже переименованный
      // файл — в обоих случаях это наш файл, и при ошибке его нужно убрать.
      await removeFile(req.file.path);
      throw err;
    }
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
