'use strict';

const config = require('../config');

/**
 * AI layer with a genuinely useful offline mode.
 *
 * The product must work with no API key at all, so every capability has a
 * deterministic implementation that is good enough to ship. When a key IS
 * configured we call an OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter,
 * a local server — anything speaking /chat/completions) and fall back to the
 * offline path on any error or timeout. No hard dependency on a vendor SDK.
 */

const enabled = () => config.ai.enabled;

async function chat(messages, { maxTokens = 300, temperature = 0.7, json = false } = {}) {
  if (!enabled()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const res = await fetch(`${config.ai.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('[ai] upstream returned', res.status, '— using offline mode');
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content.trim() : null;
  } catch (err) {
    console.warn('[ai] request failed (%s) — using offline mode', err.name === 'AbortError' ? 'timeout' : err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- utilities

const pick = (arr, seed) => arr[Math.abs(hash(String(seed))) % arr.length];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

// ------------------------------------------------------------- AI tutor chat

const TUTOR_TOPICS = [
  {
    match: /(цвет|палитр|оттенок|раскра)/i,
    replies: [
      'Классный вопрос про цвет! 🎨 Попробуй правило трёх: один основной цвет, один дополнительный и один яркий акцент. Так рисунок сразу выглядит собранным.',
      'С цветом есть простой приём: возьми два соседних цвета радуги и добавь один противоположный для акцента. Получится живо, но не пёстро. 🌈',
    ],
  },
  {
    match: /(перспектив|объём|объем|глубин)/i,
    replies: [
      'Чтобы появился объём, начни с одной точки схода на линии горизонта и веди к ней все уходящие линии. Даже простая коробка сразу станет трёхмерной! 📦',
      'Секрет глубины — размер и контраст: то, что ближе, рисуем крупнее и контрастнее, дальнее — мельче и бледнее. Попробуй на двух деревьях. 🌳',
    ],
  },
  {
    match: /(3d|блендер|blender|модел)/i,
    replies: [
      'В 3D начни с простых форм: куб, сфера, цилиндр. Почти любой предмет — это их комбинация. Собери из них настольную лампу, это отличное первое задание! 💡',
      'Совет по 3D: не гонись за деталями сразу. Сначала силуэт — если он читается издалека, модель уже хорошая. 🎯',
    ],
  },
  {
    match: /(код|программ|python|javascript|скрипт|алгоритм)/i,
    replies: [
      'В программировании работает правило маленьких шагов: раздели задачу на части и проверяй каждую отдельно. Так ошибку найти в разы легче. 🧩',
      'Если код не работает — выведи промежуточные значения на экран. Half of debugging is just looking! Посмотри, что реально приходит в переменную. 🔍',
    ],
  },
  {
    match: /(робот|arduino|ардуино|датчик|схем)/i,
    replies: [
      'С роботами начни с одного датчика и одного мотора. Когда связка «увидел — среагировал» заработает, дальше всё наращивается легко. 🤖',
      'Совет для схем: всегда проверяй питание и «землю» первыми. 90% неработающих схем — это отошедший провод, а не сложная поломка. ⚡',
    ],
  },
  {
    match: /(звук|музык|бит|аудио)/i,
    replies: [
      'В музыке начни с ритма: четыре удара в такте — основа почти всего. Сначала ритм, потом бас, и только потом мелодия. 🥁',
      'Секрет чистого звука — паузы. Убери всё лишнее, и оставшееся зазвучит намного сильнее. 🎧',
    ],
  },
  {
    match: /(видео|монтаж|снима|камер|блог)/i,
    replies: [
      'В видео главное — первые три секунды. Начни с самого интересного кадра, а объяснения дай потом. 🎬',
      'Свет важнее камеры! Посади героя лицом к окну — и картинка станет лучше, чем на дорогой технике в темноте. 💡',
    ],
  },
  {
    match: /(не получ|сложно|трудно|не могу|устал|скучн)/i,
    replies: [
      'Так бывает у всех, и это нормально! 💪 Раздели задачу на самый маленький кусочек, который точно получится, и сделай только его. Один шаг сегодня — уже победа.',
      'Когда не идёт — сделай паузу на 15 минут и вернись. Мозг продолжает решать задачу в фоне, это правда работает! 🌟',
    ],
  },
  {
    match: /(что дальше|следующ|куда|с чего нача)/i,
    replies: [
      'Посмотри на свою карту: жёлтая пульсирующая звезда — это твой следующий шаг. Открой её, там уже подобраны кружок, курс и программа. ⭐',
      'Лучший следующий шаг — тот, что горит жёлтым на карте. Начни с раздела «ИТ-инструмент», обычно это самое быстрое первое действие. 🚀',
    ],
  },
  {
    match: /(привет|здравств|хай|ку)/i,
    replies: [
      'Привет! 👋 Рад тебя видеть. Расскажи, над чем сейчас работаешь, или спроси о любом навыке с твоей карты!',
      'Привет-привет! 🌟 Чем займёмся: разберём следующую звезду или обсудим твою работу?',
    ],
  },
];

const TUTOR_FALLBACK = [
  'Интересно! 🌟 Расскажи чуть подробнее — что именно хочется понять? Я помогу разобрать по шагам.',
  'Хороший вопрос! 🚀 Давай зайдём с практики: попробуй сделать самую простую версию, а потом улучшим её вместе.',
  'Отличная тема! 💡 Могу подсказать по рисованию, 3D, коду, роботам, звуку или видео — что из этого ближе к твоему вопросу?',
];

async function tutorReply(messages, context = {}) {
  const last = [...(messages || [])].reverse().find((m) => m.role === 'user');
  const question = last?.content || '';
  const name = context.name || 'друг';
  const done = context.completedCount || 0;

  if (enabled()) {
    const reply = await chat(
      [
        {
          role: 'system',
          content: `Ты добрый и весёлый ИИ-наставник по творчеству и технологиям для ребёнка по имени ${name} (возраст ${context.age || 'неизвестен'}). Он уже освоил ${done} навыков на звёздной карте. Отвечай по-русски, коротко (2–4 предложения), понятно ребёнку, с уместными эмодзи. Хвали за успехи и давай один конкретный практический совет.`,
        },
        ...messages.slice(-8),
      ],
      { maxTokens: 250 }
    );
    if (reply) return reply;
  }

  const topic = TUTOR_TOPICS.find((t) => t.match.test(question));
  const base = topic ? pick(topic.replies, question) : pick(TUTOR_FALLBACK, question);

  // Occasionally acknowledge progress so the tutor feels aware of the child.
  if (done > 0 && hash(question) % 3 === 0) {
    return `${base}\n\nКстати, у тебя уже ${done} ${plural(done, 'звезда', 'звезды', 'звёзд')} на карте — отличный темп! ⭐`;
  }
  return base;
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// ------------------------------------------------------- portfolio critique

const PRAISE_OPENERS = [
  'Отличная работа',
  'Здорово получилось',
  'Очень интересный результат',
  'Классная работа',
  'Молодец',
];

const PRAISE_BODIES = [
  'видно, что ты продумал композицию и не побоялся довести идею до конца.',
  'заметно, сколько внимания ты уделил деталям — это как раз то, что отличает хорошую работу.',
  'идея читается сразу, а это самое сложное в творческой работе.',
  'ты явно не остановился на первом варианте, и это чувствуется в результате.',
  'аккуратность исполнения на высоте, продолжай в том же духе.',
];

const NEXT_STEPS = [
  'В следующий раз попробуй поиграть с контрастом — сделай главный элемент заметно ярче остальных.',
  'Как идея для развития: попробуй тот же сюжет, но в другой цветовой гамме, и сравни, что выразительнее.',
  'Следующий шаг — добавить деталь второго плана, чтобы работа стала объёмнее.',
  'Попробуй показать работу кому-то и спросить, что считывается первым. Это очень помогает расти.',
  'Сохрани эту работу — через несколько звёзд будет здорово сравнить и увидеть свой прогресс.',
];

async function critiquePortfolio({ title = '', comment = '', starName = '' } = {}) {
  if (enabled()) {
    const reply = await chat(
      [
        {
          role: 'system',
          content:
            'Ты дружелюбный преподаватель в детской школе дизайна. Отвечай по-русски, 2–3 предложения. Похвали конкретно, отметь одну сильную сторону и дай один мягкий совет на будущее. Без формальностей, тепло и по делу.',
        },
        {
          role: 'user',
          content: `Навык: «${starName}». Название работы: «${title}». Комментарий ученика: «${comment || 'без комментария'}».`,
        },
      ],
      { maxTokens: 180 }
    );
    if (reply) return { feedback: reply, byModel: true };
  }

  const seed = `${title}|${comment}|${starName}`;
  const feedback = `${pick(PRAISE_OPENERS, seed)}! «${title}» — ${pick(PRAISE_BODIES, seed + 'b')} ${pick(NEXT_STEPS, seed + 'c')}`;
  return { feedback, byModel: false };
}

// ------------------------------------------------------ diagnostics summary

async function summariseDiagnostics({ name, age, city, weeklyHours, topConstellations = [], profileText = '' }) {
  const names = topConstellations.map((c) => `«${c.name}»`).join(', ');

  if (enabled()) {
    const reply = await chat(
      [
        {
          role: 'system',
          content:
            'Ты профориентолог для детей. По-русски, 3–4 предложения, тепло и конкретно. Обратись к родителю, объясни, почему выбраны эти направления и что делать на первой неделе. Без списков и заголовков.',
        },
        {
          role: 'user',
          content: `Ребёнок: ${name}, ${age} лет, город ${city}, готовы уделять ${weeklyHours} в неделю. Профиль: ${profileText}. Рекомендованные направления: ${names}.`,
        },
      ],
      { maxTokens: 260 }
    );
    if (reply) return reply;
  }

  const first = topConstellations[0];
  const rest = topConstellations.slice(1);
  const restText = rest.length
    ? ` Рядом открыты ${rest.map((c) => `«${c.name}»`).join(' и ')} — если основное направление не увлечёт, попробовать соседнее можно без потери прогресса.`
    : '';

  // `profileText` is rendered separately by the client, so the summary must not
  // repeat it — otherwise the result screen says the same sentence twice.
  return (
    `Судя по ответам, лучше всего подойдёт направление «${first?.name || 'Компьютерная графика'}»: ` +
    `оно совпадает с тем, что ребёнку уже нравится делать, и не требует резкого скачка в сложности.${restText} ` +
    `Начните с первой звезды на карте — там уже подобраны кружок в вашем городе (${city}), онлайн-курс и бесплатная программа. ` +
    `При ${weeklyHours} в неделю на первый шаг обычно уходит одна-две недели.`
  );
}

module.exports = { enabled, chat, tutorReply, critiquePortfolio, summariseDiagnostics, plural };
