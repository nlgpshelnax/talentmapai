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

const config = {
  env: NODE_ENV,
  isProd: IS_PROD,
  port: Number(process.env.PORT) || 3000,

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
    // Bootstrap admin account, created on first run if it does not exist.
    email: process.env.ADMIN_EMAIL || 'admin@talentmap.ai',
    password: process.env.ADMIN_PASSWORD || 'admin12345',
  },

  demo: {
    email: 'demo@talentmap.ai',
    password: 'demo123',
  },
};

module.exports = config;
