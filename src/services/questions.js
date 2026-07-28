'use strict';

/**
 * Первичная диагностика: 12 вопросов (7 о ребёнке, 5 игровых) — по ТЗ 3.2.
 *
 * Единственный источник правды: клиент забирает набор через
 * GET /api/diagnostics/questions, сервер по нему же валидирует присланные
 * ответы и считает оценку. Разъехаться они не могут.
 *
 * Что важно в устройстве набора:
 *  - `weights` переводит ответ в веса по признакам интересов; на них работает
 *    движок подбора (services/recommend.js) и они никогда не уходят клиенту;
 *  - `multi` разрешает выбрать несколько вариантов (ТЗ прямо просит «выберите
 *    1–2» на вопросе о занятиях). Вклад такого вопроса делится на число
 *    выбранных ответов, иначе он перевешивал бы остальные;
 *  - `questionSelf` — та же формулировка на «ты», для подростка, который
 *    проходит тест сам;
 *  - вопросы про возраст, время и город весов не несут: они влияют на
 *    возрастные ограничения и подбор кружков, а не на профиль интересов.
 *
 * Словарь признаков (15):
 *   art        творчество, рисование
 *   visual     визуальное мышление, композиция
 *   hands      работа руками, материалы
 *   digital    компьютер как инструмент
 *   logic      логика, алгоритмы
 *   structure  системность, порядок, план
 *   precision  точность, аккуратность
 *   tech       техника, механизмы, электроника
 *   play       игровой интерес
 *   social     общение, аудитория
 *   audio      звук и музыка
 *   science    наука, эксперимент
 *   abstract   абстрактное мышление, данные
 *   words      истории, тексты, сценарии
 *   nature     живое, биология
 */

