import { handle, HttpError, resetDemo } from './backend';

/**
 * Demo mode.
 *
 * Enabled at build time with VITE_DEMO=1 (see .github/workflows/pages.yml).
 * It swaps axios's transport for an in-browser implementation of the API, so
 * the exact same React app can be published to GitHub Pages — which serves
 * static files only and cannot run Node, Express or SQLite.
 *
 * Nothing in the pages or components is aware of this: they keep calling
 * `api.get('/app-state')` as usual.
 */

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

/** Small delay so loading states are visible and the UI feels real. */
const LATENCY_MS = 120;

function parseQuery(config) {
  const query = { ...(config.params || {}) };
  const qIndex = (config.url || '').indexOf('?');
  if (qIndex !== -1) {
    for (const [k, v] of new URLSearchParams(config.url.slice(qIndex + 1))) query[k] = v;
  }
  return query;
}

function parseBody(config) {
  const { data } = config;
  if (data == null) return {};
  if (typeof FormData !== 'undefined' && data instanceof FormData) return data;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return data;
}

function demoAdapter(config) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      const method = String(config.method || 'get').toUpperCase();
      const url = config.url || '/';

      try {
        const result = await handle({
          method,
          url,
          body: parseBody(config),
          headers: config.headers || {},
          query: parseQuery(config),
        });

        resolve({
          data: result.data,
          status: result.status || 200,
          statusText: 'OK',
          headers: {},
          config,
          request: {},
        });
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        const payload = err instanceof HttpError ? err.payload : { error: 'Внутренняя ошибка демоверсии' };

        if (!(err instanceof HttpError)) console.error('[demo] необработанная ошибка:', err);

        // Shape the rejection like a real axios error so errorMessage() and the
        // 401/402 handling in the app work unchanged.
        const error = new Error(payload.error);
        error.isAxiosError = true;
        error.config = config;
        error.response = { data: payload, status, statusText: '', headers: {}, config };
        reject(error);
      }
    }, LATENCY_MS);
  });
}

/** Point an axios instance at the in-browser backend. */
export function installDemoBackend(api) {
  if (!IS_DEMO) return false;
  api.defaults.adapter = demoAdapter;
  return true;
}

export { resetDemo };
