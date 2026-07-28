/**
 * Проверка осмысленности первичной диагностики.
 *
 * Сквозной тест (e2e.mjs) проверяет, что механика работает: кнопки нажимаются,
 * экраны сменяются. Этот — что результат имеет смысл: пять непохожих детей
 * должны получить пять разных наборов направлений, и каждый должен попасть в
 * ожидаемую область. Именно такую проверку невозможно заменить проверкой
 * «элемент существует».
 *
 * Запуск:  node tests/profiles.mjs [baseUrl]
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:3000';

const snapshotPath = path.join(__dirname, '..', 'client', 'src', 'demo', 'snapshot.json');
if (!fs.existsSync(snapshotPath)) {
  console.error('Нет client/src/demo/snapshot.json — выполните: npm run demo:data');
  process.exit(2);
}
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const questionByHeading = (text) =>
  snapshot.questions.find((q) => q.question === text || q.questionSelf === text);
const labelFor = (qid, value) =>
  snapshot.questions.find((q) => q.id === qid)?.options?.find((o) => o.value === value)?.label;

/**
 * Пять узнаваемых профилей и области, в которые каждый обязан попасть.
 * `expectAny` — хотя бы одно из направлений; `forbid` — чего быть не должно.
 */
const PROFILES = [
  {
    tag: 'художник 8 лет',
    expectAny: ['computer-graphics', 'design-project'],
    forbid: ['cybersecurity', 'ai-data'],
    answers: {
      age: '7-8', hobby: ['draw', 'music'], clubs: ['art'], weeklyHours: '1-2 часа',
      priority: 'fun', concern: 'unmotivated', city: 'Москва', picture: 'paint',
      makeWithHands: ['drawing', 'clay'], fearSoftware: 'yes', orderOrFreedom: 'freedom', dailyTime: '30m',
    },
  },
  {
    tag: 'инженер 12 лет',
    expectAny: ['robotics', 'engineering-graphics', '3d-printing'],
    forbid: [],
    answers: {
      age: '11-12', hobby: ['build', 'tinker'], clubs: ['robotics', 'coding'], weeklyHours: '6-8 часов',
      priority: 'achievements', concern: 'jumping', city: 'Казань', picture: 'bricks',
      makeWithHands: ['robot', 'model'], fearSoftware: 'no', orderOrFreedom: 'order', dailyTime: '1h',
    },
  },
  {
    tag: 'блогер 15 лет',
    expectAny: ['media-content', 'esports-streaming', 'sound-design'],
    forbid: [],
    answers: {
      age: '13-15', hobby: ['watch', 'music'], clubs: ['sport'], weeklyHours: '3-5 часов',
      priority: 'friends', concern: 'screens', city: 'Сочи', picture: 'stage',
      makeWithHands: ['video', 'song'], fearSoftware: 'little', orderOrFreedom: 'team', dailyTime: '2h',
    },
  },
  {
    tag: 'натуралист 13 лет',
    expectAny: ['bioengineering'],
    forbid: [],
    answers: {
      age: '13-15', hobby: ['nature', 'read'], clubs: ['none'], weeklyHours: '3-5 часов',
      priority: 'profession', concern: 'screens', city: 'Томск', picture: 'lab',
      makeWithHands: ['clay'], fearSoftware: 'little', orderOrFreedom: 'order', dailyTime: '1h',
    },
  },
  {
    tag: 'программист 16 лет',
    expectAny: ['programming-web', 'ai-data', 'cybersecurity', 'gamedev'],
    forbid: [],
    answers: {
      age: '16-18', hobby: ['games', 'watch'], clubs: ['coding'], weeklyHours: 'больше 8 часов',
      priority: 'profession', concern: 'nothing', city: 'Уфа', picture: 'computer',
      makeWithHands: ['character', 'site'], fearSoftware: 'love', orderOrFreedom: 'alone', dailyTime: 'more',
    },
  },
];

/** Название направления → ключ, чтобы проверять ожидания по ключам. */
const NAME_TO_KEY = new Map(snapshot.constellations.map((c) => [c.name, c.key]));

const results = [];
const problems = [];

