'use strict';

const path = require('path');
const fs = require('fs');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./src/config');
const { createSchema } = require('./src/db/schema');
const { seedAll } = require('./src/db/seed');
const { apiNotFound, errorHandler } = require('./src/middleware/error');
const { enabled: aiEnabled } = require('./src/services/ai');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

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
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https://smartcaptcha.yandexcloud.net'],
        frameSrc: ["'self'", 'https://smartcaptcha.yandexcloud.net'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    // Uploaded images are served to the SPA from the same origin.
    crossOriginResourcePolicy: { policy: 'same-site' },
  })
);

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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/** Blanket API limiter; auth and AI routes add their own tighter caps. */
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: config.isProd ? 200 : 2000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Слишком много запросов, попробуйте чуть позже' },
  })
);

// ------------------------------------------------------------------ routes

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    env: config.env,
    ai: aiEnabled() ? 'live' : 'offline',
    uptime: Math.round(process.uptime()),
  });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/app-state', require('./src/routes/appState'));
app.use('/api/diagnostics', require('./src/routes/diagnostics'));
app.use('/api/progress', require('./src/routes/progress'));
app.use('/api/portfolio', require('./src/routes/portfolio'));
app.use('/api/store', require('./src/routes/store'));
app.use('/api/venues', require('./src/routes/venues'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/admin', require('./src/routes/admin'));

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

  const server = app.listen(config.port, () => {
    console.log(`\n  TalentMap AI — сервер запущен`);
    console.log(`  http://localhost:${config.port}`);
    console.log(`  окружение: ${config.env} · ИИ: ${aiEnabled() ? 'подключён' : 'демо-режим'}`);
    console.log(`  клиент: ${hasBuild ? 'собран' : 'НЕ собран — выполните npm run build'}\n`);
  });

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
