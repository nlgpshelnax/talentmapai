'use strict';

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const config = require('../config');
const { ApiError } = require('./error');

/**
 * Защита от перегрузки.
 *
 * Честная граница возможного: объёмную атаку в сотни гигабит приложением на
 * Node не отбить — трафик умрёт на канале до того, как дойдёт до процесса. Для
 * этого нужен внешний рубеж, и он описан в DEPLOY.md. Здесь закрывается то,
 * что действительно решается в коде: прикладная атака одним ноутбуком —
 * медленные соединения, наводнение дорогими запросами, подбор пароля,
 * сканирование чужих движков.
 */

/* ─────────────────────────────────────────────── ключ ограничения */

/**
 * По кому считаем частоту.
 *
 * Только по адресу считать нельзя: у мобильного оператора за одним адресом
 * сидит полгорода, и один школьник заблокирует всех. Только по аккаунту тоже
 * нельзя: до входа аккаунта ещё нет. Поэтому у авторизованного считаем по
 * идентификатору пользователя, у остальных — по адресу.
 *
 * Для IPv6 берём подсеть /56, а не отдельный адрес: провайдер выдаёт клиенту
 * целый блок, и перебор адресов внутри него ничего не стоит.
 */
function identityKey(req) {
  if (req.user?.id) return `u:${req.user.id}`;
  return `ip:${ipKeyGenerator(req.ip)}`;
}

const tooMany = (message) => ({ error: message });

/** Фабрика ограничителя с общими настройками. */
function limiter({ windowMs, limit, message, skipSuccess = false }) {
  return rateLimit({
    windowMs,
    limit: config.isProd ? limit : limit * 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: identityKey,
    skipSuccessfulRequests: skipSuccess,
    message: tooMany(message),
  });
}

/**
 * Ограничения разведены по стоимости запроса.
 *
 * Раньше на весь API стоял один потолок в 200 запросов в минуту. Проверка
 * состояния сервера и обращение к языковой модели стоили одинаково, хотя
 * первое — это одна строка в ответе, а второе — секунды работы и деньги.
 */
const limits = {
  /** Общий потолок: последний рубеж, не основная защита. */
  global: limiter({
    windowMs: 60 * 1000,
    limit: 300,
    message: 'Слишком много запросов, попробуйте чуть позже',
  }),

  /** Вход и регистрация — главная цель подбора паролей. */
  auth: limiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: 'Слишком много попыток. Попробуйте через несколько минут.',
  }),

  /** Родительский PIN — всего четыре цифры, перебирается за минуты. */
  pin: limiter({
    windowMs: 10 * 60 * 1000,
    limit: 8,
    message: 'Слишком много попыток ввода PIN-кода. Подождите десять минут.',
  }),

  /** Загрузка файлов: каждая — запись на диск и разбор изображения. */
  upload: limiter({
    windowMs: 60 * 1000,
    limit: 12,
    message: 'Слишком много загрузок подряд. Подождите минуту.',
  }),

  /** Запись в базу: отметки о выполнении, покупки, правки профиля. */
  write: limiter({
    windowMs: 60 * 1000,
    limit: 60,
    message: 'Слишком много изменений подряд. Подождите немного.',
  }),

  /** Чтение каталога и состояния — самые частые запросы, потолок выше. */
  read: limiter({
    windowMs: 60 * 1000,
    limit: 240,
    message: 'Слишком много запросов, попробуйте чуть позже',
  }),

  /** Административные операции: их мало, но каждая дорогая. */
  admin: limiter({
    windowMs: 60 * 1000,
    limit: 90,
    message: 'Слишком много административных операций подряд.',
  }),
};

/* ───────────────────────────────────── прогрессивное замедление */

/**
 * Замедление вместо отказа.
 *
 * Жёсткий отказ на 429 сообщает атакующему, где именно проходит граница, и он
 * подстраивает темп. Плавная задержка перед ответом делает перебор
 * бессмысленным по времени, но почти не мешает живому человеку, который
 * случайно нажал кнопку три раза подряд.
 *
 * Счётчик живёт в памяти и чистится по окну — отдельного хранилища тут не
 * нужно: задержка полезна только в пределах одной атакующей серии.
 */
function slowDown({ windowMs = 60 * 1000, after = 20, stepMs = 250, maxDelayMs = 4000 } = {}) {
  const hits = new Map();

  // Периодическая уборка, чтобы карта не росла бесконечно от разовых гостей.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweeper.unref();

  return (req, res, next) => {
    const key = identityKey(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const over = entry.count - after;
    if (over <= 0) return next();

    const delay = Math.min(over * stepMs, maxDelayMs);
    const timer = setTimeout(next, delay);
    // Клиент отвалился — не держим таймер и обработчик зря.
    res.on('close', () => clearTimeout(timer));
  };
}

/* ─────────────────────────────────────────── сброс нагрузки */

/**
 * Потолок одновременной обработки.
 *
 * Без него сервер под наплывом принимает всё подряд, очередь событий растёт,
 * и в какой-то момент он перестаёт отвечать вообще — включая тех, кто пришёл
 * первым. Лучше честно отказать лишним с кодом 503 и заголовком Retry-After:
 * те, кто уже внутри, дождутся ответа.
 */
function loadShedder({ max = config.limits.maxConcurrentRequests } = {}) {
  let inFlight = 0;

  return (req, res, next) => {
    // Проверка живости должна отвечать даже под нагрузкой — иначе оркестратор
    // решит, что приложение умерло, и перезапустит его в худший момент.
    if (req.path === '/api/health') return next();

    if (inFlight >= max) {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ error: 'Сервер сейчас перегружен. Повторите запрос через пару секунд.' });
    }

    inFlight += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight -= 1;
    };
    res.on('finish', release);
    res.on('close', release);
    next();
  };
}

