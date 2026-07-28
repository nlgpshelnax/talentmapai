'use strict';

const { QUESTIONS, QUESTION_BY_ID, AGE_RANGE_TO_NUMBER } = require('./questions');

/**
 * Детерминированный движок первичной оценки.
 *
 * Прототип просил направление у языковой модели и без API-ключа всегда
 * откатывался на «первое созвездие» — то есть все дети получали одну карту.
 * Здесь оценка считается арифметикой по признакам интересов: работает без
 * ключа, объяснима (можно показать, почему подобрано именно это) и
 * воспроизводима. Языковая модель, если ключ задан, только формулирует текст.
 */

/** Профиль интересов направления и минимальный возраст, с которого оно уместно. */
const CONSTELLATION_TAGS = {
  'computer-graphics': { tags: { art: 3, visual: 3, digital: 2 }, minAge: 6 },
  'design-project': { tags: { art: 2, visual: 2, hands: 3, structure: 2 }, minAge: 5 },
  'engineering-graphics': { tags: { precision: 3, structure: 3, tech: 2, digital: 1 }, minAge: 10 },
  'programming-web': { tags: { digital: 3, logic: 3, structure: 2 }, minAge: 9 },
  robotics: { tags: { hands: 3, tech: 3, logic: 2, structure: 2 }, minAge: 8 },
  gamedev: { tags: { digital: 3, play: 3, art: 2, logic: 2, words: 1 }, minAge: 9 },
  'ai-data': { tags: { logic: 3, digital: 3, abstract: 3 }, minAge: 12 },
  'sound-design': { tags: { audio: 3, art: 2, digital: 2 }, minAge: 7 },
  'media-content': { tags: { visual: 3, social: 3, words: 2, digital: 2, play: 1 }, minAge: 8 },
  cybersecurity: { tags: { logic: 3, digital: 3, abstract: 2, structure: 2 }, minAge: 12 },
  bioengineering: { tags: { science: 3, nature: 3, precision: 2, abstract: 1 }, minAge: 11 },
  'esports-streaming': { tags: { play: 3, social: 3, digital: 2 }, minAge: 10 },
  '3d-printing': { tags: { hands: 3, structure: 2, tech: 2, art: 1 }, minAge: 7 },
  'drone-piloting': { tags: { hands: 2, play: 2, tech: 3, precision: 2 }, minAge: 10 },
};

const TAG_LABELS = {
  art: 'творчество',
  visual: 'визуальное мышление',
  hands: 'работа руками',
  digital: 'работа за компьютером',
  logic: 'логика',
  structure: 'системность',
  precision: 'точность',
  tech: 'техника',
  play: 'игровой интерес',
  social: 'общение',
  audio: 'звук и музыка',
  science: 'наука',
  abstract: 'абстрактное мышление',
  words: 'истории и тексты',
  nature: 'живая природа',
};

const asArray = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

/**
 * Складывает ответы в один профиль интересов.
 *
 * Вклад каждого вопроса делится на число выбранных в нём вариантов: иначе
 * вопрос с множественным выбором давал бы вдвое больше сигнала, чем обычный,
 * просто потому что там отметили два пункта.
 */
function buildInterestProfile(answers = {}) {
  const profile = {};

  for (const q of QUESTIONS) {
    if (!q.options) continue;

    const chosen = asArray(answers[q.id]);
    if (!chosen.length) continue;

    const share = 1 / chosen.length;
    for (const value of chosen) {
      const option = q.options.find((o) => o.value === value);
      if (!option?.weights) continue;
      for (const [tag, weight] of Object.entries(option.weights)) {
        profile[tag] = (profile[tag] || 0) + weight * share;
      }
    }
  }

  return profile;
}

function resolveAge(answers = {}, fallback = 10) {
  const n = AGE_RANGE_TO_NUMBER[answers.age];
  return Number.isFinite(n) ? n : fallback;
}

/** Косинусная близость профиля ребёнка и профиля направления. */
function affinity(profile, tags) {
  let dot = 0;
  let magT = 0;
  for (const [tag, weight] of Object.entries(tags)) {
    dot += (profile[tag] || 0) * weight;
    magT += weight * weight;
  }
  let magP = 0;
  for (const v of Object.values(profile)) magP += v * v;
  if (magP === 0 || magT === 0) return 0;
  return dot / (Math.sqrt(magP) * Math.sqrt(magT));
}

/**
 * Близость → процент совпадения для показа человеку.
 * Кривая с показателем 0,65 растягивает середину шкалы: без неё почти всё
 * скучивалось бы в диапазоне 40–70 % и проценты ничего бы не различали.
 */
function toMatchPercent(score) {
  const clamped = Math.max(0, Math.min(1, score));
  return Math.round(clamped ** 0.65 * 100);
}

