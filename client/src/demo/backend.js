import { getState, save, nextId, graph, snapshot, resetDemo } from './store';
import { pickRecommended, describeProfile, validateAnswers } from './generated/recommend.js';
import { computeAvailability, currentStarId } from '../lib/graph';

/**
 * In-browser stand-in for the Express API, used only by the GitHub Pages demo.
 *
 * Every route mirrors the real server's response shape so the React app needs
 * no demo-specific branches — the only difference is where the data comes from.
 * The recommendation engine is the *generated copy of the real one*, so the
 * personalised map a visitor gets here matches what the deployed product would
 * produce for the same answers.
 */

const XP_PER_STAR = 50;
const TRIAL_LIMIT = 3;

/**
 * Mirrors the server: a cosmetic is "pro only" when its price exceeds the total
 * XP a trial account can ever earn (TRIAL_LIMIT × XP_PER_STAR = 150). The demo
 * user carries `subscription`, not `subscription_status`.
 */
function isProOnly(user, item) {
  return user.subscription !== 'pro' && item.price > TRIAL_LIMIT * XP_PER_STAR;
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.payload = { error: message, ...(details && details.length ? { details } : {}) };
  }
}

const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

function ruDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ------------------------------------------------------------- helpers */

const publicUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    email: u.email,
    age: u.age ?? null,
    city: u.city ?? null,
    weeklyHours: u.weeklyHours ?? null,
    role: u.role || 'parent',
    avatar: null,
    xp: u.xp || 0,
    subscription: u.subscription || 'trial',
    recommendedGraphId: u.recommendedGraphs?.[0] ?? null,
    recommendedGraphs: u.recommendedGraphs || [],
    equipped: u.equipped || { avatar: null, frame: null, title: null },
    isAdmin: Boolean(u.isAdmin),
    onboarded: Boolean(u.onboarded),
    hasPin: Boolean(u.pin),
  };

const publicWork = (w) => ({
  id: w.id,
  title: w.title,
  starId: w.starId,
  image: w.image,
  comment: w.comment,
  verifiedByAi: w.verifiedByAi,
  aiFeedback: w.aiFeedback,
  createdAt: w.createdAt,
  date: ruDate(w.createdAt),
});

const publicLog = (l) => ({ id: l.id, text: l.text, createdAt: l.createdAt, date: ruDate(l.createdAt) });

function token(userId) {
  return `demo.${userId}.${Math.random().toString(36).slice(2)}`;
}

function userFromToken(auth) {
  if (!auth) return null;
  const raw = String(auth).replace(/^Bearer\s+/i, '');
  const id = Number(raw.split('.')[1]);
  if (!Number.isFinite(id)) return null;
  return getState().users.find((u) => u.id === id) || null;
}

function requireUser(ctx) {
  const user = userFromToken(ctx.headers.Authorization || ctx.headers.authorization);
  if (!user) throw new HttpError(401, 'Требуется вход в систему');
  return user;
}

function requireAdmin(ctx) {
  const user = requireUser(ctx);
  if (!user.isAdmin) throw new HttpError(403, 'Доступ только для администратора');
  return user;
}

function logFor(userId, text) {
  const s = getState();
  s.logs.push({ id: nextId(), userId, text, createdAt: new Date().toISOString() });
}

function progressOf(userId) {
  return getState().progress.filter((p) => p.userId === userId).map((p) => p.starId);
}

const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const calendarDaysBetween = (from, to) => Math.max(0, Math.round((startOfDay(to) - startOfDay(from)) / 86400000));

/** Темп занятий: сколько шагов закрыто за неделю/месяц и когда была активность. */
function pace(userId) {
  const logs = getState().logs.filter((l) => l.userId === userId);
  const now = Date.now();
  const at = (l) => Date.parse(l.createdAt);
  const steps = logs.filter((l) => /шаг/i.test(l.text || '')).map(at).filter(Number.isFinite);
  const times = logs.map(at).filter(Number.isFinite);
  const within = (days) => steps.filter((t) => t >= now - days * 86400000).length;
  return {
    pace: { month: within(30), week: within(7) },
    // Календарные дни, а не сутки по 24 часа: вечернее занятие вчера должно
    // читаться как «вчера», а не «сегодня».
    daysSinceActivity: times.length ? calendarDaysBetween(Math.max(...times), now) : null,
  };
}

