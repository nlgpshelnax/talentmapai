'use strict';

/**
 * Проверка зависимостей на известные уязвимости.
 *
 * Обычный `npm audit` для этого проекта бесполезен как ворота сборки: он
 * навсегда останется красным из-за одной находки, которая к нам не применима.
 * Просто игнорировать его тоже нельзя — тогда пропустим настоящую.
 *
 * Поэтому здесь список исключений, и у каждого написано, почему оно
 * исключение. Всё, чего в списке нет, роняет проверку.
 *
 * Usage: npm run audit
 */

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.dirname(__dirname);

/**
 * Осознанные исключения.
 *
 * Правило одно: сюда попадает только то, чего в нашей сборке физически нет.
 * «Наверное, не страшно» — не основание. Каждую запись нужно перепроверять
 * при обновлении зависимости, поэтому у неё стоит дата и условие снятия.
 */
const ACCEPTED = [
  {
    package: 'react-router',
    where: 'client',
    reason:
      'Обход защиты от подделки запросов в режиме React Server Components. ' +
      'Приложение — обычный клиентский SPA: используются только BrowserRouter, ' +
      'Routes, Route, Link и хуки. Ни createBrowserRouter, ни RouterProvider, ' +
      'ни загрузчиков с действиями, ни серверного рендера в сборке нет — ' +
      'уязвимый код не подключается.',
    reviewedAt: '2026-07-30',
    removeWhen: 'выйдет react-router 8.3.0 или новее — обновиться и убрать это исключение',
  },
  {
    package: 'react-router-dom',
    where: 'client',
    reason: 'Тянется вместе с react-router, та же причина.',
    reviewedAt: '2026-07-30',
    removeWhen: 'вместе с react-router',
  },
];

function audit(dir) {
  try {
    const out = execFileSync('npm', ['audit', '--json'], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out);
  } catch (err) {
    // При найденных уязвимостях npm выходит с ненулевым кодом, но отчёт всё
    // равно печатает в stdout — он нам и нужен.
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

function check(dir, label) {
  const report = audit(dir);
  const found = Object.entries(report.vulnerabilities || {});
  const unexpected = [];

  for (const [name, info] of found) {
    const accepted = ACCEPTED.find((a) => a.package === name && a.where === label);
    if (!accepted) unexpected.push({ name, severity: info.severity, label });
  }

  return { label, total: found.length, unexpected, counts: report.metadata?.vulnerabilities };
}

const line = '─'.repeat(64);
console.log(`\nПроверка зависимостей на известные уязвимости\n${line}`);

const results = [check(ROOT, 'server'), check(path.join(ROOT, 'client'), 'client')];
let failed = false;

for (const r of results) {
  const accepted = r.total - r.unexpected.length;
  console.log(
    `${r.label.padEnd(8)} найдено ${String(r.total).padStart(2)} · ` +
      `принято как исключение ${accepted} · требует внимания ${r.unexpected.length}`
  );
  for (const u of r.unexpected) {
    failed = true;
    console.log(`   ✗ ${u.name} [${u.severity}]`);
  }
}

if (ACCEPTED.length) {
  console.log(`\nОсознанные исключения (${ACCEPTED.length}):`);
  for (const a of ACCEPTED) {
    console.log(`   • ${a.package} (${a.where}), проверено ${a.reviewedAt}`);
    console.log(`     ${a.reason}`);
    console.log(`     снять: ${a.removeWhen}`);
  }
}

console.log(line);
if (failed) {
  console.log('Есть уязвимости вне списка исключений. Либо обновите пакет, либо');
  console.log('добавьте исключение в scripts/audit-gate.js с обоснованием.\n');
  process.exitCode = 1;
} else {
  console.log('Уязвимостей вне списка исключений нет.\n');
}
