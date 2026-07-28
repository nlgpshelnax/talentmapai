'use strict';

/**
 * Сборка каталога площадок из результатов исследования.
 *
 * На входе — JSON-файлы в `research/`, куда выгружены проверенные организации
 * с их филиалами и ссылками на источники. На выходе — `src/data/venues.js`,
 * который читает засев базы.
 *
 * Зачем отдельный шаг, а не правка руками: данные будут обновляться, и каждый
 * раз переписывать 200 объектов вручную — верный способ занести опечатку или,
 * что хуже, выдуманный адрес. Здесь же всё, что попадает в продукт, обязано
 * прийти из файла исследования.
 *
 * Usage: node scripts/build-venues.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const RESEARCH = path.join(ROOT, 'research');
const OUT = path.join(ROOT, 'src/data/venues.js');

/**
 * Ключи направлений берём прямо из учебного контента, а не переписываем
 * списком: расхождение в один символ («esports» против «esports-streaming»)
 * тихо оставляет целое направление без единой площадки.
 */
const DIRECTIONS = new Set([
  ...require('../src/db/content-a').map((c) => c.key),
  ...require('../src/db/content-b').map((c) => c.key),
]);

/** Как исследование называло направления → как они называются в контенте. */
const ALIASES = { esports: 'esports-streaming' };

const LEGACY_IDS = new Set([
  'computer-graphics',
  'design-project',
  'engineering-graphics',
  'programming-web',
  'robotics',
  'gamedev',
  'ai-data',
  'sound-design',
  'media-content',
  'cybersecurity',
  'bioengineering',
  'esports',
  '3d-printing',
  'drone-piloting',
]);

// Страховка: если контент переименуют, а исследование останется старым,
// сборка скажет об этом вслух, а не молча потеряет направление.
for (const id of LEGACY_IDS) {
  if (!DIRECTIONS.has(id) && !ALIASES[id]) {
    console.warn(`[venues] направление «${id}» из исследования больше не существует в контенте`);
  }
}

const ANYWHERE = 'Вся Россия';

/* ------------------------------------------------------------- нормализация */

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Короткая подпись о цене — она рисуется бейджем, а не абзацем.
 * Исследование возвращает честные, но длинные формулировки вроде
 * «Бесплатно (государственный проект; отдельные смены могут быть платными)».
 * В бейдж идёт суть, оговорка переезжает в описание.
 */
function shortPrice(note) {
  const text = String(note || '').trim();
  if (!text) return null;
  const head = text.split(/[(;,]/)[0].trim();
  if (/^бесплатн/i.test(head)) return 'Бесплатно';
  if (/^платн/i.test(head)) return 'Платно';
  if (/бесплатн/i.test(text) && /платн/i.test(text)) return 'Есть бесплатные программы';
  if (/бесплатн/i.test(text)) return 'Бесплатно';
  if (/платн/i.test(text)) return 'Платно';
  return head.length <= 30 ? head : null;
}

/** Возраст тоже бейдж: «11–18 лет (в отдельных регионах с 7 лет)» → «11–18 лет». */
function shortAge(range) {
  const text = String(range || '').trim();
  if (!text) return null;
  const head = text.split('(')[0].trim().replace(/[;,]$/, '');
  if (!head || head.length > 24) {
    const m = text.match(/\d+\s*[–—-]\s*\d+\s*лет|с\s*\d+\s*лет/i);
    return m ? m[0] : null;
  }
  return head;
}

/** Описание обрезаем по границе предложения, чтобы карточка не расползалась. */
function shortSummary(text, limit = 190) {
  const s = String(text || '').trim();
  if (s.length <= limit) return s || null;
  const cut = s.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (stop > 80 ? cut.slice(0, stop + 1) : `${cut.replace(/[\s,;—-]+$/, '')}…`).trim();
}

/**
 * Оговорку из длинной подписи о цене не выбрасываем, а дописываем в описание:
 * «бесплатно, но летние смены платные» — это то, что родитель должен узнать
 * до звонка в центр, а не после.
 */
function withPriceCaveat(summary, priceNote) {
  const note = String(priceNote || '').trim();
  const inParens = note.match(/\(([^)]+)\)/);
  if (!inParens) return summary;
  const caveat = inParens[1].trim();
  if (caveat.length < 20 || caveat.length > 160) return summary;
  const capital = caveat.charAt(0).toUpperCase() + caveat.slice(1);
  return summary ? `${summary} ${capital}.` : `${capital}.`;
}

