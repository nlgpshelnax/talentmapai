'use strict';

/**
 * Проверка загруженных изображений без сторонних зависимостей.
 *
 * Задача — сократить, а не расширить поверхность атаки, поэтому мы НЕ подключаем
 * sharp/jimp (у них своя история нативных CVE) и вообще не декодируем пиксели.
 * Всё, что здесь делается, — это чтение заголовков файла средствами чистого Node:
 *
 *   1. Определяем НАСТОЯЩИЙ формат по «магическим байтам», а не по присланному
 *      клиентом Content-Type (его подделать тривиально).
 *   2. Сверяем настоящий формат с заявленным MIME и с расширением на диске.
 *   3. Читаем ширину/высоту прямо из заголовочных структур (IHDR, LSD, SOFn,
 *      VP8/VP8L/VP8X) — без разжатия.
 *   4. Отбиваем «архивные бомбы»: и по абсолютному числу мегапикселей, и по
 *      абсурдному соотношению «пикселей на байт файла».
 *   5. Ищем в первых 2 КБ признаки полиглота (<?php, <script, <!DOCTYPE html,
 *      <svg) — в настоящем растровом изображении их у начала файла не бывает.
 *
 * Экспортируется единственная асинхронная функция inspectImage(...), которая
 * возвращает { ok, format, width, height } либо бросает ApiError.badRequest с
 * понятным русским сообщением. Само удаление файла с диска — ответственность
 * вызывающего кода (роутера): страж только выносит вердикт.
 */

const fs = require('fs');
const { ApiError } = require('../middleware/error');

// Максимальные допустимые размеры и пороги защиты.
const MAX_DIMENSION = 10000; // ни одна сторона не должна превышать 10000 px
const MAX_MEGAPIXELS = 50; // потолок площади: width * height <= 50 Мп
const HEADER_SCAN_BYTES = 2048; // сколько байт с начала файла сканируем на полиглот

// Сигнатуры форматов (магические байты).
const SIG_JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const SIG_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SIG_GIF87A = Buffer.from('GIF87a', 'latin1');
const SIG_GIF89A = Buffer.from('GIF89a', 'latin1');
const SIG_RIFF = Buffer.from('RIFF', 'latin1');
const SIG_WEBP = Buffer.from('WEBP', 'latin1');

/**
 * Соответствие «настоящий формат → допустимые заявленные MIME → расширение на
 * диске». Расширение на диске у нас всегда выводится из настоящего формата,
 * поэтому здесь оно ровно одно; MIME клиент может прислать в нескольких
 * вариантах (image/jpg исторически ходит рядом с image/jpeg).
 */
const FORMAT_RULES = {
  jpeg: { mimes: ['image/jpeg', 'image/jpg'], ext: '.jpg' },
  png: { mimes: ['image/png'], ext: '.png' },
  gif: { mimes: ['image/gif'], ext: '.gif' },
  webp: { mimes: ['image/webp'], ext: '.webp' },
};

/** Определить формат по первым байтам. Возвращает 'jpeg'|'png'|'gif'|'webp'|null. */
function sniffFormat(buf) {
  if (buf.length >= 3 && buf.subarray(0, 3).equals(SIG_JPEG)) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(SIG_PNG)) return 'png';
  if (buf.length >= 6 && (buf.subarray(0, 6).equals(SIG_GIF87A) || buf.subarray(0, 6).equals(SIG_GIF89A))) {
    return 'gif';
  }
  // WebP: 'RIFF' <4 байта размера> 'WEBP'
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).equals(SIG_RIFF) &&
    buf.subarray(8, 12).equals(SIG_WEBP)
  ) {
    return 'webp';
  }
  return null;
}

