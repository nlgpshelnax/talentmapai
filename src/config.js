'use strict';

require('dotenv').config();

const path = require('path');
const crypto = require('crypto');

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

/**
 * JWT secret.
 * In production a real secret is mandatory — we refuse to boot with a default,
 * because a predictable secret means anyone can forge a session token.
 * In development we generate a random one per boot (tokens simply don't survive
 * a restart, which is the safe failure mode).
 */
function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) return fromEnv;

  if (IS_PROD) {
    throw new Error(
      'JWT_SECRET is required in production and must be at least 32 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  if (fromEnv) {
    console.warn('[config] JWT_SECRET is shorter than 32 chars — ignoring it and using an ephemeral dev secret.');
  } else {
    console.warn('[config] JWT_SECRET not set — using an ephemeral dev secret (sessions reset on restart).');
  }
  return crypto.randomBytes(48).toString('hex');
}

/**
 * Обязательный секрет для боевого сервера.
 *
 * Пароль администратора по умолчанию — это дыра, которую невозможно закрыть
 * позже: аккаунт создаётся при первом запуске, и если переменная не задана,
 * он навсегда останется с паролем из открытого исходника.
 */
function requireInProd(value, name, hint) {
  if (value) return value;
  if (IS_PROD) {
    throw new Error(
      `${name} обязателен на боевом сервере. ${hint}`
    );
  }
  return null;
}

/**
 * Доверие к заголовкам обратного прокси.
 *
 * Раньше стояло безусловное `trust proxy: 1`. Если приложение смотрит в
 * интернет напрямую, любой клиент может прислать X-Forwarded-For с выдуманным
 * адресом — и все ограничения по частоте обходятся сменой одной строки в
 * запросе. Подбор пароля и наводнение запросами в таком режиме не блокируются
 * вообще. Теперь доверие включается явно и только когда прокси действительно
 * есть.
 */
function resolveTrustProxy() {
  const raw = (process.env.TRUST_PROXY || '').trim();
  if (!raw || raw === 'false' || raw === '0') return false;
  if (raw === 'true') return 1;
  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;
  // Список адресов или подсетей: '10.0.0.0/8, 172.16.0.0/12'
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const config = {
  env: NODE_ENV,
  isProd: IS_PROD,
  port: Number(process.env.PORT) || 3000,
  trustProxy: resolveTrustProxy(),

  /**
   * Пороги защиты от перегрузки. Вынесены в переменные окружения, потому что
   * подходящие числа зависят от того, сколько за приложением стоит железа и
   * есть ли впереди кеширующий прокси.
   */
  limits: {
    // Медленные соединения: клиент открывает сокет и тянет заголовки по байту.
    headersTimeoutMs: Number(process.env.HEADERS_TIMEOUT_MS) || 20 * 1000,
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS) || 45 * 1000,
    keepAliveTimeoutMs: Number(process.env.KEEPALIVE_TIMEOUT_MS) || 15 * 1000,
    // Потолок одновременных соединений: дальше сервер отказывает быстро,
    // вместо того чтобы захлебнуться и не ответить никому.
    maxConnections: Number(process.env.MAX_CONNECTIONS) || 512,
    // Сколько запросов одновременно обрабатываем, прежде чем сбрасывать нагрузку.
    maxConcurrentRequests: Number(process.env.MAX_CONCURRENT_REQUESTS) || 120,
    jsonBodyBytes: process.env.JSON_BODY_LIMIT || '256kb',
  },

  /** Блокировка учётной записи после серии неудачных входов. */
  lockout: {
    maxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS) || 8,
    windowMs: Number(process.env.LOGIN_WINDOW_MS) || 15 * 60 * 1000,
    lockMs: Number(process.env.LOGIN_LOCK_MS) || 15 * 60 * 1000,
  },

  jwt: {
    secret: resolveJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '72h',
  },

  db: {
    // Kept outside the source tree so it is easy to back up / mount as a volume.
    path: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'talentmap.db'),
  },

  uploads: {
    dir: process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'),
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES) || 5 * 1024 * 1024, // 5 MB
    allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },

  cors: {
    // Comma-separated list. Empty in dev = reflect the Vite origin.
    origins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  captcha: {
    secret: process.env.YANDEX_CAPTCHA_SECRET_KEY || '',
    // Captcha is only enforced when a secret is actually configured.
    get enabled() {
      return Boolean(this.secret);
    },
  },

  ai: {
    apiKey: process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.AI_API_URL || 'https://api.groq.com/openai/v1',
    model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 20000,
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  gamification: {
    xpPerStar: 50,
    trialStarLimit: 3,
  },

  admin: {
    // Учётная запись администратора создаётся при первом запуске.
    email: process.env.ADMIN_EMAIL || 'admin@talentmap.ai',
    password: requireInProd(
      process.env.ADMIN_PASSWORD,
      'ADMIN_PASSWORD',
      'Задайте его в переменных окружения: пароль из исходного кода известен всем, кто видел репозиторий.'
    ) || 'admin12345',
  },

  demo: {
    email: 'demo@talentmap.ai',
    password: 'demo123',
    /**
     * Демо-аккаунт с общеизвестным паролем нужен для показа и статической
     * демоверсии. На боевом сервере это просто открытая дверь, поэтому там он
     * не создаётся — если только владелец не включит его сознательно.
     */
    enabled: !IS_PROD || process.env.ENABLE_DEMO_ACCOUNT === 'true',
  },
};

/**
 * Предупреждения о слабой настройке. Не роняем запуск — владелец мог сознательно
 * поднять стенд, — но молчать о дыре нельзя.
 */
if (IS_PROD) {
  if (!config.cors.origins.length) {
    console.warn('[config] CORS_ORIGINS не задан: браузерные запросы с других доменов будут отклонены.');
  }
  if (config.trustProxy === false) {
    console.warn(
      '[config] TRUST_PROXY не задан. Если приложение стоит за nginx или Cloudflare, ' +
        'ограничения по частоте будут считаться по адресу прокси, а не пользователя.'
    );
  }
  if (!config.captcha.enabled) {
    console.warn('[config] Капча не настроена: регистрация открыта для автоматических скриптов.');
  }
  if (config.demo.enabled) {
    console.warn('[config] ВНИМАНИЕ: демо-аккаунт с общеизвестным паролем включён на боевом сервере.');
  }
}

module.exports = config;