/**
 * Город приводим к тому же виду, в каком он лежит в справочнике городов:
 * пользователь выбирает «Долгопрудный», а исследование принесло
 * «Долгопрудный (Московская область)» — иначе совпадения не будет никогда.
 */
function cleanCity(city) {
  return String(city || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Как назвать площадку в списке.
 *
 * Исследование даёт имена филиалов вида «Кампус в Москве» или «МШП Москва» —
 * в карточке это выглядит так, будто ребёнку предлагают пойти в «Кампус».
 * Если в имени филиала нет ничего своего, кроме города, показываем название
 * организации; если есть («филиал „Коломенская“») — оставляем его.
 */
const GENERIC_BRANCH = /^(кампус|филиал|отделение|представительство|офис)(\s|$)/i;

/**
 * Основа названия города, чтобы вычистить его из имени филиала в любом падеже.
 * «Москва» встречается как «в Москве», «Ростов-на-Дону» — как «Ростове-на-Дону»,
 * поэтому сравнивать строки целиком бесполезно.
 */
function cityStems(city) {
  // «Ростов-на-Дону» встречается как «Ростове-на-Дону»: режем по всем частям
  // названия и отбрасываем последнюю букву, чтобы поймать любой падеж.
  return cleanCity(city)
    .split(/[\s-]+/)
    .filter((part) => part.length > 2)
    .map((part) => (part.length > 4 ? part.slice(0, -1) : part));
}

/** Длинные хвосты в скобках режем: в списке важно название, а не примечание. */
function tidyName(name, limit = 74) {
  let out = String(name || '')
    .replace(/\s*\((сеть|включает|бывш\.|ранее)[^)]*\)/gi, '')
    .trim();
  const tail = out.match(/\s*\(([^)]{26,})\)\s*$/);
  if (tail) out = out.slice(0, tail.index).trim();
  if (out.length > limit) {
    const cut = out.slice(0, limit);
    out = `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;—-]+$/, '')}…`;
  }
  return out;
}

function displayName(org, branch) {
  const orgName = tidyName(org.name);
  const raw = String(branch?.name || '').trim();
  if (!raw) return orgName;

  let withoutCity = raw;
  for (const stem of cityStems(branch.city)) {
    withoutCity = withoutCity.replace(new RegExp(`${stem}\\p{L}*`, 'giu'), ' ');
  }
  withoutCity = withoutCity
    .replace(/(^|\s)(в|во|на|г\.?|обл\.?|области|край|края)(\s|$)/gi, ' ')
    .replace(/[\s,—-]+/g, ' ')
    .trim();

  if (GENERIC_BRANCH.test(raw) || withoutCity.length < 12) return orgName;
  return tidyName(raw);
}