async function runProfile(browser, profile) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 940 }, locale: 'ru-RU' });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.getByLabel(/имя/i).first().fill(profile.tag);
  await page
    .locator('input[type="email"]')
    .fill(`prof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.locator('input[type="password"]').first().fill('password123');
  await page.getByRole('button', { name: /продолжить/i }).click();
  await page.waitForTimeout(2500);

  await page.getByRole('radio', { name: /родител/i }).click();
  await page.waitForTimeout(700);
  for (let i = 0; i < 6 && !page.url().includes('/diagnostics'); i++) {
    const next = page.getByRole('button', { name: /далее|начать диагностику/i }).first();
    if (!(await next.count())) break;
    await next.click();
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1400);

  // Отвечаем строго по профилю: вариант ищется по своей подписи на экране.
  for (let step = 0; step < 14; step++) {
    const heading = ((await page.locator('h1').first().textContent().catch(() => '')) || '').trim();
    const question = questionByHeading(heading);

    const cityInput = page.locator('input[role="combobox"]').first();
    if (await cityInput.count()) {
      await cityInput.fill(profile.answers.city);
      await page.waitForTimeout(700);
      const option = page.getByRole('option').first();
      if (await option.count()) await option.click();
    } else if (question) {
      const wanted = [profile.answers[question.id]].flat().filter(Boolean);
      for (const value of wanted) {
        const label = labelFor(question.id, value);
        if (!label) continue;
        const control = page.getByRole(question.multi ? 'checkbox' : 'radio', { name: label }).first();
        if (await control.count()) {
          await control.click();
          await page.waitForTimeout(180);
        }
      }
    }

    await page.waitForTimeout(200);
    const next = page.getByRole('button', { name: /далее|построить карту|поехали/i }).first();
    if (!(await next.count())) break;
    const label = (await next.textContent()).trim();
    await next.click();
    await page.waitForTimeout(650);
    if (/построить/i.test(label)) break;
  }

  await page.waitForTimeout(2600);

  const cards = await page.locator('article').evaluateAll((nodes) =>
    nodes.map((n) => ({
      name: n.querySelector('h3')?.textContent?.trim() || '',
      match: Number((n.textContent.match(/совпадение\s+(\d+)%/) || [])[1] ?? NaN),
    }))
  );

  const recommended = cards.filter((c) => c.name);
  await ctx.close();
  return recommended;
}

const browser = await chromium.launch();
console.log(`\nПроверяем осмысленность подбора: ${BASE}\n`);

for (const profile of PROFILES) {
  const recommended = await runProfile(browser, profile);
  const keys = recommended.map((r) => NAME_TO_KEY.get(r.name)).filter(Boolean);

  console.log(
    `${profile.tag.padEnd(20)} → ${recommended.map((r) => `${r.name} ${r.match}%`).join(' · ') || '(пусто)'}`
  );

  if (!recommended.length) problems.push(`${profile.tag}: не получено ни одной рекомендации`);

  const hit = profile.expectAny.some((k) => keys.includes(k));
  if (!hit) problems.push(`${profile.tag}: ожидалось одно из [${profile.expectAny.join(', ')}], получено [${keys.join(', ')}]`);

  const banned = profile.forbid.filter((k) => keys.includes(k));
  if (banned.length) problems.push(`${profile.tag}: недопустимые направления [${banned.join(', ')}]`);

  const matches = recommended.map((r) => r.match).filter(Number.isFinite);
  if (matches.some((m) => m <= 0)) problems.push(`${profile.tag}: показано нулевое совпадение`);
  if (matches.length && matches[0] < 55) problems.push(`${profile.tag}: слабый лидер (${matches[0]}%)`);

  results.push({ tag: profile.tag, keys });
}

await browser.close();

// Разные дети обязаны получать разные карты — иначе подбор ничего не решает.
const signatures = new Set(results.map((r) => r.keys.join('|')));
console.log(`\nразных наборов рекомендаций: ${signatures.size} из ${results.length}`);
if (signatures.size < results.length) problems.push('разные профили получили одинаковые наборы направлений');

console.log('─'.repeat(60));
if (problems.length) {
  console.log(`ПРОБЛЕМЫ (${problems.length}):`);
  problems.forEach((p) => console.log('  ✗ ' + p));
  console.log('─'.repeat(60));
  process.exit(1);
}
console.log('Все профили получили осмысленные и различающиеся рекомендации.');
console.log('─'.repeat(60));