function logsOf(userId) {
  return getState()
    .logs.filter((l) => l.userId === userId)
    .sort((a, b) => b.id - a.id)
    .slice(0, 100)
    .map(publicLog);
}

function visibleFor(user, constellations) {
  const rec = user.recommendedGraphs || [];
  return rec.length ? rec : constellations.map((c) => c.id);
}

/* ------------------------------------------------------- offline tutor */

const TUTOR = [
  [/(цвет|палитр|оттенок)/i, 'Классный вопрос про цвет! 🎨 Попробуй правило трёх: один основной цвет, один дополнительный и один яркий акцент. Так рисунок сразу выглядит собранным.'],
  [/(перспектив|объём|объем|глубин)/i, 'Чтобы появился объём, начни с одной точки схода на линии горизонта и веди к ней все уходящие линии. Даже простая коробка станет трёхмерной! 📦'],
  [/(3d|блендер|blender|модел)/i, 'В 3D начни с простых форм: куб, сфера, цилиндр. Почти любой предмет — их комбинация. Собери из них настольную лампу. 💡'],
  [/(код|программ|python|javascript|алгоритм)/i, 'В программировании работает правило маленьких шагов: раздели задачу на части и проверяй каждую отдельно. Так ошибку найти в разы легче. 🧩'],
  [/(робот|arduino|ардуино|датчик|схем)/i, 'С роботами начни с одного датчика и одного мотора. Когда связка «увидел — среагировал» заработает, дальше всё наращивается легко. 🤖'],
  [/(звук|музык|бит|аудио)/i, 'В музыке начни с ритма: четыре удара в такте — основа почти всего. Сначала ритм, потом бас, и только потом мелодия. 🥁'],
  [/(видео|монтаж|снима|камер|блог)/i, 'В видео главное — первые три секунды. Начни с самого интересного кадра, объяснения дай потом. 🎬'],
  [/(не получ|сложно|трудно|не могу|устал|скучн)/i, 'Так бывает у всех, и это нормально! 💪 Раздели задачу на самый маленький кусочек, который точно получится, и сделай только его.'],
  [/(что дальше|следующ|куда|с чего нача)/i, 'Посмотри на свою карту: жёлтая пульсирующая звезда — твой следующий шаг. Открой её, там уже подобраны кружок, курс и программа. ⭐'],
  [/(привет|здравств|хай)/i, 'Привет! 👋 Рад тебя видеть. Расскажи, над чем сейчас работаешь, или спроси о любом навыке с карты!'],
];

const TUTOR_FALLBACK = [
  'Интересно! 🌟 Расскажи чуть подробнее — что именно хочется понять? Помогу разобрать по шагам.',
  'Хороший вопрос! 🚀 Давай зайдём с практики: попробуй сделать самую простую версию, а потом улучшим её вместе.',
  'Отличная тема! 💡 Могу подсказать по рисованию, 3D, коду, роботам, звуку или видео — что ближе к твоему вопросу?',
];

const PRAISE = ['Отличная работа', 'Здорово получилось', 'Очень интересный результат', 'Классная работа'];
const BODIES = [
  'видно, что ты продумал композицию и довёл идею до конца.',
  'заметно, сколько внимания ты уделил деталям — это отличает хорошую работу.',
  'идея читается сразу, а это самое сложное в творческой работе.',
];
const NEXT_STEPS = [
  'В следующий раз попробуй поиграть с контрастом — сделай главный элемент заметно ярче остальных.',
  'Как идея для развития: тот же сюжет в другой цветовой гамме, и сравни, что выразительнее.',
  'Сохрани эту работу — через несколько звёзд будет здорово сравнить и увидеть прогресс.',
];

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
const pick = (arr, seed) => arr[Math.abs(hash(seed)) % arr.length];

/* ------------------------------------------------------------- routes */