function readJson(name) {
  const file = path.join(RESEARCH, name);
  if (!fs.existsSync(file)) {
    console.warn(`[venues] нет файла исследования: ${name} — пропускаю`);
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/* ------------------------------------------------------------------ сборка */

const venues = [];
const seen = new Set();
const problems = [];

function push(v) {
  if (!v.name || !v.city) {
    problems.push(`пропущено без имени или города: ${JSON.stringify(v).slice(0, 90)}`);
    return;
  }
  const directions = (v.directions || [])
    .map((d) => ALIASES[d] || d)
    .filter((d) => {
      if (DIRECTIONS.has(d)) return true;
      problems.push(`неизвестное направление «${d}» у «${v.name}»`);
      return false;
    });
  if (!directions.length) {
    problems.push(`нет ни одного известного направления: ${v.name}`);
    return;
  }
  if (v.url && /(^|\.)(example|test|placeholder)[-.]/i.test(new URL(v.url).hostname)) {
    problems.push(`домен-заглушка у «${v.name}»: ${v.url}`);
    return;
  }
  if (seen.has(v.code)) return;
  seen.add(v.code);
  venues.push({ ...v, directions });
}

/**
 * Организация не для детей — мимо каталога.
 *
 * Исследование честно принесло «Школу 21» с пометкой 18+ (отборочный «бассейн»
 * с 17). Это хорошая школа, но продукт — про детей 6–18, и подросток, увидев
 * её в списке «куда пойти», просто упрётся в отказ на входе.
 */
function isAdultsOnly(org) {
  // Смотрим только на первую формулировку возраста: в скобках и после «;» идут
  // оговорки вроде «есть ИТ-колледж 14–18+», и по ним отсеивать нельзя —
  // так из каталога вылетала школа, у которой детские курсы с семи лет.
  const head = String(org.ageRange || org.minAgeNote || '').split(/[(;]/)[0];
  const first = head.match(/\d{1,2}/);
  return Boolean(first && Number(first[0]) >= 17);
}

/** Организация с филиалами → по площадке на город. */
function addOrganisation(org) {
  if (isAdultsOnly(org)) {
    problems.push(`пропущена как «для взрослых»: ${org.name} (${org.ageRange || org.minAgeNote})`);
    return;
  }
  const branches = org.branches || [];
  const base = {
    network: org.id,
    org: org.name,
    kind: org.kind || 'commercial',
    format: org.format || 'offline',
    priceNote: shortPrice(org.priceNote),
    ageRange: shortAge(org.ageRange || org.minAgeNote),
    directions: org.directions || [],
  };
  const summary = withPriceCaveat(shortSummary(org.summary), org.priceNote);

  for (const b of branches) {
    push({
      ...base,
      code: `${org.id}__${slug(cleanCity(b.city))}`,
      name: displayName(org, b),
      city: cleanCity(b.city),
      address: b.address || null,
      url: b.url || org.officialUrl || null,
      summary,
      verified: b.verified !== false,
    });
  }

  if (branches.length) return;

  // Сеть без подтверждённых филиалов, но работающая онлайн, всё равно полезна —
  // показываем её как доступную откуда угодно.
  if (org.format === 'online' || org.format === 'hybrid') {
    push({
      ...base,
      code: `${org.id}__online`,
      name: displayName(org),
      city: 'Онлайн',
      address: null,
      url: org.officialUrl || null,
      summary,
      verified: true,
    });
    return;
  }

  /**
   * Очная сеть, чьё присутствие в городах подтверждено на уровне организации,
   * но не постранично. Расписывать её по городам нельзя — получится обещание
   * филиала, которого мы не видели. Но и выбрасывать жалко: «Яндекс Лицей»
   * бесплатен и работает в полутора сотнях городов. Поэтому одна запись «Вся
   * Россия» с прямым указанием выбрать город на сайте.
   */
  const wide = (org.citiesUnverified || []).length;
  if (wide >= 5) {
    push({
      ...base,
      code: `${org.id}__wide`,
      name: displayName(org),
      city: ANYWHERE,
      address: null,
      url: org.officialUrl || null,
      summary: [summary, `Работает более чем в ${wide === 14 ? 'десяти' : wide} городах — выберите свой на сайте школы.`]
        .filter(Boolean)
        .join(' '),
      verified: false,
      sortOrder: 800,
    });
  }
}

/* 1. Государственные сети */
const state = readJson('state-networks.json');
for (const n of state?.networks || []) addOrganisation(n);

/* 2. Школы программирования */
const itSchools = readJson('it-schools.json');
for (const n of itSchools?.schools || []) addOrganisation(n);

/* 3. Творческие школы */
const creative = readJson('creative-schools.json');
for (const n of creative?.schools || []) addOrganisation(n);

/* 4. Ниши: дроны, киберспорт, биоинженерия */
const niche = readJson('niche.json');
for (const n of niche?.organisations || []) addOrganisation(n);

/* 5. Всероссийские программы — доступны из любого города */
for (const p of niche?.nationwideProgrammes || []) {
  push({
    code: `nationwide__${p.id}`,
    network: p.id,
    name: p.name,
    org: null,
    city: ANYWHERE,
    address: null,
    url: p.url,
    kind: 'nonprofit',
    format: 'hybrid',
    priceNote: shortPrice(p.priceNote) || 'Бесплатно',
    ageRange: shortAge(p.ageRange),
    summary: shortSummary([p.summary, p.note].filter(Boolean).join(' ')),
    directions: p.directions || [],
    verified: p.verified !== false,
  });
}

/**
 * 6. Региональные «Навигаторы» дополнительного образования.
 *
 * Это самая ценная часть каталога. Партнёрская школа есть не в каждом городе и
 * не по каждому направлению, а государственный навигатор — есть, и в нём
 * перечислены все кружки региона. Поэтому такая площадка ставится в каждый
 * город по всем четырнадцати направлениям и служит честным ответом «мы не
 * знаем конкретный кружок у вас, но вот где искать».
 */
for (const p of creative?.regionalPortals || []) {
  push({
    code: `navigator__${slug(cleanCity(p.city))}`,
    network: 'navigator',
    // У порталов длинные официальные названия («Запись в кружки, спортивные
    // секции, дома творчества (Госуслуги Москвы)»). В списке нужен ярлык.
    name: `Навигатор дополнительного образования — ${cleanCity(p.region || p.city)}`,
    org: p.name,
    city: cleanCity(p.city),
    address: null,
    url: p.url,
    kind: 'state',
    format: 'hybrid',
    priceNote: 'Бесплатно',
    ageRange: null,
    summary: shortSummary(
      p.note ||
        'Государственный портал записи в кружки и секции: здесь собраны все программы дополнительного образования региона, в том числе бесплатные по сертификату.'
    ),
    directions: [...DIRECTIONS],
    verified: p.verified !== false,
    sortOrder: 900, // навигатор — запасной вариант, показывается после конкретных площадок
  });
}

/* ------------------------------------------------------------- сортировка */

const KIND_RANK = { state: 0, nonprofit: 1, university: 2, commercial: 3 };

venues.sort((a, b) => {
  if ((a.sortOrder ?? 100) !== (b.sortOrder ?? 100)) return (a.sortOrder ?? 100) - (b.sortOrder ?? 100);
  // Бесплатное и государственное — выше: для большинства семей это решающее.
  const ka = KIND_RANK[a.kind] ?? 9;
  const kb = KIND_RANK[b.kind] ?? 9;
  if (ka !== kb) return ka - kb;
  if (a.verified !== b.verified) return a.verified ? -1 : 1;
  return a.name.localeCompare(b.name, 'ru');
});

venues.forEach((v, i) => {
  v.sortOrder = i;
});

/* --------------------------------------------------------------- запись */

const cities = [...new Set(venues.map((v) => v.city))].sort((a, b) => a.localeCompare(b, 'ru'));
const byDirection = {};
for (const v of venues) for (const d of v.directions) byDirection[d] = (byDirection[d] || 0) + 1;

const header = `'use strict';

/**
 * Каталог реальных площадок: кружки, центры, школы и всероссийские программы.
 *
 * ФАЙЛ СОБИРАЕТСЯ АВТОМАТИЧЕСКИ — не правьте его руками.
 *   источник: research/*.json
 *   сборка:   node scripts/build-venues.js
 *
 * Каждая запись пришла из исследования с проверенной ссылкой на официальный
 * сайт. Адрес указан только там, где его удалось подтвердить на сайте самой
 * организации: пустой адрес честнее правдоподобного вымысла.
 *
 * Города «${ANYWHERE}» и «Онлайн» — особые: такие площадки показываются
 * ребёнку из любого города.
 *
 * Собрано: ${venues.length} площадок в ${cities.length} городах.
 */

`;

fs.writeFileSync(OUT, `${header}module.exports = ${JSON.stringify(venues, null, 2)};\n`, 'utf8');

console.log(`\n[venues] собрано ${venues.length} площадок в ${cities.length} городах`);
console.log(`[venues] города: ${cities.join(', ')}`);
console.log('[venues] покрытие направлений:');
for (const d of DIRECTIONS) {
  const n = byDirection[d] || 0;
  console.log(`   ${n ? ' ' : '!'} ${d.padEnd(22)} ${n}`);
}
if (problems.length) {
  console.log(`\n[venues] замечания (${problems.length}):`);
  for (const p of problems.slice(0, 20)) console.log(`   • ${p}`);
}
console.log(`\n[venues] записано в ${path.relative(ROOT, OUT)}\n`);
