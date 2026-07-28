/**
 * Заглушка для обычной сборки.
 *
 * vite.config.js подменяет «@demo» на этот файл, когда VITE_DEMO не задан, —
 * иначе браузерный бэкенд и снимок данных (около 140 КБ) попадали бы в
 * продакшен-бандл, где они никогда не используются.
 */
export const IS_DEMO = false;
export function installDemoBackend() {
  return false;
}
export function resetDemo() {}
