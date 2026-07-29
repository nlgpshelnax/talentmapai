'use strict';

const path = require('path');
const fs = require('fs');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const config = require('./src/config');
const { createSchema } = require('./src/db/schema');
const { seedAll } = require('./src/db/seed');
const { apiNotFound, errorHandler } = require('./src/middleware/error');
const {
  limits,
  guardSlowConnections,
  slowDown,
  loadShedder,
  blockScanners,
  rejectOversized,
  rejectHeaderFlood,
} = require('./src/middleware/security');
const lockout = require('./src/services/lockout');
const { enabled: aiEnabled } = require('./src/services/ai');

const app = express();

/**
 * Доверие к заголовкам прокси включается только явно, через TRUST_PROXY.
 *
 * Безусловное доверие означало, что любой клиент подставляет в X-Forwarded-For
 * что угодно и получает чистый счётчик ограничений на каждый запрос. То есть
 * защиты от подбора пароля и наводнения запросами не было вовсе.
 */
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
// Заголовок ETag на ответах API выдаёт, изменились ли данные, даже когда сам
// ответ закрыт авторизацией. Для статики он остаётся — там это полезно.
app.set('etag', false);

// ---------------------------------------------------------------- security

/**
 * The prototype ran bare Express behind `cors()` with no headers and no limits.
 * CSP is relaxed for inline styles only (Tailwind injects a stylesheet, and the
 * SPA needs to talk to its own origin plus the captcha widget).
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://smartcaptcha.yandexcloud.net'],
        // Tailwind вставляет стили в разметку, поэтому inline-стили разрешены.
        // Inline-скрипты — нет: это принципиальная разница, вся защита от
        // внедрения кода держится именно на запрете script-src 'unsafe-inline'.
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        // Раньше стояло `https:` — то есть картинку можно было подгрузить с
        // любого сайта в интернете. Это канал утечки: адрес запроса за
        // изображением уносит на чужой сервер реферер и факт визита.
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://smartcaptcha.yandexcloud.net'],
        frameSrc: ["'self'", 'https://smartcaptcha.yandexcloud.net'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Запрет встраивания в чужой фрейм: без него страницу накрывают
        // прозрачным слоем и заставляют ребёнка нажимать не то, что он видит.
        frameAncestors: ["'none'"],
        ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // Полгода HSTS с поддоменами: браузер перестаёт даже пробовать http.
    hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true, preload: false } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    // Uploaded images are served to the SPA from the same origin.
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

/**
 * Порядок здесь важен: сначала самые дешёвые отказы.
 *
 * Сканеры и запросы с абсурдным объёмом отбрасываются до разбора тела,
 * авторизации и обращений к базе — иначе каждый мусорный запрос стоит нам
 * столько же, сколько настоящий.
 */
app.use(blockScanners);
app.use(rejectHeaderFlood());
app.use(rejectOversized());
app.use(loadShedder());

