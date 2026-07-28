import axios from 'axios';
import { installDemoBackend } from '@demo';

/**
 * Single axios instance for the whole app.
 *
 * The prototype mutated `axios.defaults` from AuthContext, so every module
 * shared hidden global state and a logout in one place could leave a stale
 * Authorization header elsewhere. The token lives in one module here.
 */
const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// In the static GitHub Pages build there is no server, so requests are served
// by an in-browser implementation of the same API. No-op in normal builds.
installDemoBackend(api);

const TOKEN_KEY = 'talentmap.token';

let onUnauthorized = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / storage disabled — the in-memory header still works */
  }
}

api.interceptors.request.use((cfg) => {
  const token = getToken();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    if (status === 401 && onUnauthorized) onUnauthorized();
    return Promise.reject(error);
  }
);

/** Pull a human-readable Russian message out of any failure shape. */
export function errorMessage(error, fallback = 'Что-то пошло не так. Попробуйте ещё раз.') {
  const data = error?.response?.data;
  if (data?.details?.length) return data.details.map((d) => d.message).join('. ');
  if (data?.error) return data.error;
  if (error?.code === 'ECONNABORTED') return 'Сервер не отвечает. Проверьте соединение.';
  if (error?.message === 'Network Error') return 'Нет связи с сервером.';
  return fallback;
}

export default api;