const routes = [
  // ───────────────────────────────────────────────────────────── auth
  ['POST', /^\/auth\/register$/, (ctx) => {
    const { name, email, password, role = 'parent', age, city } = ctx.body;
    if (!name || String(name).trim().length < 2) throw new HttpError(400, 'Имя должно быть не короче 2 символов');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Некорректный email');
    if (!password || password.length < 8) throw new HttpError(400, 'Пароль должен быть не короче 8 символов');

    const s = getState();
    if (s.users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
      throw new HttpError(409, 'Этот email уже зарегистрирован');
    }

    const user = {
      id: nextId(),
      name: String(name).trim(),
      email: String(email).toLowerCase(),
      password,
      age: age ? Number(age) : null,
      city: city || null,
      weeklyHours: null,
      role,
      xp: 0,
      subscription: 'trial',
      recommendedGraphs: [],
      equipped: { avatar: null, frame: null, title: null },
      isAdmin: false,
      onboarded: false,
      pin: null,
      createdAt: new Date().toISOString(),
    };
    s.users.push(user);
    save();
    return { status: 201, data: { token: token(user.id), user: publicUser(user) } };
  }],

  ['POST', /^\/auth\/login$/, (ctx) => {
    const { email, password } = ctx.body;
    const user = getState().users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
    if (!user || user.password !== password) throw new HttpError(400, 'Неверный email или пароль');
    return { data: { token: token(user.id), user: publicUser(user) } };
  }],

  ['GET', /^\/auth\/me$/, (ctx) => ({ data: { user: publicUser(requireUser(ctx)) } })],

  ['POST', /^\/auth\/change-password$/, (ctx) => {
    const user = requireUser(ctx);
    const { currentPassword, newPassword } = ctx.body;
    if (user.password !== currentPassword) throw new HttpError(400, 'Текущий пароль указан неверно');
    if (!newPassword || newPassword.length < 8) throw new HttpError(400, 'Пароль должен быть не короче 8 символов');
    if (newPassword === currentPassword) throw new HttpError(400, 'Новый пароль должен отличаться от текущего');
    user.password = newPassword;
    save();
    return { data: { success: true, token: token(user.id) } };
  }],

  // ──────────────────────────────────────────────────────── app state
  ['GET', /^\/app-state$/, (ctx) => {
    const user = requireUser(ctx);
    const g = graph();
    const completed = progressOf(user.id);
    const visible = visibleFor(user, g.constellations);
    const owned = getState().purchases.filter((p) => p.userId === user.id);

    return {
      data: {
        user: publicUser(user),
        completedStars: completed,
        currentStarId: currentStarId(g.stars, g.edges, completed, visible),
        constellations: g.constellations,
        stars: g.stars,
        edges: g.edges,
        resources: g.resources,
        portfolio: getState().portfolio.filter((w) => w.userId === user.id).sort((a, b) => b.id - a.id).map(publicWork),
        historyLogs: logsOf(user.id),
        purchases: owned
          .map((p) => snapshot.storeItems.find((i) => i.id === p.itemId))
          .filter(Boolean)
          .map((i) => ({ id: i.id, code: i.code, type: i.type, payload: i.payload, title: i.title })),
        totals: { stars: g.stars.length, completed: completed.length, constellations: g.constellations.length },
      },
    };
  }],

  ['GET', /^\/app-state\/summary$/, (ctx) => {
    // Темп занятий считаем здесь, а не в компоненте: обращение к часам во
    // время рендера — нечистая операция, React 19 её запрещает.
    const user = requireUser(ctx);
    const g = graph();
    const unlocked = visibleFor(user, g.constellations);
    const scope = new Set(g.stars.filter((s) => unlocked.includes(s.constellationId)).map((s) => s.id));
    const completedAll = progressOf(user.id);
    const completed = completedAll.filter((id) => scope.has(id)).length;

    return {
      data: {
        completed,
        total: scope.size,
        percent: scope.size ? Math.round((completed / scope.size) * 100) : 0,
        works: getState().portfolio.filter((w) => w.userId === user.id).length,
        xp: user.xp,
        xpEarned: completedAll.length * XP_PER_STAR,
        catalogueTotal: g.stars.length,
        ...pace(user.id),
      },
    };
  }],

  // ────────────────────────────────────────────────────── diagnostics
  ['GET', /^\/diagnostics\/questions$/, () => ({ data: { questions: snapshot.questions } })],

  ['GET', /^\/diagnostics\/cities$/, (ctx) => {
    const q = String(ctx.query.q || '').trim().toLowerCase();
    const all = getState().cities;
    if (!q) return { data: { cities: all.slice(0, 8) } };
    const matches = all
      .map((name) => ({ name, at: name.toLowerCase().indexOf(q) }))
      .filter((m) => m.at !== -1)
      .sort((a, b) => (a.at === 0 ? -1 : 0) - (b.at === 0 ? -1 : 0))
      .slice(0, 8)
      .map((m) => m.name);
    return { data: { cities: matches } };
  }],

  ['POST', /^\/diagnostics\/submit$/, (ctx) => {
    const user = requireUser(ctx);

    // Та же проверка, что и на сервере: неизвестные вопросы, выдуманные
    // варианты и превышение лимита множественного выбора отсекаются здесь.
    const validation = validateAnswers(ctx.body.answers);
    if (!validation.ok) {
      throw new HttpError(400, 'Проверьте ответы диагностики', validation.errors);
    }
    const answers = validation.answers;
    const g = graph();

    const { ids, chosen, highlights, confidence, answeredCount } = pickRecommended(answers, g.constellations);
    const name = ctx.body.childName || user.name;
    const ageMap = { '3-6': 5, '7-8': 7, '9-10': 9, '11-12': 11, '13-15': 14, '16-18': 17 };

    user.name = name;
    user.age = ageMap[answers.age] ?? user.age ?? 10;
    user.city = (answers.city || '').trim() || user.city || 'Москва';
    user.weeklyHours =
      answers.weeklyHours && answers.weeklyHours !== 'пока не знаем'
        ? answers.weeklyHours
        : user.weeklyHours || '3-5 часов';
    user.recommendedGraphs = ids;
    user.onboarded = true;

    getState().diagnostics.push({ userId: user.id, answers, createdAt: new Date().toISOString() });
    logFor(user.id, 'Пройдена диагностика интересов — построена персональная карта.');
    save();

    const profileText = describeProfile(answers, { name });
    const first = chosen[0];
    const rest = chosen.slice(1);
    const restText = rest.length
      ? ` Рядом открыты ${rest.map((c) => `«${c.name}»`).join(' и ')} — если основное направление не увлечёт, попробовать соседнее можно без потери прогресса.`
      : '';

    return {
      data: {
        success: true,
        user: publicUser(user),
        profileText,
        highlights,
        confidence,
        answeredCount,
        summary:
          `Судя по ответам, лучше всего подойдёт направление «${first?.name || 'Компьютерная графика'}»: ` +
          `оно совпадает с тем, что ребёнку уже нравится делать, и не требует резкого скачка в сложности.${restText} ` +
          `Начните с первой звезды на карте — там уже подобраны кружок в вашем городе (${user.city}), онлайн-курс и бесплатная программа. ` +
          `При ${user.weeklyHours} в неделю на первый шаг обычно уходит одна-две недели.`,
        recommended: chosen.map((c) => ({
          ...c,
          reason: c.reason,
          match: c.match,
          weak: c.weak,
          tooYoung: c.tooYoung,
          minAge: c.minAge,
        })),
      },
    };
  }],

  ['GET', /^\/diagnostics\/result$/, (ctx) => {
    const user = requireUser(ctx);
    const row = [...getState().diagnostics].reverse().find((d) => d.userId === user.id);
    return { data: { result: row ? { answers: row.answers, profile: {}, createdAt: row.createdAt } : null } };
  }],

  // ───────────────────────────────────────────────────────── progress
  ['POST', /^\/progress\/complete$/, (ctx) => {
    const user = requireUser(ctx);
    const starId = Number(ctx.body.starId);
    const g = graph();
    const star = g.stars.find((s) => s.id === starId);
    if (!star) throw new HttpError(404, 'Навык не найден');

    const completed = progressOf(user.id);
    if (completed.includes(starId)) throw new HttpError(409, 'Этот навык уже отмечен как пройденный');

    const visible = visibleFor(user, g.constellations);
    if (!computeAvailability(g.stars, g.edges, completed, visible).has(starId)) {
      throw new HttpError(400, 'Сначала нужно пройти предыдущие навыки этого созвездия');
    }
    if (user.subscription !== 'pro' && completed.length >= TRIAL_LIMIT) {
      throw new HttpError(402, 'Достигнут лимит бесплатного доступа. Оформите подписку, чтобы продолжить.');
    }

    getState().progress.push({ userId: user.id, starId, at: new Date().toISOString() });
    user.xp += XP_PER_STAR;
    logFor(user.id, `Отмечен выполненным шаг: «${star.name}». Получено ${XP_PER_STAR} XP!`);
    save();

    const now = progressOf(user.id);
    return {
      data: {
        success: true,
        completedStars: now,
        currentStarId: currentStarId(g.stars, g.edges, now, visible),
        xp: user.xp,
        xpGained: XP_PER_STAR,
        historyLogs: logsOf(user.id),
      },
    };
  }],

  ['POST', /^\/progress\/reset$/, (ctx) => {
    const user = requireUser(ctx);
    const starId = Number(ctx.body.starId);
    const g = graph();
    const star = g.stars.find((s) => s.id === starId);
    if (!star) throw new HttpError(404, 'Навык не найден');

    const s = getState();
    const before = s.progress.length;
    s.progress = s.progress.filter((p) => !(p.userId === user.id && p.starId === starId));
    if (s.progress.length === before) throw new HttpError(400, 'Этот навык ещё не отмечен');

    user.xp = Math.max(0, user.xp - XP_PER_STAR);
    logFor(user.id, `Сброшен прогресс по навыку «${star.name}».`);
    save();

    const now = progressOf(user.id);
    return {
      data: {
        success: true,
        completedStars: now,
        currentStarId: currentStarId(g.stars, g.edges, now, visibleFor(user, g.constellations)),
        xp: user.xp,
        historyLogs: logsOf(user.id),
      },
    };
  }],

  // ──────────────────────────────────────────────────────── portfolio
  ['GET', /^\/portfolio$/, (ctx) => {
    const user = requireUser(ctx);
    return {
      data: {
        portfolio: getState().portfolio.filter((w) => w.userId === user.id).sort((a, b) => b.id - a.id).map(publicWork),
      },
    };
  }],

  ['POST', /^\/portfolio$/, async (ctx) => {
    const user = requireUser(ctx);
    const form = ctx.body; // FormData
    const title = String(form.get('title') || '').trim();
    const comment = String(form.get('comment') || '').trim();
    const starId = form.get('starId') ? Number(form.get('starId')) : null;
    const file = form.get('image');

    if (title.length < 2) throw new HttpError(400, 'Название работы должно быть от 2 до 120 символов');
    if (!file || typeof file === 'string') throw new HttpError(400, 'Прикрепите изображение работы');

    const star = graph().stars.find((s) => s.id === starId);
    const image = await shrinkToDataUrl(file);

    const work = {
      id: nextId(),
      userId: user.id,
      title,
      starId,
      image,
      comment,
      verifiedByAi: false,
      aiFeedback: `${pick(PRAISE, title)}! «${title}» — ${pick(BODIES, title + 'b')} ${pick(NEXT_STEPS, title + 'c')}`,
      createdAt: new Date().toISOString(),
    };
    getState().portfolio.push(work);
    logFor(user.id, star ? `Загружена работа «${title}» к навыку «${star.name}».` : `Загружена работа «${title}» в портфолио.`);
    save();

    return { status: 201, data: { success: true, item: publicWork(work), historyLogs: logsOf(user.id) } };
  }],

  ['DELETE', /^\/portfolio\/(\d+)$/, (ctx) => {
    const user = requireUser(ctx);
    const id = Number(ctx.params[0]);
    const s = getState();
    const before = s.portfolio.length;
    s.portfolio = s.portfolio.filter((w) => !(w.id === id && w.userId === user.id));
    if (s.portfolio.length === before) throw new HttpError(404, 'Работа не найдена');
    save();
    return { data: { success: true } };
  }],

  // ──────────────────────────────────────────────────────────── store
  ['GET', /^\/store$/, (ctx) => {
    const user = requireUser(ctx);
    const owned = new Set(getState().purchases.filter((p) => p.userId === user.id).map((p) => p.itemId));
    return {
      data: {
        xp: user.xp,
        equipped: user.equipped,
        items: snapshot.storeItems.map((i) => ({
          ...i,
          owned: owned.has(i.id),
          affordable: user.xp >= i.price,
          proOnly: isProOnly(user, i),
        })),
      },
    };
  }],

  ['POST', /^\/store\/buy$/, (ctx) => {
    const user = requireUser(ctx);
    const item = snapshot.storeItems.find((i) => i.id === Number(ctx.body.itemId));
    if (!item) throw new HttpError(404, 'Товар не найден');

    const s = getState();
    if (s.purchases.some((p) => p.userId === user.id && p.itemId === item.id)) {
      throw new HttpError(409, 'Этот предмет уже куплен');
    }
    // PRO gate before the funds check — the trial user gets the accurate reason.
    if (isProOnly(user, item)) throw new HttpError(402, 'Этот предмет доступен с подпиской PRO');
    if (user.xp < item.price) throw new HttpError(400, `Не хватает опыта: нужно ${item.price} XP`);

    user.xp -= item.price;
    s.purchases.push({ userId: user.id, itemId: item.id });
    user.equipped = { ...user.equipped, [item.type]: item.payload };
    logFor(user.id, `Куплено в магазине: «${item.title}» за ${item.price} XP.`);
    save();

    return { data: { success: true, item, user: publicUser(user) } };
  }],

  ['POST', /^\/store\/equip$/, (ctx) => {
    const user = requireUser(ctx);
    const { itemId, type } = ctx.body;
    if (itemId) {
      const owned = getState().purchases.some((p) => p.userId === user.id && p.itemId === Number(itemId));
      if (!owned) throw new HttpError(403, 'Этот предмет не куплен');
      const item = snapshot.storeItems.find((i) => i.id === Number(itemId));
      user.equipped = { ...user.equipped, [type]: item.payload };
    } else {
      user.equipped = { ...user.equipped, [type]: null };
    }
    save();
    return { data: { success: true, user: publicUser(user) } };
  }],

  // ──────────────────────────────────────────────────────────── users
  ['PATCH', /^\/users\/profile$/, (ctx) => {
    const user = requireUser(ctx);
    const { name, role, age, city, weeklyHours } = ctx.body;
    if (name !== undefined) user.name = String(name).trim();
    if (role !== undefined) user.role = role;
    if (age !== undefined) user.age = Number(age);
    if (city !== undefined) user.city = city;
    if (weeklyHours !== undefined) user.weeklyHours = weeklyHours;
    save();
    return { data: { success: true, user: publicUser(user) } };
  }],

  ['POST', /^\/users\/pin$/, (ctx) => {
    const user = requireUser(ctx);
    if (!/^\d{4}$/.test(String(ctx.body.pin || ''))) throw new HttpError(400, 'PIN-код должен состоять из 4 цифр');
    // Once a PIN exists, changing it requires the current one — mirrors the server.
    if (user.pin) {
      if (!ctx.body.currentPin) throw new HttpError(400, 'Введите текущий PIN-код');
      if (user.pin !== String(ctx.body.currentPin)) throw new HttpError(400, 'Неверный текущий PIN-код');
    }
    user.pin = String(ctx.body.pin);
    save();
    return { data: { success: true } };
  }],

  ['POST', /^\/users\/pin\/verify$/, (ctx) => {
    const user = requireUser(ctx);
    if (!user.pin) throw new HttpError(400, 'PIN-код ещё не установлен');
    if (user.pin !== String(ctx.body.pin)) throw new HttpError(400, 'Неверный PIN-код');
    return { data: { success: true } };
  }],

  // Current PIN arrives as a query parameter (?currentPin=1234), like the server.
  ['DELETE', /^\/users\/pin$/, (ctx) => {
    const user = requireUser(ctx);
    if (!/^\d{4}$/.test(String(ctx.query.currentPin || ''))) throw new HttpError(400, 'PIN-код должен состоять из 4 цифр');
    if (user.pin && user.pin !== String(ctx.query.currentPin)) {
      throw new HttpError(400, 'Неверный текущий PIN-код');
    }
    user.pin = null;
    save();
    return { data: { success: true } };
  }],

  ['POST', /^\/users\/subscription\/upgrade$/, (ctx) => {
    const user = requireUser(ctx);
    user.subscription = 'pro';
    logFor(user.id, 'Оформлена подписка PRO — открыты все созвездия.');
    save();
    return { data: { success: true, user: publicUser(user) } };
  }],

  ['POST', /^\/users\/subscription\/cancel$/, (ctx) => {
    const user = requireUser(ctx);
    user.subscription = 'trial';
    save();
    return { data: { success: true, user: publicUser(user) } };
  }],

  // ─────────────────────────────────────────────────────────────── ai
  ['GET', /^\/ai\/status$/, () => ({ data: { model: 'offline' } })],

  ['POST', /^\/ai\/tutor$/, (ctx) => {
    const user = requireUser(ctx);
    const messages = ctx.body.messages || [];
    const question = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const topic = TUTOR.find(([re]) => re.test(question));
    let reply = topic ? topic[1] : pick(TUTOR_FALLBACK, question);

    const done = progressOf(user.id).length;
    if (done > 0 && Math.abs(hash(question)) % 3 === 0) {
      reply += `\n\nКстати, у тебя уже ${done} ${done === 1 ? 'звезда' : done < 5 ? 'звезды' : 'звёзд'} на карте — отличный темп! ⭐`;
    }
    return { data: { reply, model: 'offline' } };
  }],

  // ──────────────────────────────────────────────────────────── admin
  ['GET', /^\/admin\/graph$/, (ctx) => {
    requireAdmin(ctx);
    return { data: graph() };
  }],

  ['GET', /^\/admin\/stats$/, (ctx) => {
    requireAdmin(ctx);
    const s = getState();
    const g = graph();
    return {
      data: {
        users: s.users.length,
        pro: s.users.filter((u) => u.subscription === 'pro').length,
        constellations: g.constellations.length,
        stars: g.stars.length,
        resources: g.resources.length,
        works: s.portfolio.length,
        completions: s.progress.length,
        cities: s.cities.length,
        starsWithoutResources: g.stars.filter((st) => !g.resources.some((r) => r.starId === st.id)).length,
        cycle: null,
      },
    };
  }],

  ['GET', /^\/admin\/users$/, (ctx) => {
    requireAdmin(ctx);
    const s = getState();
    const q = String(ctx.query.q || '').trim().toLowerCase();
    const rows = s.users
      .filter((u) => !q || [u.name, u.email, u.city].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => b.id - a.id)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        age: u.age,
        city: u.city,
        role: u.role,
        xp: u.xp,
        subscription: u.subscription,
        isAdmin: u.isAdmin,
        completed: s.progress.filter((p) => p.userId === u.id).length,
        works: s.portfolio.filter((w) => w.userId === u.id).length,
        createdAt: u.createdAt,
        registered: ruDate(u.createdAt),
      }));
    return { data: { users: rows, total: rows.length } };
  }],

  ['GET', /^\/admin\/cities$/, (ctx) => {
    requireAdmin(ctx);
    const s = getState();
    const g = graph();
    return {
      data: {
        cities: s.cities.map((name, i) => ({
          id: i + 1,
          name,
          sort_order: i,
          resources: g.resources.filter((r) => r.city === name).length,
          users: s.users.filter((u) => u.city === name).length,
        })),
      },
    };
  }],

  ['POST', /^\/admin\/cities$/, (ctx) => {
    requireAdmin(ctx);
    const name = String(ctx.body.name || '').trim();
    if (name.length < 2) throw new HttpError(400, 'Название от 2 символов');
    const s = getState();
    if (s.cities.some((c) => c.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'Такой город уже есть в списке');
    }
    s.cities.push(name);
    save();
    return { status: 201, data: { success: true, id: s.cities.length } };
  }],

  ['DELETE', /^\/admin\/cities\/(\d+)$/, (ctx) => {
    requireAdmin(ctx);
    const s = getState();
    s.cities.splice(Number(ctx.params[0]) - 1, 1);
    save();
    return { data: { success: true } };
  }],

  // Graph editing in the demo is intentionally read-only: changes would live
  // only in this visitor's browser and could leave the map in a confusing
  // state for a customer walkthrough.
  ['POST', /^\/admin\/(constellations|stars|edges|resources)/, () => {
    throw new HttpError(403, 'В демоверсии редактирование карты отключено. В полной версии эти действия доступны.');
  }],
  ['PUT', /^\/admin\//, () => {
    throw new HttpError(403, 'В демоверсии редактирование карты отключено. В полной версии эти действия доступны.');
  }],
  ['DELETE', /^\/admin\/(constellations|stars|edges|resources)/, () => {
    throw new HttpError(403, 'В демоверсии редактирование карты отключено. В полной версии эти действия доступны.');
  }],

  ['GET', /^\/health$/, () => ({ data: { status: 'ok', env: 'demo', ai: 'offline' } })],
];

/* -------------------------------------------------------------- images */

/** Downscale an uploaded image so localStorage doesn't overflow. */
function shrinkToDataUrl(file, max = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new HttpError(400, 'Не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(reader.result);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          resolve(reader.result);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------ dispatch */

export async function handle({ method, url, body, headers, query }) {
  const path = url.replace(/^\/api/, '').split('?')[0] || '/';

  for (const [verb, pattern, handler] of routes) {
    if (verb !== method) continue;
    const match = pattern.exec(path);
    if (!match) continue;
    return handler({ body, headers: headers || {}, query: query || {}, params: match.slice(1) });
  }

  throw new HttpError(404, `Эндпоинт не найден: ${method} ${path}`);
}

export { HttpError, resetDemo };