/** Расширение файла (в нижнем регистре, с точкой) или '' если его нет. */
function extensionOf(filePath) {
  const base = filePath.split(/[\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return ''; // нет точки либо файл вида «.hidden» — расширения нет
  return base.slice(dot).toLowerCase();
}

// --------------------------------------------------------- разбор размеров

/** PNG: ширина/высота лежат в чанке IHDR, байты 16..20 и 20..24 (big-endian). */
function readPngDimensions(buf) {
  if (buf.length < 24) throw ApiError.badRequest('Повреждённый PNG: файл слишком короткий');
  // Чанк IHDR обязан идти первым; убеждаемся, что это действительно он.
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') {
    throw ApiError.badRequest('Повреждённый PNG: отсутствует заголовок IHDR');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

/** GIF: логический дескриптор экрана, байты 6..8 и 8..10 (little-endian). */
function readGifDimensions(buf) {
  if (buf.length < 10) throw ApiError.badRequest('Повреждённый GIF: файл слишком короткий');
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  return { width, height };
}

/**
 * JPEG: идём по маркерам сегментов до кадрового заголовка SOFn и читаем размеры.
 * Каждый маркер начинается с 0xFF; за ним тип. У сегментов с длиной первые два
 * байта после типа — длина сегмента (big-endian, включая эти два байта).
 * Кадровые маркеры SOF0..SOF15 (0xC0..0xCF), кроме DHT(C4), DNL(C8) и DAC(CC),
 * содержат: [точность:1][высота:2][ширина:2].
 */
function readJpegDimensions(buf) {
  let offset = 2; // пропускаем стартовый SOI (FF D8)
  const len = buf.length;

  while (offset + 1 < len) {
    // Маркеры могут быть «дополнены» несколькими 0xFF подряд — проматываем их.
    if (buf[offset] !== 0xff) {
      // Рассинхрон: перед нами не маркер. Битый/подозрительный JPEG.
      throw ApiError.badRequest('Повреждённый JPEG: не найден заголовок кадра');
    }
    let marker = buf[offset + 1];
    offset += 2;
    while (marker === 0xff && offset < len) {
      // серия 0xFF — заполнитель, следующий байт и есть тип маркера
      marker = buf[offset];
      offset += 1;
    }

    // Маркеры без полезной нагрузки (RSTn, SOI, EOI, TEM) — длины не имеют.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }

    if (offset + 1 >= len) break;
    const segLen = buf.readUInt16BE(offset);
    if (segLen < 2) throw ApiError.badRequest('Повреждённый JPEG: некорректная длина сегмента');

    // Кадровые заголовки SOF0..SOF15, кроме DHT/DAC/DNL — в них и есть размеры.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 7 > len) throw ApiError.badRequest('Повреждённый JPEG: обрезанный заголовок кадра');
      const height = buf.readUInt16BE(offset + 3);
      const width = buf.readUInt16BE(offset + 5);
      return { width, height };
    }

    // Иначе перескакиваем через весь сегмент к следующему маркеру.
    offset += segLen;
  }

  throw ApiError.badRequest('Повреждённый JPEG: размеры кадра не найдены');
}

/**
 * WebP: контейнер RIFF, размеры зависят от типа вложенного чанка.
 *   VP8  (lossy)    — размеры по смещению 26, по 14 бит, little-endian.
 *   VP8L (lossless) — упакованы битами начиная со смещения 21.
 *   VP8X (extended) — canvas 24 бита, little-endian, со смещения 24.
 */
function readWebpDimensions(buf) {
  if (buf.length < 16) throw ApiError.badRequest('Повреждённый WebP: файл слишком короткий');
  const fourcc = buf.subarray(12, 16).toString('latin1');

  if (fourcc === 'VP8 ') {
    // Ключевой кадр: сигнатура 9D 01 2A, затем 16-бит ширина и 16-бит высота.
    if (buf.length < 30) throw ApiError.badRequest('Повреждённый WebP (VP8): обрезанный заголовок');
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  if (fourcc === 'VP8L') {
    // Первый байт — сигнатура 0x2F, дальше 14 бит ширины и 14 бит высоты (минус 1).
    if (buf.length < 25) throw ApiError.badRequest('Повреждённый WebP (VP8L): обрезанный заголовок');
    if (buf[20] !== 0x2f) throw ApiError.badRequest('Повреждённый WebP (VP8L): неверная сигнатура');
    const b0 = buf[21];
    const b1 = buf[22];
    const b2 = buf[23];
    const b3 = buf[24];
    const bits = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  if (fourcc === 'VP8X') {
    // Расширенный формат: размеры холста — по 24 бита (минус 1), little-endian.
    if (buf.length < 30) throw ApiError.badRequest('Повреждённый WebP (VP8X): обрезанный заголовок');
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }

  throw ApiError.badRequest('Неподдерживаемый тип чанка WebP');
}

function readDimensions(format, buf) {
  switch (format) {
    case 'png':
      return readPngDimensions(buf);
    case 'gif':
      return readGifDimensions(buf);
    case 'jpeg':
      return readJpegDimensions(buf);
    case 'webp':
      return readWebpDimensions(buf);
    default:
      throw ApiError.badRequest('Неизвестный формат изображения');
  }
}

// ----------------------------------------------- проверка на полиглот

/**
 * Настоящее растровое изображение никогда не начинается с HTML/скрипта. Если в
 * первых 2 КБ встречается один из этих маркеров — перед нами полиглот или файл,
 * который старый браузер может «пронюхать» как HTML. Отклоняем.
 */
const POLYGLOT_MARKERS = ['<?php', '<script', '<!doctype html', '<svg', '<html'];

function hasEmbeddedPayload(buf) {
  const head = buf.subarray(0, HEADER_SCAN_BYTES).toString('latin1').toLowerCase();
  return POLYGLOT_MARKERS.some((m) => head.includes(m));
}

// ------------------------------------------------------------- главное API

/**
 * Проверить сохранённый на диск файл.
 *
 * @param {string} filePath     абсолютный путь к уже записанному multer-ом файлу
 * @param {string} declaredMime заявленный клиентом MIME (file.mimetype)
 * @returns {Promise<{ ok: true, format: string, width: number, height: number }>}
 * @throws  {ApiError} badRequest с русским сообщением при любом нарушении
 */
async function inspectImage(filePath, declaredMime) {
  let buf;
  try {
    // Читаем только начало файла: заголовков достаточно, весь файл в память не тянем.
    const fh = await fs.promises.open(filePath, 'r');
    try {
      const size = 64 * 1024; // 64 КБ с запасом хватает на любой заголовок из поддерживаемых
      const chunk = Buffer.alloc(size);
      const { bytesRead } = await fh.read(chunk, 0, size, 0);
      buf = chunk.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  } catch {
    throw ApiError.badRequest('Не удалось прочитать загруженный файл');
  }

  const stat = await fs.promises.stat(filePath).catch(() => null);
  const fileSize = stat ? stat.size : buf.length;

  if (fileSize === 0) throw ApiError.badRequest('Загружен пустой файл');

  // 1. Определяем настоящий формат по магическим байтам.
  const format = sniffFormat(buf);
  if (!format) {
    throw ApiError.badRequest('Файл не является изображением поддерживаемого формата (JPEG, PNG, WebP, GIF)');
  }

  // 5. Полиглот-проверка (раньше разбора размеров: подозрительный файл дальше не пускаем).
  if (hasEmbeddedPayload(buf)) {
    throw ApiError.badRequest('Файл содержит подозрительное содержимое и отклонён');
  }

  // 2. Кросс-проверка настоящего формата с заявленным MIME и расширением на диске.
  const rule = FORMAT_RULES[format];
  const mime = String(declaredMime || '').toLowerCase().trim();
  if (mime && !rule.mimes.includes(mime)) {
    throw ApiError.badRequest('Тип файла не совпадает с его содержимым');
  }
  const ext = extensionOf(filePath);
  if (ext && ext !== rule.ext) {
    // Особый случай: .jpeg — допустимый синоним .jpg для формата JPEG.
    const jpegSynonym = format === 'jpeg' && ext === '.jpeg';
    if (!jpegSynonym) {
      throw ApiError.badRequest('Расширение файла не совпадает с его содержимым');
    }
  }

  // 3. Разбор размеров из заголовков (без декодирования пикселей).
  const { width, height } = readDimensions(format, buf);

  if (!width || !height) {
    throw ApiError.badRequest('Некорректные размеры изображения');
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw ApiError.badRequest(`Слишком большое изображение: сторона не должна превышать ${MAX_DIMENSION} px`);
  }

  // 4. Защита от «декомпрессионной бомбы».
  const megapixels = (width * height) / 1_000_000;
  if (megapixels > MAX_MEGAPIXELS) {
    throw ApiError.badRequest(`Слишком детальное изображение: не более ${MAX_MEGAPIXELS} мегапикселей`);
  }

  // Соотношение «пикселей на байт файла». Разумный порог: даже сильно сжатый
  // формат (PNG-паллитра, WebP-lossless) на реальных картинках даёт заметно
  // меньше ~100 пикселей на байт. Файл в 30 КБ, заявляющий 40 Мп, — это
  // ~1365 пикс/байт: физически невозможно для честного изображения и является
  // классической «бомбой», распаковка которой выест память. Берём порог 200
  // пикс/байт: он с запасом пропускает любые настоящие изображения, но ловит
  // заголовки, у которых объявленная площадь не подкреплена данными в файле.
  const PIXELS_PER_BYTE_LIMIT = 200;
  const pixelsPerByte = (width * height) / fileSize;
  if (pixelsPerByte > PIXELS_PER_BYTE_LIMIT) {
    throw ApiError.badRequest('Изображение выглядит как «бомба» распаковки и отклонено');
  }

  return { ok: true, format, width, height };
}

module.exports = { inspectImage, sniffFormat, FORMAT_RULES };