const QUESTIONS = [
  // ──────────────────────────────────────────────────────────────── БЛОК 1
  {
    id: 'age',
    block: 'parent',
    type: 'choice',
    question: 'Сколько лет ребёнку?',
    questionSelf: 'Сколько тебе лет?',
    hint: 'От возраста зависит стартовая сложность направления',
    options: [
      { value: '3-6', label: '3–6 лет', icon: '🧸' },
      { value: '7-8', label: '7–8 лет', icon: '🎒' },
      { value: '9-10', label: '9–10 лет', icon: '🛴' },
      { value: '11-12', label: '11–12 лет', icon: '🚀' },
      { value: '13-15', label: '13–15 лет', icon: '🎧' },
      { value: '16-18', label: '16–18 лет', icon: '🎓' },
    ],
  },
  {
    id: 'hobby',
    block: 'parent',
    type: 'choice',
    multi: true,
    maxChoices: 2,
    question: 'Чем ребёнок больше всего любит заниматься в свободное время?',
    questionSelf: 'Чем тебе больше всего нравится заниматься в свободное время?',
    hint: 'Можно выбрать до двух вариантов',
    options: [
      { value: 'draw', label: 'Рисовать, раскрашивать, лепить', icon: '🎨', weights: { art: 3, visual: 3, hands: 2 } },
      { value: 'games', label: 'Играть в компьютерные игры', icon: '🎮', weights: { digital: 3, play: 3, logic: 1 } },
      { value: 'build', label: 'Конструировать, собирать Lego', icon: '🧱', weights: { hands: 3, structure: 3, tech: 2 } },
      { value: 'tinker', label: 'Разбирать и чинить технику', icon: '🔧', weights: { tech: 3, hands: 2, logic: 2 } },
      { value: 'watch', label: 'Смотреть видео и блоги', icon: '📺', weights: { social: 2, visual: 2, play: 1 } },
      { value: 'music', label: 'Слушать или сочинять музыку', icon: '🎵', weights: { audio: 3, art: 2 } },
      { value: 'read', label: 'Читать и придумывать истории', icon: '📚', weights: { words: 3, abstract: 2, art: 1 } },
      { value: 'nature', label: 'Наблюдать за животными и природой', icon: '🌱', weights: { nature: 3, science: 2 } },
    ],
  },
  {
    id: 'clubs',
    block: 'parent',
    type: 'choice',
    multi: true,
    maxChoices: 3,
    question: 'Какие кружки ребёнок уже пробовал?',
    questionSelf: 'На какие кружки ты уже ходил?',
    hint: 'Отметьте всё, что было, — или «ничего не пробовали»',
    options: [
      { value: 'none', label: 'Ничего не пробовали', icon: '🌱', weights: {}, exclusive: true },
      { value: 'art', label: 'Рисование, художественная школа', icon: '🖌️', weights: { art: 2, visual: 2 } },
      { value: 'digital', label: 'Компьютерная графика, 3D', icon: '💻', weights: { digital: 3, visual: 1 } },
      { value: 'craft', label: 'Керамика, рукоделие, макеты', icon: '🏺', weights: { hands: 3, structure: 1 } },
      { value: 'robotics', label: 'Робототехника, электроника', icon: '🤖', weights: { tech: 3, logic: 2 } },
      { value: 'coding', label: 'Программирование', icon: '⌨️', weights: { logic: 3, digital: 2 } },
      { value: 'music', label: 'Музыка, вокал, звук', icon: '🎼', weights: { audio: 3 } },
      { value: 'sport', label: 'Спорт, танцы, театр', icon: '🤸', weights: { social: 2, play: 1 } },
    ],
  },
  {
    id: 'weeklyHours',
    block: 'parent',
    type: 'choice',
    question: 'Сколько времени в неделю готовы уделять развитию?',
    questionSelf: 'Сколько времени в неделю ты готов уделять занятиям?',
    hint: 'Включая дорогу до занятий',
    options: [
      { value: '1-2 часа', label: '1–2 часа', icon: '🕐' },
      { value: '3-5 часов', label: '3–5 часов', icon: '🕒' },
      { value: '6-8 часов', label: '6–8 часов', icon: '🕕' },
      { value: 'больше 8 часов', label: 'Больше 8 часов', icon: '🕘' },
      { value: 'пока не знаем', label: 'Пока не решили', icon: '🤔' },
    ],
  },
  {
    id: 'priority',
    block: 'parent',
    type: 'choice',
    question: 'Что для вас важнее всего?',
    questionSelf: 'Что для тебя важнее всего?',
    options: [
      { value: 'fun', label: 'Чтобы было интересно и в радость', icon: '😊', weights: { play: 2, art: 1 } },
      { value: 'achievements', label: 'Достижения: конкурсы, олимпиады', icon: '🏆', weights: { structure: 2, precision: 2 } },
      { value: 'profession', label: 'Задел на будущую профессию', icon: '💼', weights: { tech: 2, logic: 2, digital: 1 } },
      { value: 'confidence', label: 'Уверенность в себе', icon: '💪', weights: { social: 2, play: 1 } },
      { value: 'friends', label: 'Компания единомышленников', icon: '👥', weights: { social: 3 } },
    ],
  },
  {
    id: 'concern',
    block: 'parent',
    type: 'choice',
    question: 'Что сейчас беспокоит больше всего?',
    questionSelf: 'Что тебя сейчас беспокоит больше всего?',
    options: [
      { value: 'unmotivated', label: 'Ничем не удаётся увлечь', icon: '😐', weights: { play: 2, social: 1 } },
      { value: 'jumping', label: 'Перескакивает с кружка на кружок', icon: '🔀', weights: { structure: 2 } },
      { value: 'unknown', label: 'Не понимаем, где сильные стороны', icon: '🔍', weights: {} },
      { value: 'screens', label: 'Слишком много времени за экраном', icon: '📵', weights: { hands: 2, nature: 1, digital: -2 } },
      { value: 'nothing', label: 'Ничего, просто ищем направление', icon: '🧭', weights: {} },
    ],
  },
  {
    id: 'city',
    block: 'parent',
    type: 'city',
    question: 'В каком городе вы живёте?',
    questionSelf: 'В каком городе ты живёшь?',
    hint: 'Чтобы подобрать кружки и мастер-классы рядом',
    placeholder: 'Начните вводить название города',
  },

  // ──────────────────────────────────────────────────────────────── БЛОК 2
  {
    id: 'picture',
    block: 'child',
    type: 'choice',
    question: 'Какая картинка нравится тебе больше?',
    options: [
      { value: 'paint', label: 'Краски и кисти', icon: '🎨', weights: { art: 3, visual: 2 } },
      { value: 'computer', label: 'Экран с кодом', icon: '🖥️', weights: { digital: 3, logic: 2 } },
      { value: 'draft', label: 'Чертёж с линейкой', icon: '📐', weights: { precision: 3, structure: 2 } },
      { value: 'bricks', label: 'Детали и шестерёнки', icon: '⚙️', weights: { tech: 3, hands: 2 } },
      { value: 'stage', label: 'Микрофон и камера', icon: '🎤', weights: { social: 3, audio: 2, words: 1 } },
      { value: 'lab', label: 'Микроскоп и колбы', icon: '🔬', weights: { science: 3, nature: 2, precision: 1 } },
    ],
  },
  {
    id: 'makeWithHands',
    block: 'child',
    type: 'choice',
    multi: true,
    maxChoices: 2,
    question: 'Что бы ты хотел сделать сам?',
    hint: 'Можно выбрать до двух вариантов',
    options: [
      { value: 'clay', label: 'Слепить фигурку', icon: '🏺', weights: { hands: 3, art: 2 } },
      { value: 'drawing', label: 'Нарисовать крутой рисунок', icon: '✏️', weights: { art: 3, visual: 2 } },
      { value: 'model', label: 'Собрать модель самолёта', icon: '✈️', weights: { hands: 2, structure: 3, tech: 2 } },
      { value: 'character', label: 'Придумать персонажа для игры', icon: '🕹️', weights: { digital: 3, play: 2, art: 2 } },
      { value: 'robot', label: 'Собрать робота, который ездит', icon: '🤖', weights: { tech: 3, logic: 2, hands: 2 } },
      { value: 'video', label: 'Снять и смонтировать видео', icon: '🎬', weights: { visual: 3, social: 2, words: 2 } },
      { value: 'song', label: 'Записать свой трек', icon: '🎧', weights: { audio: 3, art: 1 } },
      { value: 'site', label: 'Сделать свой сайт или приложение', icon: '🌐', weights: { digital: 3, logic: 3, structure: 1 } },
    ],
  },
  {
    id: 'fearSoftware',
    block: 'child',
    type: 'choice',
    question: 'Что ты чувствуешь, когда слышишь «сложная программа на компьютере»?',
    options: [
      { value: 'yes', label: 'Лучше буду рисовать руками', icon: '✍️', weights: { hands: 3, art: 2, digital: -3 } },
      { value: 'little', label: 'Немного страшно, но интересно', icon: '🙂', weights: { digital: 1 } },
      { value: 'no', label: 'Разберусь, мне не сложно', icon: '😎', weights: { digital: 3, logic: 2, tech: 1 } },
      { value: 'love', label: 'Обожаю разбираться в программах', icon: '🚀', weights: { digital: 4, logic: 3, abstract: 2 } },
    ],
  },
  {
    id: 'orderOrFreedom',
    block: 'child',
    type: 'choice',
    question: 'Как тебе удобнее работать?',
    options: [
      { value: 'order', label: 'Всё по плану и по линеечке', icon: '📏', weights: { precision: 3, structure: 3 } },
      { value: 'freedom', label: 'Свободно, как придумается', icon: '🌈', weights: { art: 3, visual: 2, play: 1 } },
      { value: 'both', label: 'Смотря что делаю', icon: '⚖️', weights: { structure: 1, art: 1 } },
      { value: 'team', label: 'Вместе с кем-то, в команде', icon: '🤝', weights: { social: 3, play: 1 } },
      { value: 'alone', label: 'Один, чтобы никто не отвлекал', icon: '🎯', weights: { abstract: 2, logic: 2, precision: 1 } },
    ],
  },
  {
    id: 'dailyTime',
    block: 'child',
    type: 'choice',
    question: 'Сколько времени готов заниматься каждый день?',
    options: [
      { value: '15m', label: '15 минут', icon: '⏱️' },
      { value: '30m', label: '30 минут', icon: '⏲️' },
      { value: '1h', label: 'Около часа', icon: '🕐' },
      { value: '2h', label: 'Пару часов', icon: '🔥' },
      { value: 'more', label: 'Могу и больше', icon: '🌟' },
    ],
  },
];

/** Середина возрастного диапазона — для возрастных ограничений направлений. */
const AGE_RANGE_TO_NUMBER = {
  '3-6': 5,
  '7-8': 7,
  '9-10': 9,
  '11-12': 11,
  '13-15': 14,
  '16-18': 17,
};

/** Публичная форма для клиента — веса остаются на сервере. */
function publicQuestions() {
  return QUESTIONS.map((q) => ({
    id: q.id,
    block: q.block,
    type: q.type,
    multi: q.multi || false,
    maxChoices: q.maxChoices || 1,
    question: q.question,
    questionSelf: q.questionSelf,
    hint: q.hint,
    placeholder: q.placeholder,
    options: q.options
      ? q.options.map(({ value, label, icon, exclusive }) => ({ value, label, icon, exclusive: exclusive || false }))
      : undefined,
  }));
}

const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

module.exports = { QUESTIONS, QUESTION_BY_ID, AGE_RANGE_TO_NUMBER, publicQuestions };
