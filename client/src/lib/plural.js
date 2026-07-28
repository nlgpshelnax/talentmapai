/**
 * Русские числительные.
 *
 * Интерфейс писал «2 навыков освоено» и «1 работ в портфолио» — числа
 * подставлялись в готовую строку без согласования. Одна функция на всё
 * приложение решает это раз и навсегда.
 */
export function plural(n, one, few, many) {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Число вместе с согласованным словом: «2 навыка». */
export function withPlural(n, one, few, many) {
  return `${n} ${plural(n, one, few, many)}`;
}

export const WORDS = {
  skill: ['навык', 'навыка', 'навыков'],
  work: ['работа', 'работы', 'работ'],
  star: ['звезда', 'звезды', 'звёзд'],
  direction: ['направление', 'направления', 'направлений'],
  point: ['очко', 'очка', 'очков'],
  answer: ['ответ', 'ответа', 'ответов'],
};

/** Готовые помощники: skills(2) → «2 навыка». */
export const skills = (n) => withPlural(n, ...WORDS.skill);
export const works = (n) => withPlural(n, ...WORDS.work);
export const stars = (n) => withPlural(n, ...WORDS.star);
export const directions = (n) => withPlural(n, ...WORDS.direction);
export const points = (n) => withPlural(n, ...WORDS.point);