/** Сильные стороны ребёнка: до пяти признаков, нормированных к 100. */
function profileHighlights(profile, limit = 5) {
  const positive = Object.entries(profile).filter(([, v]) => v > 0);
  if (!positive.length) return [];

  const max = Math.max(...positive.map(([, v]) => v));
  return positive
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, value]) => ({
      tag,
      label: TAG_LABELS[tag] || tag,
      value: Math.round((value / max) * 100),
    }));
}

/** Короткое объяснение, почему направление подобрано. */
function explain(profile, tags) {
  const shared = Object.keys(tags)
    .filter((t) => (profile[t] || 0) > 0)
    .sort((a, b) => (profile[b] || 0) * tags[b] - (profile[a] || 0) * tags[a])
    .slice(0, 2)
    .map((t) => TAG_LABELS[t] || t);

  if (!shared.length) return 'Хорошая отправная точка, чтобы попробовать себя в новом.';
  return `Совпало по ответам: ${shared.join(', ')}.`;
}

/**
 * Насколько уверенно можно опираться на результат.
 * Смотрим на отрыв лидера от середины списка и на полноту ответов: если
 * заполнена половина анкеты или все направления набрали примерно поровну,
 * честнее сказать об этом, чем показывать красивый, но пустой процент.
 */
function assessConfidence(ranked, answeredCount) {
  const scored = ranked.map((c) => c.score);
  if (scored.length < 2) return { level: 'low', label: 'предварительная' };

  // Если ненулевое совпадение набрало меньше двух направлений, результат
  // держится на одном варианте — называть это высокой точностью нечестно.
  const viable = ranked.filter((c) => c.match >= 30).length;
  if (viable < 2) return { level: 'low', label: 'предварительная' };

  const top = scored[0];
  const median = scored[Math.floor(scored.length / 2)];
  const gap = top - median;

  if (answeredCount < 6 || top <= 0.15) return { level: 'low', label: 'предварительная' };
  if (gap >= 0.18 && answeredCount >= 9) return { level: 'high', label: 'высокая' };
  if (gap >= 0.09) return { level: 'medium', label: 'средняя' };
  return { level: 'low', label: 'предварительная' };
}

/**
 * Ранжирует направления под ответы ребёнка.
 * @param {object} answers        ответы по id вопроса (строка или массив строк)
 * @param {Array}  constellations строки из БД (нужны id, key, name)
 */
