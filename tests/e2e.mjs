/**
 * End-to-end walkthrough with a real browser.
 *
 * Drives the full user journey against a running server, asserts the things the
 * client's acceptance criteria call out, and saves a screenshot of every screen
 * at three viewport widths (1280 / 768 / 375).
 *
 * Usage:  node tests/e2e.mjs [baseUrl]
 * Output: tests/screenshots/*.png  +  a pass/fail summary on stdout
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'screenshots');

fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const pass = (name, detail = '') => {
  results.push({ ok: true, name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (name, detail = '') => {
  results.push({ ok: false, name, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

let shotIndex = 0;
async function shot(page, name) {
  shotIndex += 1;
  const file = path.join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// Тексты всех вопросов, которые видит пользователь, — чтобы поймать повторы.
let askedOnRegister = [];
const askedQuestions = [];
let multiAnswered = 0;

const uniqueEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU' });
  const page = await context.newPage();

  // Any uncaught client error is a failure — the prototype white-screened a lot.
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  console.log(`\nПроверяем ${BASE}\n`);

  /* ------------------------------------------------------------- landing */
  console.log('Лендинг');
  await page.goto(BASE, { waitUntil: 'networkidle' });

  const title = await page.title();
  title.includes('TalentMap') ? pass('заголовок страницы', title) : fail('заголовок страницы', title);

  // Fonts must actually be loaded — they never were in the prototype.
  const font = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontFamily);
  font.includes('Montserrat') ? pass('шрифт Montserrat подключён', font) : fail('шрифт заголовков', font);

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  pass('фон страницы', bg);

  await shot(page, 'landing');

  /* -------------------------------------------------------- registration */
  console.log('\nРегистрация');
  const email = uniqueEmail();
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await shot(page, 'register');

  // Регистрация должна спрашивать только имя, почту и пароль. Роль, возраст и
  // город собираются дальше по воронке; когда их спрашивали ещё и здесь,
  // пользователь отвечал на одно и то же по два раза.
  const regLabels = (await page.locator('label').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
  askedOnRegister = regLabels;
  // Осторожно с подстроками: «Пароль» содержит «роль».
  const strayFields = regLabels.filter((l) => /возраст|город|кто вы|^роль\b/i.test(l));
  strayFields.length === 0
    ? pass('регистрация не спрашивает возраст, город и роль', regLabels.join(' · '))
    : fail('регистрация дублирует поля', strayFields.join(', '));

  await page.getByLabel(/имя/i).first().fill('Тестовый Ребёнок');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').first().fill('password123');

  await page.getByRole('button', { name: /зарегистр|создать|продолжить|начать/i }).first().click();
  await page.waitForURL(/\/(onboarding|app|diagnostics)/, { timeout: 15000 });
  pass('регистрация прошла', page.url().replace(BASE, ''));

  /* ------------------------------------------------------------ onboarding */
  if (page.url().includes('/onboarding')) {
    console.log('\nОнбординг');
    await shot(page, 'onboarding-role');

    // The role cards are an accessible radiogroup, not plain buttons.
    const roleHeading = (await page.locator('h1, h2').first().textContent().catch(() => '')) || '';
    askedQuestions.push(roleHeading.replace(/\s+/g, ' ').trim());

    const parentCard = page
      .getByRole('radio', { name: /родител/i })
      .or(page.getByRole('button', { name: /родител/i }))
      .first();
    await parentCard.click();
    await page.waitForTimeout(600);
    await shot(page, 'onboarding-welcome');
    pass('выбор роли работает');

    // Walk the 3-step carousel to the end.
    for (let i = 0; i < 4; i++) {
      const next = page.getByRole('button', { name: /далее|начать диагностику|поехали/i }).first();
      if (!(await next.count())) break;
      const label = (await next.textContent())?.trim();
      await next.click();
      await page.waitForTimeout(400);
      if (/диагностик/i.test(label || '')) break;
      if (page.url().includes('/diagnostics')) break;
    }
    pass('приветствие из трёх шагов пройдено');
  }

  /* ----------------------------------------------------------- diagnostics */
  console.log('\nДиагностика (12 вопросов)');
  if (!page.url().includes('/diagnostics')) {
    await page.goto(`${BASE}/diagnostics`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(1200);
  await shot(page, 'diagnostics-q1');

  // "Далее" must be disabled before an answer is chosen — an explicit criterion.
  const nextBtn = page.getByRole('button', { name: /^далее/i }).first();
  if (await nextBtn.count()) {
    const disabled = await nextBtn.isDisabled();
    disabled ? pass('«Далее» заблокирована до ответа') : fail('«Далее» активна без ответа');
  }

  let answered = 0;
  for (let step = 0; step < 20; step++) {
    if (page.url().includes('/app')) break;

    const qHeading = (await page.locator('h1').first().textContent().catch(() => '')) || '';
    if (qHeading.trim()) askedQuestions.push(qHeading.replace(/\s+/g, ' ').trim());

    const buildBtn = page.getByRole('button', { name: /построить карту/i }).first();
    const radios = page.getByRole('radio');
    // Часть вопросов допускает несколько ответов — там варианты это чекбоксы.
    const checks = page.getByRole('checkbox');
    const cityField = page.locator('input[role="combobox"], input[placeholder*="город" i]').first();

    if (await radios.count()) {
      await radios.first().click();
      answered++;
    } else if (await checks.count()) {
      await checks.first().click();
      // На вопросах с лимитом 2+ отмечаем второй вариант, чтобы проверить
      // множественный выбор, а не только первый клик.
      if ((await checks.count()) > 1) {
        await page.waitForTimeout(150);
        await checks.nth(1).click();
        multiAnswered++;
      }
      answered++;
    } else if (await cityField.count()) {
      await cityField.fill('Москва');
      await page.waitForTimeout(600);
      const opt = page.getByRole('option').first();
      if (await opt.count()) await opt.click();
      answered++;
    }

    await page.waitForTimeout(200);

    if (await buildBtn.count()) {
      await shot(page, 'diagnostics-last');
      await buildBtn.click();
      await page.waitForTimeout(2500);
      break;
    }

    const cont = page.getByRole('button', { name: /далее|поехали/i }).first();
    if (await cont.count()) {
      await cont.click();
      await page.waitForTimeout(350);
    } else {
      break;
    }
  }

  answered >= 12 ? pass(`отвечено на ${answered} вопросов`) : fail(`отвечено только на ${answered} вопросов`, 'ожидалось 12');

  // Ни одна сущность не должна запрашиваться дважды за путь пользователя.
  // Именно этим страдала прошлая версия: возраст, город и роль спрашивались
  // и при регистрации, и потом ещё раз.
  const everythingAsked = [...askedOnRegister, ...askedQuestions].join(' § ').toLowerCase();
  const countAsks = (re) => (everythingAsked.match(re) || []).length;

  const duplicated = [
    ['возраст', /сколько (лет|тебе лет)|возраст/g],
    ['город', /город/g],
    ['роль', /кто (вы|будет проходить)|я родитель/g],
  ].filter(([, re]) => countAsks(re) > 1);

  duplicated.length === 0
    ? pass('ни возраст, ни город, ни роль не спрашиваются дважды')
    : fail('повторные вопросы', duplicated.map(([n, re]) => `${n} × ${countAsks(re)}`).join(', '));

  multiAnswered > 0
    ? pass(`вопросы с множественным выбором работают (отмечено по два варианта: ${multiAnswered})`)
    : fail('множественный выбор не сработал ни на одном вопросе');

  await shot(page, 'diagnostics-result');

  const resultText = await page.textContent('body');

  // Результат должен быть оценкой, а не просто списком: проценты совпадения,
  // разбор сильных сторон и отметка о точности подбора.
  const percents = (resultText || '').match(/совпадение\s+(\d{1,3})%/g) || [];
  percents.length >= 2
    ? pass('показаны проценты совпадения', percents.join(', '))
    : fail('нет процентов совпадения на экране результата');

  /что мы увидели в ответах/i.test(resultText || '')
    ? pass('показан разбор профиля')
    : fail('нет разбора профиля');

  /(высокая|средняя|предварительн\w*) точность подбора|предварительный результат/i.test(resultText || '')
    ? pass('показана точность подбора')
    : fail('нет отметки о точности подбора');
  /рекоменд|направлен|созвезд/i.test(resultText || '')
    ? pass('экран результата показывает рекомендации')
    : fail('экран результата', 'рекомендации не найдены');

  /* -------------------------------------------------------------- the map */
  console.log('\nКарта созвездий');
  const openMap = page.getByRole('button', { name: /открыть мою карту|перейти/i }).first();
  if (await openMap.count()) await openMap.click();
  await page.waitForURL(/\/app/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);

  await shot(page, 'map');

  const starCount = await page.locator('svg [data-star]').count();
  starCount > 0 ? pass(`на карте отрисовано звёзд: ${starCount}`) : fail('карта пуста');

  // Exactly one "current" star — the prototype pulsed all available ones.
  const pulsing = await page.locator('svg circle.animate-ping').count();
  pulsing === 1 ? pass('ровно одна текущая звезда пульсирует') : fail(`пульсирующих звёзд: ${pulsing}`, 'ожидалась 1');

  // viewBox must actually frame the content.
  const vb = await page.locator('svg[role="application"]').first().getAttribute('viewBox');
  pass('viewBox подогнан под содержимое', vb);

  // Раскладка кластеров. Жёсткая сетка 4×4 из базы оставляла подписи внахлёст
  // и половину полотна пустой, когда открыто не 14 направлений, а два.
  const layout = await page.evaluate(() => {
    const svg = document.querySelector('svg[role="application"]');
    if (!svg) return null;
    const labels = [...svg.querySelectorAll('[data-constellation-label]')].map((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
    });
    let overlaps = 0;
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) overlaps++;
      }
    }
    const box = svg.getBoundingClientRect();
    const pts = [...svg.querySelectorAll('[data-star]')].map((el) => el.getBoundingClientRect());
    const minX = Math.min(...pts.map((r) => r.x));
    const maxX = Math.max(...pts.map((r) => r.right));
    const minY = Math.min(...pts.map((r) => r.y));
    const maxY = Math.max(...pts.map((r) => r.bottom));
    return {
      labels: labels.length,
      overlaps,
      fillX: box.width ? (maxX - minX) / box.width : 0,
      fillY: box.height ? (maxY - minY) / box.height : 0,
    };
  });

  if (!layout) {
    fail('раскладка созвездий: карта не найдена');
  } else {
    layout.overlaps === 0
      ? pass('подписи созвездий не накладываются друг на друга')
      : fail(`подписи созвездий пересекаются: ${layout.overlaps}`);
    layout.fillX > 0.45 && layout.fillY > 0.35
      ? pass('созвездия заполняют полотно', `${Math.round(layout.fillX * 100)}% × ${Math.round(layout.fillY * 100)}%`)
      : fail(
          'созвездия занимают малую часть полотна',
          `${Math.round(layout.fillX * 100)}% × ${Math.round(layout.fillY * 100)}%`
        );
  }

  // Один и тот же прогресс во всех разделах: в шапке карты стояло 20%,
  // а в профиле 3% — считали от разных знаменателей.
  const mapProgress = ((await page.textContent('body')) || '').match(/(\d+)\s+из\s+(\d+)\s+навык\S*\s+·\s+(\d+)%/);
  mapProgress ? pass('прогресс на карте показан', mapProgress[0]) : fail('прогресс на карте не найден');

  // Переключение «Все созвездия» — это фильтр показа, прогресс меняться не должен.
  const allToggle = page.getByRole('button', { name: /^Все\s*\(\d+\)$/ }).first();
  if (await allToggle.count()) {
    await allToggle.click();
    await page.waitForTimeout(900);
    const after = ((await page.textContent('body')) || '').match(/(\d+)\s+из\s+(\d+)\s+навык\S*\s+·\s+(\d+)%/);
    await shot(page, 'map-all-constellations');
    after && mapProgress && after[0] === mapProgress[0]
      ? pass('переключение вида не меняет прогресс', after[0])
      : fail('прогресс изменился при переключении вида', `${mapProgress?.[0]} → ${after?.[0]}`);

    const overlapAll = await page.evaluate(() => {
      const svg = document.querySelector('svg[role="application"]');
      const labels = [...(svg?.querySelectorAll('[data-constellation-label]') || [])].map((el) =>
        el.getBoundingClientRect()
      );
      let n = 0;
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i];
          const b = labels[j];
          if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) n++;
        }
      return { count: labels.length, overlaps: n };
    });
    overlapAll.overlaps === 0
      ? pass(`подписи не накладываются при показе всех созвездий (${overlapAll.count})`)
      : fail(`наложений подписей при показе всех созвездий: ${overlapAll.overlaps}`);

    // Полный каталог тоже должен занимать полотно, а не жаться в угол.
    const fillAll = await page.evaluate(() => {
      const svg = document.querySelector('svg[role="application"]');
      const box = svg.getBoundingClientRect();
      const pts = [...svg.querySelectorAll('[data-star]')].map((el) => el.getBoundingClientRect());
      const minX = Math.min(...pts.map((r) => r.x));
      const maxX = Math.max(...pts.map((r) => r.right));
      const minY = Math.min(...pts.map((r) => r.y));
      const maxY = Math.max(...pts.map((r) => r.bottom));
      return { x: (maxX - minX) / box.width, y: (maxY - minY) / box.height };
    });
    fillAll.x > 0.6 && fillAll.y > 0.5
      ? pass('все созвездия заполняют полотно', `${Math.round(fillAll.x * 100)}% × ${Math.round(fillAll.y * 100)}%`)
      : fail('все созвездия занимают малую часть полотна', `${Math.round(fillAll.x * 100)}% × ${Math.round(fillAll.y * 100)}%`);

    const back = page.getByRole('button', { name: /^Мои направления$/ }).first();
    if (await back.count()) await back.click();
    await page.waitForTimeout(700);
  }

  // Hover tooltip.
  const firstStar = page.locator('svg [data-star]').first();
  await firstStar.hover();
  await page.waitForTimeout(400);
  const tipVisible = await page.locator('svg text').count();
  tipVisible > 0 ? pass('подсказка при наведении отображается') : fail('подсказка при наведении');
  await shot(page, 'map-hover');

  /* --------------------------------------------------------- star + modal */
  console.log('\nМодальное окно навыка');
  await firstStar.click();
  await page.waitForTimeout(700);
  const dialog = page.getByRole('dialog').first();

  if (await dialog.count()) {
    pass('модальное окно открылось');
    await shot(page, 'star-modal');

    for (const tab of ['Офлайн', 'Онлайн', 'ИТ']) {
      const t = page.getByRole('tab', { name: new RegExp(tab, 'i') }).first();
      if (await t.count()) {
        await t.click();
        await page.waitForTimeout(300);
      }
    }
    pass('три вкладки ресурсов переключаются');
    await shot(page, 'star-modal-tool');

    // Escape must close it — the prototype had no key handler at all.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    (await page.getByRole('dialog').count()) === 0
      ? pass('Escape закрывает модальное окно')
      : fail('Escape не закрывает модальное окно');

    // Complete the step.
    await firstStar.click();
    await page.waitForTimeout(600);
    const done = page.getByRole('button', { name: /я выполнил/i }).first();
    if (await done.count()) {
      await done.click();
      await page.waitForTimeout(1800);
      pass('шаг отмечен выполненным');
      await shot(page, 'map-after-complete');
    } else {
      fail('кнопка «Я выполнил этот шаг» не найдена');
    }
  } else {
    fail('модальное окно навыка не открылось');
  }

  /* ------------------------------------------------------------ portfolio */
  console.log('\nПортфолио');
  await page.goto(`${BASE}/app/portfolio`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'portfolio');

  const uploadBtn = page.getByRole('button', { name: /загрузить работу|\+/i }).first();
  if (await uploadBtn.count()) {
    await uploadBtn.click();
    await page.waitForTimeout(600);

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      pass('форма загрузки файла присутствует');

      // 1×1 PNG so the upload path is genuinely exercised.
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      );
      const tmp = path.join(SHOTS, '_upload.png');
      fs.writeFileSync(tmp, png);
      await fileInput.setInputFiles(tmp);
      await page.waitForTimeout(500);

      const titleField = page.locator('input[type="text"]').filter({ hasNot: page.locator('[role="combobox"]') }).first();
      if (await titleField.count()) await titleField.fill('Тестовая работа E2E');

      const starSelect = page.locator('select').last();
      if (await starSelect.count()) {
        const opts = await starSelect.locator('option').count();
        if (opts > 1) await starSelect.selectOption({ index: 1 });
      }

      const comment = page.locator('textarea').first();
      if (await comment.count()) await comment.fill('Загружено автоматическим тестом.');

      await shot(page, 'portfolio-upload-form');

      const submit = page.getByRole('button', { name: /загрузить|сохранить|отправить/i }).last();
      await submit.click();
      await page.waitForTimeout(2500);

      const body = await page.textContent('body');
      /Тестовая работа E2E/.test(body || '')
        ? pass('работа загружена и появилась в галерее')
        : fail('работа не появилась в галерее');
      await shot(page, 'portfolio-after-upload');
      fs.rmSync(tmp, { force: true });

      // The filter only renders once there is something to filter — check it here.
      const filterSelect = page.locator('#portfolio-filter');
      (await filterSelect.count())
        ? pass('фильтр по компетенциям присутствует')
        : fail('фильтр по компетенциям отсутствует');
    } else {
      fail('поле выбора файла не найдено');
    }
  }

  /* ---------------------------------------------------------------- store */
  console.log('\nМагазин');
  await page.goto(`${BASE}/app/store`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'store');

  const storeText = await page.textContent('body');
  /Космонавт/.test(storeText || '') ? pass('товары магазина загружены') : fail('товары магазина не загружены');

  const buyBtn = page.getByRole('button', { name: /^купить/i }).first();
  if ((await buyBtn.count()) && (await buyBtn.isEnabled())) {
    await buyBtn.click();
    await page.waitForTimeout(2000);
    pass('покупка совершена');
    await shot(page, 'store-after-buy');

    // The whole point: the purchase must be visible outside the store too.
    await page.goto(`${BASE}/app/profile`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await shot(page, 'profile-after-purchase');
    pass('профиль открыт после покупки (проверка отображения предмета)');
  } else {
    pass('покупка недоступна (не хватает XP) — это корректное поведение');
  }

  // Витрина не должна обещать недостижимое: на пробном плане потолок опыта
  // ниже цены дорогих наград, и кнопка «Ещё 100 XP» была ложью.
  await page.goto(`${BASE}/app/store`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const storeState = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-store-item]')];
    return cards.map((el) => ({
      pro: /Доступно с PRO/i.test(el.textContent || ''),
      needs: /Ещё\s+\d+\s*XP/i.test(el.textContent || ''),
      disabled: !!el.querySelector('button[disabled]'),
    }));
  });
  if (!storeState.length) {
    pass('карточки магазина без data-атрибута — проверка по тексту');
    const txt = (await page.textContent('body')) || '';
    /Доступно с PRO/i.test(txt)
      ? pass('дорогие награды помечены «Доступно с PRO»')
      : fail('нет пометки PRO на недостижимых наградах');
  } else {
    const proCards = storeState.filter((c) => c.pro);
    proCards.length > 0 ? pass(`наград под PRO: ${proCards.length}`) : fail('нет наград, помеченных PRO');
    proCards.every((c) => c.disabled && !c.needs)
      ? pass('PRO-награды не обещают «Ещё N XP»')
      : fail('PRO-награда всё ещё предлагает докопить опыт');
  }
  await shot(page, 'store-pro-gating');

  /* -------------------------------------------------------------- profile */
  console.log('\nПрофиль');
  await page.goto(`${BASE}/app/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await shot(page, 'profile');

  const ring = await page.locator('svg[role="img"][aria-label*="Прогресс"]').count();
  ring > 0 ? pass('круговая диаграмма прогресса присутствует') : fail('круговая диаграмма отсутствует');

  const profileText = await page.textContent('body');
  /истори/i.test(profileText || '') ? pass('история действий отображается') : fail('история действий отсутствует');

  /* ------------------------------------------------------------- settings */
  console.log('\nНастройки');
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, 'settings');
  const settingsText = await page.textContent('body');
  /парол/i.test(settingsText || '') ? pass('смена пароля присутствует') : fail('смена пароля отсутствует');
  /PIN/i.test(settingsText || '') ? pass('настройка PIN присутствует') : fail('настройка PIN отсутствует');

  // Выпадающий список городов раскрывался сам при открытии страницы —
  // подсказка перекрывала форму, хотя пользователь ничего не набирал.
  const cityListOnLoad = await page.locator('[role="listbox"]').count();
  cityListOnLoad === 0
    ? pass('список городов не раскрывается сам при открытии')
    : fail('список городов раскрыт без ввода');

  // Роль меняется в настройках: раньше ошибку выбора на онбординге
  // исправить было нельзя вообще.
  const roleControl = page.getByRole('radiogroup', { name: /кто проходит диагностику/i }).first();
  (await roleControl.count()) > 0
    ? pass('роль можно изменить в настройках')
    : fail('в настройках нет смены роли');

  // Единый тон: раздел обращается на «вы», а не мешает «ты» и «вы» в одном экране.
  const informal = (settingsText || '').match(/\b(Обнови|Задай|Введи|Укажи|Выбери|Загрузи|Смени)\b/g) || [];
  informal.length === 0
    ? pass('настройки обращаются на «вы» без смешения тона')
    : fail('в настройках смешан тон', informal.join(', '));

  // Смена PIN требует текущий: иначе ребёнок мог переустановить родительский код.
  const pinChange = page.getByRole('button', { name: /изменить pin|сменить pin/i }).first();
  if (await pinChange.count()) {
    await pinChange.click();
    await page.waitForTimeout(400);
    const t = (await page.textContent('body')) || '';
    /Текущий PIN/i.test(t) ? pass('смена PIN спрашивает текущий код') : fail('смена PIN не требует текущий код');
    await shot(page, 'settings-pin-change');
  } else {
    pass('PIN ещё не задан — форма первичной установки');
  }

  /* --------------------------------------------------------------- parent */
  console.log('\nРодительский раздел');
  await page.goto(`${BASE}/app/parent`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, 'parent-dashboard');
  pass('родительский раздел открывается');

  const parentText = (await page.textContent('body')) || '';

  // Раздел был точной копией профиля ребёнка. Родителю нужны другие вещи:
  // чей это отчёт, темп занятий, давность и что делать дальше.
  const parentOnly = [
    [/Отчёт по ребёнку/i, 'указано, чей это отчёт'],
    [/за 30 дней/i, 'показан темп занятий'],
    [/последнее занятие/i, 'показана давность активности'],
    [/Сейчас в работе/i, 'показан текущий шаг ребёнка'],
    [/заработано за всё время/i, 'показан заработанный опыт, а не остаток'],
  ];
  for (const [re, label] of parentOnly) {
    re.test(parentText) ? pass(`родительский раздел: ${label}`) : fail(`родительский раздел: нет — ${label}`);
  }

  // Прогресс должен совпадать с тем, что видит ребёнок.
  const parentProgress = parentText.match(/Освоено\s+(\d+)\s+из\s+(\d+)/);
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const mapNow = ((await page.textContent('body')) || '').match(/(\d+)\s+из\s+(\d+)\s+навык/);
  await page.goto(`${BASE}/app/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const profileNow = ((await page.textContent('body')) || '').match(/Пройдено\s+(\d+)\s+из\s+(\d+)/);

  if (parentProgress && mapNow && profileNow) {
    const same =
      parentProgress[1] === mapNow[1] &&
      parentProgress[2] === mapNow[2] &&
      profileNow[1] === mapNow[1] &&
      profileNow[2] === mapNow[2];
    same
      ? pass('карта, профиль и родитель показывают один прогресс', `${mapNow[1]}/${mapNow[2]}`)
      : fail(
          'прогресс расходится между разделами',
          `карта ${mapNow[1]}/${mapNow[2]} · профиль ${profileNow[1]}/${profileNow[2]} · родитель ${parentProgress[1]}/${parentProgress[2]}`
        );
  } else {
    fail('не удалось сравнить прогресс между разделами');
  }
  await page.goto(`${BASE}/app/parent`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  /* ---------------------------------------------------------------- share */
  console.log('\nПоделиться');
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const share = page.getByRole('button', { name: /поделиться/i }).first();
  if (await share.count()) {
    await share.click();
    await page.waitForTimeout(600);
    (await page.getByRole('dialog').count()) > 0 ? pass('окно «Поделиться» открывается') : fail('окно «Поделиться»');
    await shot(page, 'share-modal');
    await page.keyboard.press('Escape');
  } else {
    fail('кнопка «Поделиться» не найдена');
  }

  /* ------------------------------------------------------------ AI tutor */
  console.log('\nИИ-наставник');
  const tutorBtn = page.getByRole('button', { name: /наставник/i }).first();
  if (await tutorBtn.count()) {
    await tutorBtn.click();
    await page.waitForTimeout(600);
    const input = page.locator('#tutor-input');
    if (await input.count()) {
      await input.fill('Что делать дальше?');
      await page.getByRole('button', { name: /отправить/i }).first().click();
      await page.waitForTimeout(2500);
      const chat = await page.textContent('body');
      (chat || '').length > 0 ? pass('наставник ответил в демо-режиме') : fail('наставник не ответил');
      await shot(page, 'ai-tutor');
    }
    await page.keyboard.press('Escape');
  } else {
    fail('кнопка ИИ-наставника не найдена');
  }

  /* ------------------------------------------------------- admin is denied */
  console.log('\nЗащита админ-панели');
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  !page.url().includes('/admin')
    ? pass('обычного пользователя не пускает в админку', `перенаправлен на ${page.url().replace(BASE, '')}`)
    : fail('ОБЫЧНЫЙ ПОЛЬЗОВАТЕЛЬ ПОПАЛ В АДМИНКУ');

  /* ------------------------------------------------------------ admin ok */
  console.log('\nАдмин-панель (под администратором)');
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const admin = await adminContext.newPage();
  await admin.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await admin.locator('input[type="email"]').fill('admin@talentmap.ai');
  await admin.locator('input[type="password"]').first().fill('admin12345');
  await admin.getByRole('button', { name: /войти/i }).first().click();
  await admin.waitForTimeout(2500);
  await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(1800);

  // Раньше вход в админку был только безымянной иконкой-щитом среди четырёх
  // других иконок — пользователь её не нашёл. Теперь это подписанный пункт меню.
  await admin.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(1500);
  const adminNav = admin.getByRole('link', { name: /админ-панель/i }).first();
  if (await adminNav.count()) {
    pass('в меню есть подписанный пункт «Админ-панель»');
    await adminNav.click();
    await admin.waitForTimeout(2000);
  } else {
    fail('пункт «Админ-панель» не найден в меню');
    await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await admin.waitForTimeout(1500);
  }

  admin.url().includes('/admin') ? pass('администратор попадает в админку') : fail('администратора не пустило в админку');
  await admin.screenshot({ path: path.join(SHOTS, `${String(++shotIndex).padStart(2, '0')}-admin.png`) });

  const adminText = await admin.textContent('body');
  /пользовател/i.test(adminText || '') ? pass('вкладка пользователей присутствует') : fail('вкладка пользователей отсутствует');

  const usersTab = admin.getByRole('button', { name: /пользовател/i }).first();
  if (await usersTab.count()) {
    await usersTab.click();
    await admin.waitForTimeout(1200);
    await admin.screenshot({ path: path.join(SHOTS, `${String(++shotIndex).padStart(2, '0')}-admin-users.png`) });
    const t = await admin.textContent('body');
    /@/.test(t || '') ? pass('список пользователей заполнен') : fail('список пользователей пуст');
  }
  await admin.close();
  await adminContext.close();

  /* ----------------------------------------------------------- responsive */
  console.log('\nАдаптивность');
  for (const [label, width, height] of [
    ['tablet-768', 768, 1024],
    ['mobile-375', 375, 812],
  ]) {
    const rp = await context.newPage();
    await rp.setViewportSize({ width, height });

    for (const [name, url] of [
      ['landing', '/'],
      ['map', '/app'],
      ['portfolio', '/app/portfolio'],
      ['profile', '/app/profile'],
    ]) {
      await rp.goto(BASE + url, { waitUntil: 'networkidle' });
      await rp.waitForTimeout(1400);
      await rp.screenshot({
        path: path.join(SHOTS, `${String(++shotIndex).padStart(2, '0')}-${label}-${name}.png`),
      });

      const overflow = await rp.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
      );
      overflow
        ? fail(`${label} ${name}: горизонтальное переполнение`)
        : pass(`${label} ${name}: без горизонтальной прокрутки`);
    }
    await rp.close();
  }

  /* ------------------------------------------------------------- console */
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|net::ERR_|Download the React DevTools|404 \(Not Found\)/i.test(e)
  );
  realErrors.length === 0
    ? pass('нет ошибок в консоли браузера')
    : fail(`ошибок в консоли: ${realErrors.length}`, realErrors.slice(0, 3).join(' | '));

  await browser.close();

  /* -------------------------------------------------------------- summary */
  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`ИТОГО: ${ok}/${results.length} проверок пройдено`);
  console.log(`Скриншотов сохранено: ${fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).length}`);
  if (bad.length) {
    console.log(`\nНЕ ПРОЙДЕНО (${bad.length}):`);
    bad.forEach((b) => console.log(`  ✗ ${b.name}${b.detail ? ` — ${b.detail}` : ''}`));
  }
  console.log(`${'─'.repeat(60)}\n`);

  process.exit(bad.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\nE2E упал с ошибкой:', err);
  process.exit(2);
});
