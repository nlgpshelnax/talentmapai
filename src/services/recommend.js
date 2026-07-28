'use strict';

const { QUESTIONS, AGE_RANGE_TO_NUMBER } = require('./questions');

/**
 * Deterministic recommendation engine.
 *
 * The prototype asked an LLM to pick constellations and fell back to
 * "constellation #1" whenever the key was missing or the JSON failed to parse —
 * which, with no key configured, was always. Everyone got the same map.
 *
 * This engine scores every constellation against the child's answers using
 * interest tags. It needs no API key, always returns a sensible personalised
 * result, and is explainable — we can tell the parent *why* something was
 * suggested. When an LLM key is configured it refines the wording, not the maths.
 */

/** Interest profile of each constellation, plus the youngest age it suits. */
const CONSTELLATION_TAGS = {
  'computer-graphics': { tags: { art: 3, visual: 3, digital: 2 }, minAge: 7 },
  'design-project': { tags: { art: 2, visual: 2, hands: 3, structure: 2 }, minAge: 6 },
  'engineering-graphics': { tags: { precision: 3, structure: 3, tech: 2, digital: 1 }, minAge: 10 },
  'programming-web': { tags: { digital: 3, logic: 3, structure: 2 }, minAge: 9 },
  robotics: { tags: { hands: 3, tech: 3, logic: 2, structure: 2 }, minAge: 8 },
  gamedev: { tags: { digital: 3, play: 3, art: 2, logic: 2 }, minAge: 9 },
  'ai-data': { tags: { logic: 3, digital: 3, abstract: 3 }, minAge: 12 },
  'sound-design': { tags: { audio: 3, art: 2, digital: 2 }, minAge: 8 },
  'media-content': { tags: { visual: 3, social: 3, digital: 2, play: 1 }, minAge: 8 },
  cybersecurity: { tags: { logic: 3, digital: 3, abstract: 2, structure: 2 }, minAge: 12 },
  bioengineering: { tags: { science: 3, precision: 2, abstract: 2 }, minAge: 11 },
  'esports-streaming': { tags: { play: 3, social: 3, digital: 2 }, minAge: 10 },
  '3d-printing': { tags: { hands: 3, structure: 2, tech: 2, art: 1 }, minAge: 8 },
  'drone-piloting': { tags: { hands: 2, play: 2, tech: 3, precision: 2 }, minAge: 10 },
};

/** Sum the tag weights of every chosen answer into one interest profile. */
function buildInterestProfile(answers = {}) {
  const profile = {};
  for (const q of QUESTIONS) {
    if (!q.options) continue;
    const chosen = answers[q.id];
    if (!chosen) continue;
    const option = q.options.find((o) => o.value === chosen);
    if (!option || !option.weights) continue;
    for (const [tag, weight] of Object.entries(option.weights)) {
      profile[tag] = (profile[tag] || 0) + weight;
    }
  }
  return profile;
}

function resolveAge(answers = {}, fallback = 10) {
  const n = AGE_RANGE_TO_NUMBER[answers.age];
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Cosine-style affinity between the child's profile and a constellation's tags.
 * Normalised so constellations with many tags aren't automatically favoured.
 */
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

/** Short human-readable reason, shown to the parent under the recommendation. */
function explain(profile, tags) {
  const LABELS = {
    art: 'творчество',
    visual: 'визуальное мышление',
    hands: 'работа руками',
    digital: 'интерес к компьютеру',
    logic: 'логика',
    structure: 'системность',
    precision: 'точность',
    tech: 'техника',
    play: 'игровой интерес',
    social: 'общение',
    audio: 'звук',
    science: 'наука',
    abstract: 'абстрактное мышление',
  };
  const shared = Object.keys(tags)
    .filter((t) => (profile[t] || 0) > 0)
    .sort((a, b) => (profile[b] || 0) * tags[b] - (profile[a] || 0) * tags[a])
    .slice(0, 2)
    .map((t) => LABELS[t] || t);
  if (!shared.length) return 'Хорошая отправная точка для знакомства с направлением.';
  return `Подходит по ответам: ${shared.join(', ')}.`;
}

/**
 * Rank constellations for a child.
 * @param {object} answers      answers keyed by question id
 * @param {Array}  constellations rows from the DB (need id, key, name)
 * @returns {{ranked: Array, profile: object, age: number}}
 */
function recommend(answers, constellations) {
  const profile = buildInterestProfile(answers);
  const age = resolveAge(answers);
  const cautiousAboutSoftware = answers.fearSoftware === 'yes';

  const ranked = constellations
    .map((c) => {
      const meta = CONSTELLATION_TAGS[c.key] || { tags: {}, minAge: 6 };
      let score = affinity(profile, meta.tags);

      // Age suitability: a hard filter is too blunt (it can empty the list),
      // so being under the recommended age is a strong penalty instead.
      if (age < meta.minAge) score -= 0.35 * Math.min(3, meta.minAge - age);

      // A child who says complex software scares them shouldn't be pushed
      // straight into the most screen-heavy tracks.
      if (cautiousAboutSoftware && (meta.tags.digital || 0) >= 3) score -= 0.25;

      // Tiny deterministic tiebreaker keeps ordering stable across runs.
      score += (c.id % 7) * 0.0001;

      return { ...c, score, reason: explain(profile, meta.tags) };
    })
    .sort((a, b) => b.score - a.score);

  return { ranked, profile, age };
}

/**
 * Pick the 2–4 constellations to unlock on the child's map.
 * Always returns at least two so the map never looks empty.
 */
function pickRecommended(answers, constellations, { min = 2, max = 4 } = {}) {
  const { ranked, profile, age } = recommend(answers, constellations);
  if (!ranked.length) return { ids: [], ranked, profile, age };

  const top = ranked[0].score;
  // Keep anything reasonably close to the best match, then clamp to [min, max].
  const chosen = ranked.filter((c, i) => i < min || (c.score > 0 && c.score >= top * 0.72)).slice(0, max);

  return { ids: chosen.map((c) => c.id), ranked, chosen, profile, age };
}

/** One-paragraph summary of the child, used in the diagnostics result screen. */
function describeProfile(answers, { name = 'Ребёнок' } = {}) {
  const traits = [];
  if (answers.picture === 'paint' || answers.makeWithHands === 'drawing') traits.push('визуал');
  if (answers.orderOrFreedom === 'order') traits.push('любит точность');
  if (answers.orderOrFreedom === 'freedom') traits.push('любит свободу и цвет');
  if (answers.fearSoftware === 'no') traits.push('уверенно чувствует себя за компьютером');
  if (answers.fearSoftware === 'yes') traits.push('пока осторожен со сложными программами');
  if (answers.hobby === 'build' || answers.makeWithHands === 'model') traits.push('любит собирать руками');
  if (answers.priority === 'achievements') traits.push('нацелен на результат');

  const age = resolveAge(answers);
  const hours = answers.weeklyHours || '3-5 часов';
  const traitText = traits.length ? traits.join(', ') : 'открыт новому';

  return `${name}, ${age} лет. ${traitText.charAt(0).toUpperCase() + traitText.slice(1)}. На занятия есть ${hours} в неделю.`;
}

module.exports = { recommend, pickRecommended, describeProfile, buildInterestProfile, CONSTELLATION_TAGS };