function recommend(answers, constellations) {
  const profile = buildInterestProfile(answers);
  const age = resolveAge(answers);
  const cautiousAboutSoftware = answers.fearSoftware === 'yes';
  const answeredCount = QUESTIONS.filter((q) => asArray(answers[q.id]).length).length;

  const ranked = constellations
    .map((c) => {
      const meta = CONSTELLATION_TAGS[c.key] || { tags: {}, minAge: 6 };
      let score = affinity(profile, meta.tags);

      // Возраст — не жёсткий фильтр (он мог бы обнулить весь список), а штраф.
      // Штраф растёт быстрее линейного: год-два разницы почти не мешают
      // (семилетке можно дать введение в программирование), а разрыв в пять
      // лет решает — кибербезопасность семилетке предлагать нельзя.
      if (age < meta.minAge) {
        const gap = meta.minAge - age;
        score -= Math.min(1.2, 0.14 * gap ** 1.3);
      }

      // Ребёнка, которому сложные программы пока страшны, не стоит сразу
      // отправлять в самые «экранные» направления.
      if (cautiousAboutSoftware && (meta.tags.digital || 0) >= 3) score -= 0.25;

      // Микроскопический детерминированный тайбрейк: порядок стабилен между запусками.
      score += (c.id % 7) * 0.0001;

      return {
        ...c,
        score,
        match: toMatchPercent(score),
        weak: toMatchPercent(score) < 30,
        reason: explain(profile, meta.tags),
        tooYoung: age < meta.minAge,
        minAge: meta.minAge,
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    ranked,
    profile,
    age,
    answeredCount,
    highlights: profileHighlights(profile),
    confidence: assessConfidence(ranked, answeredCount),
  };
}

/**
 * Отбирает 2–4 направления, которые откроются на карте.
 * Минимум два — чтобы карта не выглядела пустой и было с чем сравнить.
 */
function pickRecommended(answers, constellations, { min = 2, max = 4 } = {}) {
  const result = recommend(answers, constellations);
  const { ranked } = result;
  if (!ranked.length) return { ...result, ids: [], chosen: [] };

  const top = ranked[0].score;
  const chosen = ranked.filter((c, i) => i < min || (c.score > 0 && c.score >= top * 0.72)).slice(0, max);

  return { ...result, ids: chosen.map((c) => c.id), chosen };
}

/** Одно предложение о ребёнке — заголовок экрана результата. */
function describeProfile(answers, { name = 'Ребёнок' } = {}) {
  const has = (id, value) => asArray(answers[id]).includes(value);
  const traits = [];

  if (has('picture', 'paint') || has('makeWithHands', 'drawing') || has('hobby', 'draw')) traits.push('визуал');
  if (has('orderOrFreedom', 'order')) traits.push('любит точность и порядок');
  if (has('orderOrFreedom', 'freedom')) traits.push('любит свободу и цвет');
  if (has('orderOrFreedom', 'team')) traits.push('лучше раскрывается в команде');
  if (has('fearSoftware', 'love') || has('fearSoftware', 'no')) traits.push('уверенно чувствует себя за компьютером');
  if (has('fearSoftware', 'yes')) traits.push('пока осторожен со сложными программами');
  if (has('hobby', 'build') || has('makeWithHands', 'model') || has('hobby', 'tinker')) traits.push('любит собирать руками');
  if (has('hobby', 'music') || has('makeWithHands', 'song')) traits.push('тянется к звуку');
  if (has('hobby', 'read')) traits.push('придумывает истории');
  if (has('hobby', 'nature')) traits.push('интересуется живой природой');
  if (has('priority', 'achievements')) traits.push('нацелен на результат');

  const age = resolveAge(answers);
  const hours = answers.weeklyHours && answers.weeklyHours !== 'пока не знаем' ? answers.weeklyHours : null;
  const traitText = traits.slice(0, 3).join(', ') || 'открыт новому';
  const hoursText = hours ? ` На занятия есть ${hours} в неделю.` : '';

  return `${name}, ${age} лет. ${traitText.charAt(0).toUpperCase() + traitText.slice(1)}.${hoursText}`;
}

/**
 * Проверка присланных ответов по определению вопросов.
 *
 * Раньше схема принимала любой объект «строка → строка»: можно было прислать
 * несуществующий вопрос, выдуманный вариант или двадцать значений там, где
 * разрешено два, и всё это молча попадало в расчёт. Теперь набор вопросов —
 * единственный источник правды и для формы, и для валидации.
 */
function validateAnswers(raw) {
  const errors = [];
  const clean = {};

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: [{ field: 'answers', message: 'Ответы должны быть объектом' }], answers: {} };
  }

  for (const key of Object.keys(raw)) {
    if (!QUESTION_BY_ID.has(key)) {
      errors.push({ field: key, message: 'Неизвестный вопрос' });
    }
  }

  for (const q of QUESTIONS) {
    const value = raw[q.id];

    if (q.type === 'city') {
      if (value == null || value === '') continue;
      const text = String(value).trim();
      if (text.length < 2 || text.length > 80) {
        errors.push({ field: q.id, message: 'Название города — от 2 до 80 символов' });
      } else {
        clean[q.id] = text;
      }
      continue;
    }

    if (value == null || value === '' || (Array.isArray(value) && !value.length)) continue;

    const chosen = asArray(value).map(String);
    const allowed = new Set(q.options.map((o) => o.value));
    const unknown = chosen.filter((v) => !allowed.has(v));

    if (unknown.length) {
      errors.push({ field: q.id, message: `Недопустимый вариант ответа: ${unknown.join(', ')}` });
      continue;
    }
    if (new Set(chosen).size !== chosen.length) {
      errors.push({ field: q.id, message: 'Вариант выбран дважды' });
      continue;
    }
    if (!q.multi && chosen.length > 1) {
      errors.push({ field: q.id, message: 'В этом вопросе можно выбрать только один вариант' });
      continue;
    }
    if (q.multi && chosen.length > (q.maxChoices || 1)) {
      errors.push({ field: q.id, message: `Можно выбрать не более ${q.maxChoices} вариантов` });
      continue;
    }

    // «Ничего не пробовали» не сочетается с перечислением кружков.
    const exclusive = q.options.filter((o) => o.exclusive).map((o) => o.value);
    if (chosen.length > 1 && chosen.some((v) => exclusive.includes(v))) {
      errors.push({ field: q.id, message: 'Этот вариант нельзя совмещать с остальными' });
      continue;
    }

    clean[q.id] = q.multi ? chosen : chosen[0];
  }

  // Минимальная полнота: без ответов на вопросы с весами оценка бессмысленна.
  const scored = QUESTIONS.filter((q) => q.options?.some((o) => o.weights && Object.keys(o.weights).length));
  const answeredScored = scored.filter((q) => asArray(clean[q.id]).length).length;
  if (answeredScored < 3) {
    errors.push({
      field: 'answers',
      message: 'Слишком мало ответов, чтобы построить карту: ответьте хотя бы на три вопроса об интересах',
    });
  }

  return { ok: errors.length === 0, errors, answers: clean };
}

module.exports = {
  recommend,
  pickRecommended,
  describeProfile,
  buildInterestProfile,
  validateAnswers,
  profileHighlights,
  toMatchPercent,
  CONSTELLATION_TAGS,
  TAG_LABELS,
};
