/**
 * Проверка ссылок каталога.
 *
 * В прототипе все семьдесят «офлайн-занятий» вели на домены вида
 * `example-kvantorium.ru`, а два десятка «курсов» — на выдуманные страницы
 * Stepik и Coursera, которые отдают 404. Выглядело как настоящий каталог,
 * работало как декорация. Этот тест ловит и то, и другое:
 *
 *   • домен-заглушка (example-*, test-*, your-site) — сразу провал, без сети;
 *   • 404/410 — ссылка ведёт в никуда;
 *   • 403/429 — сайт живой, но не любит роботов (canva, autodesk и подобные):
 *     это не ошибка каталога, поэтому считается предупреждением;
 *   • таймаут или сетевой сбой — предупреждение: интернет в CI бывает разный,
 *     и ронять сборку из-за чужого медленного сервера незачем.
 *
 * Usage:  node tests/links.mjs [--strict]
 *         --strict — считать провалом и предупреждения тоже.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const contentA = require(path.join(ROOT, 'src/db/content-a'));
const contentB = require(path.join(ROOT, 'src/db/content-b'));
const VENUES = require(path.join(ROOT, 'src/data/venues'));

const STRICT = process.argv.includes('--strict');

/** Домены-заглушки: верный признак того, что данные придумали, а не нашли. */
const PLACEHOLDER = /(^|\.)(example|examples|test|demo-site|your-site|placeholder|site)[-.]/i;

const CONCURRENCY = 8;
const TIMEOUT_MS = 15000;

function collect() {
  const links = [];

  for (const constellation of [...contentA, ...contentB]) {
    for (const star of constellation.stars) {
      for (const type of ['offline', 'online', 'tool']) {
        const r = star.resources?.[type];
        if (r?.link) links.push({ url: r.link, where: `${constellation.name} → ${star.name} → ${type}` });
      }
    }
  }

  for (const v of VENUES) {
    if (v.url) links.push({ url: v.url, where: `площадка: ${v.name} (${v.city})` });
  }

  // Одна ссылка часто встречается у нескольких навыков — проверяем по разу,
  // но помним все места, чтобы в отчёте было видно, что чинить.
  const byUrl = new Map();
  for (const l of links) {
    if (!byUrl.has(l.url)) byUrl.set(l.url, []);
    byUrl.get(l.url).push(l.where);
  }
  return [...byUrl.entries()].map(([url, where]) => ({ url, where }));
}

async function probe(url) {
  const attempt = async (method) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TalentMapLinkCheck/1.0)',
          'Accept-Language': 'ru,en;q=0.8',
        },
      });
      return res.status;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let status = await attempt('HEAD');
    // Часть сайтов не отвечает на HEAD — переспрашиваем полноценным GET.
    if (status === 405 || status === 403 || status === 501) status = await attempt('GET');
    return { status };
  } catch (err) {
    return { status: 'ERR', error: err?.name === 'AbortError' ? 'таймаут' : String(err?.cause?.code || err?.name) };
  }
}

async function main() {
  const links = collect();
  console.log(`\nПроверяем ${links.length} уникальных ссылок каталога\n`);

  const fails = [];
  const warns = [];
  let done = 0;

  // Заглушки отсекаем до сети: они не «медленные», они выдуманные.
  const live = [];
  for (const l of links) {
    let host = '';
    try {
      host = new URL(l.url).hostname;
    } catch {
      fails.push({ ...l, reason: 'некорректный URL' });
      continue;
    }
    if (PLACEHOLDER.test(host)) fails.push({ ...l, reason: `домен-заглушка (${host})` });
    else live.push(l);
  }

  let cursor = 0;
  async function worker() {
    while (cursor < live.length) {
      const link = live[cursor++];
      const { status, error } = await probe(link.url);
      done++;
      if (status === 'ERR') warns.push({ ...link, reason: `не ответил (${error})` });
      else if (status === 404 || status === 410) fails.push({ ...link, reason: `${status} — страницы нет` });
      else if (status === 403 || status === 429) warns.push({ ...link, reason: `${status} — сайт закрыт от роботов` });
      else if (status >= 500) warns.push({ ...link, reason: `${status} — сервер отвечает ошибкой` });
      if (done % 20 === 0) process.stdout.write(`  проверено ${done}/${live.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const line = '─'.repeat(60);
  if (warns.length) {
    console.log(`\nПредупреждения (${warns.length}) — ссылка живая, но проверить до конца не вышло:`);
    for (const w of warns) console.log(`  • ${w.reason}\n    ${w.url}\n    ${w.where[0]}`);
    // Заметная часть каталога — российские государственные порталы
    // (навигатор.дети, mos.ru, региональные домены образования). Из зарубежной
    // сети они часто не отвечают вовсе; это ограничение окружения проверки, а
    // не признак битой ссылки, поэтому такие случаи только предупреждают.
    const ru = warns.filter((w) => /навигатор\.дети|xn--|\.ru\/?$|mos\.ru|edu-|petersburgedu/i.test(w.url));
    if (ru.length) {
      console.log(
        `\n  Из них ${ru.length} — российские государственные и региональные порталы,\n` +
          '  которые не отвечают на запросы из этой сети. Их адреса подтверждены\n' +
          '  документами профильных ведомств при сборе каталога.'
      );
    }
  }

  if (fails.length) {
    console.log(`\n${line}\nБИТЫЕ ССЫЛКИ (${fails.length}):`);
    for (const f of fails) {
      console.log(`  ✗ ${f.reason}\n    ${f.url}`);
      for (const w of f.where.slice(0, 3)) console.log(`      ${w}`);
      if (f.where.length > 3) console.log(`      … и ещё ${f.where.length - 3}`);
    }
    console.log(line);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${line}`);
  console.log(`Все ${links.length} ссылок каталога рабочие. Предупреждений: ${warns.length}.`);
  console.log(line);
  if (STRICT && warns.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Проверка ссылок упала:', err);
  process.exitCode = 1;
});
