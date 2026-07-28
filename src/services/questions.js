'use strict';

/**
 * The 12 diagnostic questions from the TZ: 7 for the parent, 5 for the child.
 * This is the single source of truth — the client fetches it from
 * GET /api/diagnostics/questions instead of hardcoding its own copy,
 * so the scoring engine and the UI can never drift apart.
 *
 * `weights` maps an answer to interest tags. The recommendation engine sums
 * these across all answers to rank constellations. See services/recommend.js.
 */

const QUESTIONS = [
  // ---------------------------------------------------------------- PARENT
  {
    id: 'age',
    block: 'parent',
    type: 'choice',
    question: 'Сколько лет ребёнку?',
    hint: 'Это поможет подобрать подходящую сложность',
    options: [
      { value: '3-6', label: '3–6 лет', icon: '🧸' },
      { value: '7-10', label: '7–10 лет', icon: '🎒' },
      { value: '11-14', label: '11–14 лет', icon: '🚀' },
      { value: '15-18', label: '15–18 лет', icon: '🎓' },
    ],
  },
  {
    id: 'hobby',
    block: 'parent',
    type: 'choice',
    question: 'Чем ребёнок больше всего любит заниматься в свободное время?',
    options: [
      {
        value: 'draw',
        label: 'Рисовать, раскрашивать, лепить',
        icon: '🎨',
        weights: { art: 3, visual: 3, hands: 2 },
      },
      {
        value: 'computer',
        label: 'Играть в компьютерные игры или планшет',
        icon: '🖥️',
        weights: { digital: 3, play: 3, logic: 1 },
      },
      {
        value: 'build',
        label: 'Конструировать, строить, собирать Lego',
        icon: '🧱',
        weights: { hands: 3, structure: 3, tech: 2 },
      },
      {
        value: 'watch',
        label: 'Смотреть видео о том, как что-то делают',
        icon: '📺',
        weights: { social: 2, visual: 2, hands: 1 },
      },
    ],
  },
  {
    id: 'clubs',
    block: 'parent',
    type: 'choice',
    question: 'Пробовали ли вы уже кружки по творчеству или технике?',
    options: [
      { value: 'none', label: 'Нет, ничего', icon: '🌱', weights: {} },
      { value: 'art', label: 'Да, рисование или художественная школа', icon: '🖌️', weights: { art: 2, visual: 2 } },
      { value: 'digital', label: 'Да, что-то компьютерное (графика, 3D)', icon: '💻', weights: { digital: 3, tech: 1 } },
      { value: 'craft', label: 'Да, рукоделие, керамика, макетирование', icon: '🏺', weights: { hands: 3, structure: 1 } },
    ],
  },
  {
    id: 'weeklyHours',
    block: 'parent',
    type: 'choice',
    question: 'Сколько времени в неделю готовы уделять развитию?',
    hint: 'Включая дорогу до занятий',
    options: [
      { value: '1-2 часа', label: '1–2 часа', icon: '🕐' },
      { value: '3-5 часов', label: '3–5 часов', icon: '🕒' },
      { value: '6-8 часов', label: '6–8 часов', icon: '🕕' },
      { value: 'больше 8 часов', label: 'Больше 8 часов', icon: '🕘' },
    ],
  },
  {
    id: 'priority',
    block: 'parent',
    type: 'choice',
    question: 'Что для вас важнее?',
    options: [
      { value: 'fun', label: 'Чтобы ребёнок получал удовольствие', icon: '😊', weights: { play: 2, art: 1 } },
      { value: 'achievements', label: 'Чтобы были достижения: грамоты, олимпиады', icon: '🏆', weights: { structure: 2, precision: 2 } },
      { value: 'profession', label: 'Чтобы пригодилось для будущей профессии', icon: '💼', weights: { tech: 2, logic: 2, digital: 1 } },
    ],
  },
  {
    id: 'concern',
    block: 'parent',
    type: 'choice',
    question: 'Что вас сейчас беспокоит больше всего?',
    options: [
      { value: 'unmotivated', label: 'Ничего не хочет, трудно увлечь', icon: '😐', weights: { play: 2, social: 1 } },
      { value: 'jumping', label: 'Перескакивает с кружка на кружок', icon: '🔀', weights: { structure: 2 } },
      { value: 'unknown', label: 'Не знаю, где его талант', icon: '🔍', weights: {} },
      { value: 'nothing', label: 'Ничего, просто ищем направление', icon: '🧭', weights: {} },
    ],
  },
  {
    id: 'city',
    block: 'parent',
    type: 'city',
    question: 'В каком городе вы живёте?',
    hint: 'Чтобы подобрать кружки и мастер-классы рядом с вами',
    placeholder: 'Начните вводить название города',
  },

  // ----------------------------------------------------------------- CHILD
  {
    id: 'picture',
    block: 'child',
    type: 'choice',
    question: 'Какая картинка тебе нравится больше?',
    options: [
      { value: 'paint', label: 'Краски и кисти', icon: '🎨', weights: { art: 3, visual: 2 } },
      { value: 'computer', label: 'Компьютер', icon: '🖥️', weights: { digital: 3, logic: 1 } },
      { value: 'draft', label: 'Чертёж', icon: '📐', weights: { precision: 3, structure: 2 } },
      { value: 'bricks', label: 'Стройка и кирпичи', icon: '🧱', weights: { hands: 3, structure: 2 } },
    ],
  },
  {
    id: 'makeWithHands',
    block: 'child',
    type: 'choice',
    question: 'Что бы ты хотел сделать своими руками?',
    options: [
      { value: 'clay', label: 'Слепить фигурку из глины', icon: '🏺', weights: { hands: 3, art: 2 } },
      { value: 'drawing', label: 'Нарисовать крутой рисунок', icon: '✏️', weights: { art: 3, visual: 2 } },
      { value: 'model', label: 'Собрать модель самолёта или машинки', icon: '✈️', weights: { hands: 2, structure: 3, tech: 2 } },
      { value: 'character', label: 'Создать персонажа для игры', icon: '🎮', weights: { digital: 3, play: 2, art: 2 } },
    ],
  },
  {
    id: 'fearSoftware',
    block: 'child',
    type: 'choice',
    question: 'Тебе страшно, когда говорят «сложная программа на компьютере»?',
    options: [
      { value: 'yes', label: 'Да, лучше рисовать ручкой', icon: '✍️', weights: { hands: 3, art: 2, digital: -3 } },
      { value: 'little', label: 'Немного страшно, но интересно', icon: '🙂', weights: { digital: 1 } },
      { value: 'no', label: 'Нет, я быстро разбираюсь', icon: '😎', weights: { digital: 3, logic: 2, tech: 1 } },
    ],
  },
  {
    id: 'orderOrFreedom',
    block: 'child',
    type: 'choice',
    question: 'Тебе больше нравится, когда всё по линеечке или когда можно творить свободно?',
    options: [
      { value: 'order', label: 'Люблю порядок и точность', icon: '📏', weights: { precision: 3, structure: 2, logic: 1 } },
      { value: 'freedom', label: 'Люблю свободу и яркие цвета', icon: '🌈', weights: { art: 3, visual: 2, play: 1 } },
      { value: 'both', label: 'И то, и другое', icon: '⚖️', weights: { structure: 1, art: 1 } },
    ],
  },
  {
    id: 'dailyTime',
    block: 'child',
    type: 'choice',
    question: 'Сколько времени ты готов заниматься каждый день?',
    options: [
      { value: '15m', label: '15 минут', icon: '⏱️' },
      { value: '30m', label: '30 минут', icon: '⏲️' },
      { value: '1h', label: 'Часик', icon: '🕐' },
      { value: 'more', label: 'Могу и больше!', icon: '🔥' },
    ],
  },
];

const AGE_RANGE_TO_NUMBER = { '3-6': 5, '7-10': 9, '11-14': 12, '15-18': 16 };

/** Public shape sent to the client — weights stay server-side. */
function publicQuestions() {
  return QUESTIONS.map((q) => ({
    id: q.id,
    block: q.block,
    type: q.type,
    question: q.question,
    hint: q.hint,
    placeholder: q.placeholder,
    options: q.options ? q.options.map(({ value, label, icon }) => ({ value, label, icon })) : undefined,
  }));
}

module.exports = { QUESTIONS, AGE_RANGE_TO_NUMBER, publicQuestions };