app.use(
  cors({
    origin(origin, cb) {
      // Same-origin / curl / server-side calls have no Origin header.
      if (!origin) return cb(null, true);
      if (!config.cors.origins.length) {
        // Dev default: allow the Vite dev server on localhost.
        return cb(null, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
      }
      return cb(null, config.cors.origins.includes(origin));
    },
    credentials: true,
  })
);

app.use(compression());
// Тело запроса урезано с мегабайта до четверти: самый большой JSON в приложении
// — это ответы диагностики, они не превышают нескольких килобайт. Файлы идут
// отдельным путём через multer со своим ограничением.
app.use(express.json({ limit: config.limits.jsonBodyBytes }));
app.use(express.urlencoded({ extended: true, limit: config.limits.jsonBodyBytes }));

/**
 * Общий потолок на API плюс плавное замедление.
 *
 * Замедление важнее жёсткого отказа: оно не сообщает атакующему точную границу
 * и делает перебор бессмысленным по времени, почти не мешая человеку.
 * Точечные ограничения по классам маршрутов навешены в самих маршрутах.
 */
app.use('/api', limits.global);
app.use('/api', slowDown({ after: config.isProd ? 40 : 400 }));

// ------------------------------------------------------------------ routes

/**
 * Проверка живости.
 *
 * На боевом сервере отвечает односложно: окружение, режим ИИ и время работы —
 * это разведданные. По времени работы видно, когда последний раз обновлялись,
 * то есть какие уязвимости могли остаться незакрытыми.
 */
app.get('/api/health', (req, res) => {
  if (config.isProd) return res.json({ status: 'ok' });
  res.json({
    status: 'ok',
    env: config.env,
    ai: aiEnabled() ? 'live' : 'offline',
    uptime: Math.round(process.uptime()),
  });
});

// Ограничения разведены по стоимости: чтение каталога и обращение к языковой
// модели не должны стоить одинаково.
app.use('/api/auth', limits.auth, require('./src/routes/auth'));
app.use('/api/app-state', limits.read, require('./src/routes/appState'));
app.use('/api/diagnostics', limits.write, require('./src/routes/diagnostics'));
app.use('/api/progress', limits.write, require('./src/routes/progress'));
app.use('/api/portfolio', limits.upload, require('./src/routes/portfolio'));
app.use('/api/store', limits.write, require('./src/routes/store'));
app.use('/api/venues', limits.read, require('./src/routes/venues'));
app.use('/api/users', limits.write, require('./src/routes/users'));
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/admin', limits.admin, require('./src/routes/admin'));

app.use('/api', apiNotFound);

// ----------------------------------------------------------- static + SPA

// User uploads. `immutable` is safe because filenames contain a random token.
app.use(
  '/uploads',
  express.static(config.uploads.dir, {
    maxAge: '30d',
    immutable: true,
    index: false,
    dotfiles: 'deny',
    setHeaders(res) {
      /**
       * Файл сюда попадает только после проверки сигнатуры, но защита строится
       * слоями. Эти два заголовка означают: что бы ни лежало внутри, браузер
       * обязан считать это вложением заданного типа и не пытаться угадать
       * разметку. Без них старый браузер может отрисовать «картинку» как
       * страницу — и она получит доступ к сеансу пользователя.
       */
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  })
);

/**
 * Serve the built React app.
 *
 * This is the single biggest gap in the prototype: server.js only ever served
 * an empty `public/` folder and had no SPA fallback, so there was no way to run
 * the product outside the Vite dev server. Now one `npm start` serves the API
 * and the client together.
 */
const CLIENT_DIST = path.join(__dirname, 'client', 'dist');
const hasBuild = fs.existsSync(path.join(CLIENT_DIST, 'index.html'));

if (hasBuild) {
  // Hashed asset filenames — cache hard; index.html must never be cached.
  app.use(
    express.static(CLIENT_DIST, {
      maxAge: '1y',
      immutable: true,
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );

  // Client-side routing: anything not matched above returns the shell.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res
      .status(503)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><title>TalentMap AI</title>
         <div style="font:16px/1.6 system-ui;max-width:640px;margin:15vh auto;padding:0 24px;color:#e2e8f0;background:#0f172a">
           <h1 style="color:#fbbf24">Клиент не собран</h1>
           <p>API работает, но собранного фронтенда нет. Выполните:</p>
           <pre style="background:#1e293b;padding:16px;border-radius:8px">npm run build</pre>
           <p>или запустите dev-сервер Vite: <code>npm --prefix client run dev</code></p>
         </div>`
      );
  });
}

app.use(errorHandler);

// ------------------------------------------------------------------ boot

async function start() {
  await createSchema();
  await seedAll();

  // Периодическая уборка счётчиков неудачных попыток.
  const sweeper = setInterval(() => lockout.sweep().catch(() => {}), 60 * 60 * 1000);
  sweeper.unref();

  const server = app.listen(config.port, () => {
    console.log(`\n  TalentMap AI — сервер запущен`);
    console.log(`  http://localhost:${config.port}`);
    console.log(`  окружение: ${config.env} · ИИ: ${aiEnabled() ? 'подключён' : 'демо-режим'}`);
    console.log(`  клиент: ${hasBuild ? 'собран' : 'НЕ собран — выполните npm run build'}\n`);
  });

  /**
   * Защита от медленных соединений.
   *
   * Классическая атака одним ноутбуком: открыть несколько сотен сокетов и
   * отдавать заголовки по байту в секунду. Соединения не закрываются, пул
   * исчерпан, сервер не отвечает никому — при том что трафика почти нет.
   * Значения по умолчанию в Node для этого слишком щедрые.
   */
  server.headersTimeout = config.limits.headersTimeoutMs;
  server.requestTimeout = config.limits.requestTimeoutMs;
  server.keepAliveTimeout = config.limits.keepAliveTimeoutMs;
  server.maxRequestsPerSocket = 400;

  // Встроенных таймаутов недостаточно: клиент, подкидывающий по заголовку раз
  // в несколько секунд, живёт бесконечно. Свой сторож считает срок от открытия
  // соединения и не даёт растянуть запрос.
  guardSlowConnections(server, {
    headersMs: config.limits.headersTimeoutMs,
    idleMs: config.limits.keepAliveTimeoutMs,
  });

  /**
   * Потолок одновременных соединений. Лишним отказываем сразу на уровне сокета:
   * это дешевле, чем принять соединение и захлебнуться на разборе запроса.
   */
  server.maxConnections = config.limits.maxConnections;

  const shutdown = (signal) => {
    console.log(`\n[${signal}] завершение работы…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Критическая ошибка при запуске:', err);
    process.exit(1);
  });
}

module.exports = { app, start };