/* ────────────────────────────────────── отсев сканеров */

/**
 * Типичные пути автоматических сканеров.
 *
 * Любой сайт в интернете круглосуточно перебирают на предмет чужих движков:
 * админка WordPress, дампы баз, файлы окружения, каталоги .git. У нас ничего
 * этого нет, но каждый такой запрос проходит через маршрутизацию и отдаёт
 * страницу приложения весом в сотни килобайт. Отвечаем сразу и коротко.
 */
const SCANNER_PATHS =
  /^\/(?:wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|\.env|\.git|\.svn|\.aws|\.ssh|config\.(?:php|json|yml)|phpmyadmin|pma|adminer|vendor\/phpunit|cgi-bin|actuator|solr|jenkins|\.well-known\/security\.txt$)/i;

/** Расширения, которых в этом приложении не существует в принципе. */
const ALIEN_EXTENSIONS = /\.(?:php\d?|asp|aspx|jsp|cgi|pl|sh|bak|sql|old|swp|env)$/i;

function blockScanners(req, res, next) {
  const path = req.path || '';
  if (SCANNER_PATHS.test(path) || ALIEN_EXTENSIONS.test(path)) {
    // Ни подсказки о движке, ни разметки — просто короткий отказ.
    return res.status(404).type('text/plain').send('Not found');
  }

  // Обход каталогов в закодированном виде. Express нормализует путь, но
  // проверка стоит копейки и ловит попытку до всех остальных обработчиков.
  if (/%2e%2e|\.\.[/\\]/i.test(req.originalUrl || '')) {
    return res.status(400).type('text/plain').send('Bad request');
  }

  next();
}

/* ──────────────────────────────────── размер и форма запроса */

/**
 * Отсекаем запросы с неправдоподобно большим заявленным телом до того, как
 * начнём его читать. Разбор тела сам по себе стоит памяти, и ждать, пока
 * express.json дочитает мегабайты и выбросит ошибку, незачем.
 */
function rejectOversized(maxBytes = 2 * 1024 * 1024) {
  return (req, res, next) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > maxBytes) {
      return next(ApiError.tooLarge('Тело запроса слишком большое'));
    }
    next();
  };
}

/**
 * Число заголовков и их суммарный размер.
 *
 * Node ограничивает их сам, но по умолчанию довольно щедро. Запрос с сотней
 * заголовков — это не браузер, это инструмент.
 */
function rejectHeaderFlood(maxHeaders = 60) {
  return (req, res, next) => {
    if (Object.keys(req.headers).length > maxHeaders) {
      return res.status(431).type('text/plain').send('Too many headers');
    }
    next();
  };
}

/* ────────────────────────────────── сторож медленных соединений */

/**
 * Жёсткий срок на получение запроса.
 *
 * Встроенный `server.headersTimeout` в проверке не сработал: клиент, который
 * подкидывает по заголовку каждые три секунды, держит соединение сколько
 * угодно. Это ровно та самая медленная атака — несколько сотен таких сокетов
 * исчерпывают пул, и сервер перестаёт отвечать живым людям, при том что
 * трафика почти нет.
 *
 * Поэтому срок считаем сами и от момента открытия соединения: не «сколько
 * молчал», а «сколько прошло всего». Подкидывание байтов такой счётчик не
 * сбрасывает, и растянуть запрос на минуты нельзя.
 */
function guardSlowConnections(server, { headersMs, idleMs }) {
  const armDeadline = (socket) => {
    clearTimeout(socket._headersDeadline);
    socket._headersDeadline = setTimeout(() => {
      // Никакой вежливости: ответ отнимает время, а собеседник — не браузер.
      socket.destroy();
    }, headersMs);
    // Таймер не должен удерживать процесс при остановке.
    socket._headersDeadline.unref?.();
  };

  server.on('connection', (socket) => {
    armDeadline(socket);
    // Простой без единого байта — второй рубеж, дешевле и срабатывает раньше.
    socket.setTimeout(idleMs, () => socket.destroy());
    socket.on('close', () => clearTimeout(socket._headersDeadline));
  });

  // Запрос доехал целиком — снимаем срок. На keep-alive соединении заводим
  // его заново под следующий запрос, иначе после первого обращения сокет
  // становится бессрочным.
  server.on('request', (req, res) => {
    clearTimeout(req.socket._headersDeadline);
    res.on('finish', () => {
      if (!req.socket.destroyed) armDeadline(req.socket);
    });
  });

  return server;
}

module.exports = {
  limits,
  guardSlowConnections,
  slowDown,
  loadShedder,
  blockScanners,
  rejectOversized,
  rejectHeaderFlood,
  identityKey,
};
