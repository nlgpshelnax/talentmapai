'use strict';

/**
 * API regression suite.
 *
 * Beyond happy paths, these tests pin down the specific defects that made the
 * prototype unshippable — broken authorisation, client-controlled prices,
 * completing locked skills, purchases that vanished. Each of those has a named
 * test so a regression is obvious.
 *
 * Run: npm test
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Isolated database + uploads per run, so tests never touch real data.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'talentmap-test-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(TMP, 'test.db');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-000000';

const request = require('supertest');
const { app } = require('../server');
const { createSchema } = require('../src/db/schema');
const { seedAll } = require('../src/db/seed');
const { dbGet, dbRun, close } = require('../src/db');

let demoToken;
let adminToken;
let outsiderToken;
let outsiderId;

test.before(async () => {
  await createSchema();
  await seedAll();

  const demo = await request(app)
    .post('/api/auth/login')
    .send({ email: 'demo@talentmap.ai', password: 'demo123' });
  assert.equal(demo.status, 200, 'demo login should succeed');
  demoToken = demo.body.token;

  const admin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@talentmap.ai', password: 'admin12345' });
  assert.equal(admin.status, 200, 'admin login should succeed');
  adminToken = admin.body.token;

  const outsider = await request(app).post('/api/auth/register').send({
    name: 'Посторонний',
    email: `outsider-${Date.now()}@example.com`,
    password: 'password123',
    role: 'parent',
  });
  assert.equal(outsider.status, 201);
  outsiderToken = outsider.body.token;
  outsiderId = outsider.body.user.id;
});

test.after(async () => {
  await close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);

/* ------------------------------------------------------------------ basics */

test('health endpoint responds', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('seed produced the full merged curriculum', async () => {
  const res = await auth(request(app).get('/api/app-state'), demoToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.constellations.length, 14, '14 constellations (10 from spec + 4 from the live DB)');
  assert.equal(res.body.stars.length, 70);
  assert.ok(res.body.resources.length >= 140, 'два ресурса на навык: онлайн-курс и инструмент');

  // У каждого навыка должен быть и онлайн-курс, и инструмент. Очные занятия
  // сюда больше не входят: они переехали в каталог площадок, потому что
  // привязаны к городу и направлению, а не к отдельному навыку.
  const byStar = new Map();
  for (const r of res.body.resources) {
    if (!byStar.has(r.starId)) byStar.set(r.starId, new Set());
    byStar.get(r.starId).add(r.type);
  }
  for (const star of res.body.stars) {
    const types = byStar.get(star.id);
    assert.ok(types?.has('online'), `у навыка ${star.id} (${star.name}) нет онлайн-курса`);
    assert.ok(types?.has('tool'), `у навыка ${star.id} (${star.name}) нет инструмента`);
    assert.ok(!types?.has('offline'), `у навыка ${star.id} остался офлайн-ресурс — они должны быть в каталоге площадок`);
  }
});

test('REGRESSION: у каждого направления есть очные площадки', async () => {
  const state = await auth(request(app).get('/api/app-state'), demoToken);
  const empty = [];
  for (const c of state.body.constellations) {
    const res = await auth(request(app).get('/api/venues').query({ constellationId: c.id }), demoToken);
    const total = res.body.local.length + res.body.elsewhere.length + res.body.anywhere.length;
    if (!total) empty.push(c.name);
  }
  assert.equal(empty.length, 0, `направления без площадок: ${empty.join(', ')}`);
});

/* -------------------------------------------------------------------- auth */

test('protected endpoints reject anonymous callers', async () => {
  for (const [method, url] of [
    ['get', '/api/app-state'],
    ['get', '/api/store'],
    ['post', '/api/progress/complete'],
    ['get', '/api/auth/me'],
    ['patch', '/api/users/profile'],
  ]) {
    const res = await request(app)[method](url).send({});
    assert.equal(res.status, 401, `${method.toUpperCase()} ${url} must require auth`);
  }
});

test('every admin endpoint is gated behind the admin role', async () => {
  const endpoints = [
    ['get', '/api/admin/graph'],
    ['get', '/api/admin/users'],
    ['get', '/api/admin/stats'],
    ['post', '/api/admin/constellations'],
    ['post', '/api/admin/stars'],
    ['post', '/api/admin/edges'],
    ['post', '/api/admin/resources'],
  ];

  for (const [method, url] of endpoints) {
    const anon = await request(app)[method](url).send({});
    assert.equal(anon.status, 401, `${url} must reject anonymous`);

    const asUser = await auth(request(app)[method](url), demoToken).send({});
    assert.equal(asUser.status, 403, `${url} must reject a non-admin user`);
  }

  const asAdmin = await auth(request(app).get('/api/admin/graph'), adminToken);
  assert.equal(asAdmin.status, 200, 'admin may read the graph');
});

test('a forged or malformed token is rejected', async () => {
  const res = await auth(request(app).get('/api/auth/me'), 'not.a.real.token');
  assert.equal(res.status, 401);
});

test('login does not reveal whether an email exists', async () => {
  const missing = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever1' });
  const wrongPass = await request(app).post('/api/auth/login').send({ email: 'demo@talentmap.ai', password: 'wrongpass1' });
  assert.equal(missing.status, 400);
  assert.equal(wrongPass.status, 400);
  assert.equal(missing.body.error, wrongPass.body.error, 'identical message for both cases');
});

test('registration rejects weak passwords and bad emails', async () => {
  const weak = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Тест', email: `w${Date.now()}@example.com`, password: 'short' });
  assert.equal(weak.status, 400);

  const badEmail = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Тест', email: 'not-an-email', password: 'password123' });
  assert.equal(badEmail.status, 400);
});

test('duplicate registration is refused', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Дубль', email: 'demo@talentmap.ai', password: 'password123' });
  assert.equal(res.status, 409);
});

test('never leaks password or PIN hashes', async () => {
  const res = await auth(request(app).get('/api/auth/me'), demoToken);
  const body = JSON.stringify(res.body);
  assert.ok(!body.includes('password'), 'no password field');
  assert.ok(!body.includes('parent_pin'), 'no pin field');
  assert.ok(!body.includes('$2b$'), 'no bcrypt hash anywhere');
});

/* ------------------------------------------------------- IDOR / ownership */

test('REGRESSION: a client-supplied userId cannot be used to read another account', async () => {
  // The prototype honoured ?userId= and returned that account's whole state.
  const demoState = await auth(request(app).get('/api/app-state?userId=1'), demoToken);
  assert.equal(demoState.status, 200);
  assert.notEqual(demoState.body.user.id, 1, 'must ignore the query param');
  assert.equal(demoState.body.user.email, 'demo@talentmap.ai');
});

test('REGRESSION: a client-supplied userId cannot be used to modify another account', async () => {
  const before = await dbGet('SELECT name FROM users WHERE email = ?', ['demo@talentmap.ai']);

  const res = await auth(request(app).patch('/api/users/profile'), outsiderToken).send({
    userId: 2,
    name: 'Взломано',
  });
  assert.equal(res.status, 200, 'the call succeeds but only affects the caller');

  const after = await dbGet('SELECT name FROM users WHERE email = ?', ['demo@talentmap.ai']);
  assert.equal(after.name, before.name, "the demo account's name must be untouched");

  const outsider = await dbGet('SELECT name FROM users WHERE id = ?', [outsiderId]);
  assert.equal(outsider.name, 'Взломано', 'only the caller was updated');
});

test('portfolio items of other users are not readable or deletable', async () => {
  const demoItem = await dbGet('SELECT id FROM portfolio WHERE user_id = (SELECT id FROM users WHERE email = ?)', [
    'demo@talentmap.ai',
  ]);
  if (!demoItem) return; // demo seed has one, but stay resilient

  const list = await auth(request(app).get('/api/portfolio'), outsiderToken);
  assert.equal(list.status, 200);
  assert.equal(list.body.portfolio.length, 0, 'outsider sees an empty portfolio');

  const del = await auth(request(app).delete(`/api/portfolio/${demoItem.id}`), outsiderToken);
  assert.equal(del.status, 404, "another user's item is not deletable");
});

/* ---------------------------------------------------------------- progress */

test('REGRESSION: a locked skill cannot be completed out of order', async () => {
  const state = await auth(request(app).get('/api/app-state'), outsiderToken);
  const stars = state.body.stars;

  // Pick a star that is deep in a path: the last one of its constellation.
  const constellationId = stars[0].constellationId;
  const chain = stars
    .filter((s) => s.constellationId === constellationId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const last = chain[chain.length - 1];

  const res = await auth(request(app).post('/api/progress/complete'), outsiderToken).send({ starId: last.id });
  assert.equal(res.status, 400, 'the server must refuse, not just hide the star in the UI');
});

test('completing an available skill awards XP and logs the correct skill name', async () => {
  const state = await auth(request(app).get('/api/app-state'), outsiderToken);
  const first = state.body.stars.find((s) => s.id === state.body.currentStarId) || state.body.stars[0];
  const xpBefore = state.body.user.xp;

  const res = await auth(request(app).post('/api/progress/complete'), outsiderToken).send({ starId: first.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.xp, xpBefore + 50, '50 XP per skill');
  assert.ok(res.body.completedStars.includes(first.id));

  // The prototype logged a *resource* title here instead of the skill name.
  const log = res.body.historyLogs[0].text;
  assert.ok(log.includes(first.name), `history should name the skill, got: ${log}`);
});

test('the same skill cannot be completed twice', async () => {
  const state = await auth(request(app).get('/api/app-state'), outsiderToken);
  const done = state.body.completedStars[0];
  const res = await auth(request(app).post('/api/progress/complete'), outsiderToken).send({ starId: done });
  assert.equal(res.status, 409);
});

test('resetting a skill refunds the XP', async () => {
  const state = await auth(request(app).get('/api/app-state'), outsiderToken);
  const done = state.body.completedStars[0];
  const xpBefore = state.body.user.xp;

  const res = await auth(request(app).post('/api/progress/reset'), outsiderToken).send({ starId: done });
  assert.equal(res.status, 200);
  assert.equal(res.body.xp, xpBefore - 50);

  // put it back so later tests keep a stable baseline
  await auth(request(app).post('/api/progress/complete'), outsiderToken).send({ starId: done });
});

test('the free plan star limit is enforced server-side', async () => {
  const email = `limit-${Date.now()}@example.com`;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Лимит', email, password: 'password123' });
  const token = reg.body.token;

  let completed = 0;
  let blocked = false;

  for (let i = 0; i < 6; i++) {
    const state = await auth(request(app).get('/api/app-state'), token);
    const next = state.body.currentStarId;
    if (!next) break;
    const res = await auth(request(app).post('/api/progress/complete'), token).send({ starId: next });
    if (res.status === 402) {
      blocked = true;
      break;
    }
    assert.equal(res.status, 200);
    completed++;
  }

  assert.ok(blocked, 'a trial account must hit the paywall');
  assert.equal(completed, 3, 'exactly 3 free skills');
});

/* ------------------------------------------------------------------- store */

test('REGRESSION: the purchase price comes from the database, not the request', async () => {
  const before = await dbGet('SELECT xp_points FROM users WHERE id = ?', [outsiderId]);
  await dbRun('UPDATE users SET xp_points = 500 WHERE id = ?', [outsiderId]);

  const store = await auth(request(app).get('/api/store'), outsiderToken);
  // Берём самый дорогой предмет, доступный на бесплатном плане: предметы
  // дороже потолка пробного периода теперь отдают 402 (PRO), и проверка
  // цены на них ничего не проверяла бы.
  const item = store.body.items.filter((i) => !i.proOnly && !i.owned).sort((a, b) => b.price - a.price)[0];

  // The prototype read itemPrice straight from the body — this would be free.
  const res = await auth(request(app).post('/api/store/buy'), outsiderToken).send({
    itemId: item.id,
    itemPrice: 0,
    price: 0,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.xp, 500 - item.price, 'the real price was charged');

  await dbRun('UPDATE users SET xp_points = ? WHERE id = ?', [before.xp_points, outsiderId]);
});

test('REGRESSION: a purchase persists and is actually equipped', async () => {
  await dbRun('UPDATE users SET xp_points = 500 WHERE id = ?', [outsiderId]);

  const store = await auth(request(app).get('/api/store'), outsiderToken);
  const avatar = store.body.items.find((i) => i.type === 'avatar' && !i.owned);

  const buy = await auth(request(app).post('/api/store/buy'), outsiderToken).send({ itemId: avatar.id });
  assert.equal(buy.status, 200);

  // In the prototype XP was deducted and nothing was stored anywhere.
  assert.equal(buy.body.user.equipped.avatar, avatar.payload, 'the item is worn immediately');

  const after = await auth(request(app).get('/api/store'), outsiderToken);
  assert.ok(after.body.items.find((i) => i.id === avatar.id).owned, 'ownership survives a reload');

  const state = await auth(request(app).get('/api/app-state'), outsiderToken);
  assert.ok(state.body.purchases.some((p) => p.id === avatar.id), 'purchase appears in app state');
});

test('buying the same item twice is refused', async () => {
  const store = await auth(request(app).get('/api/store'), outsiderToken);
  const owned = store.body.items.find((i) => i.owned);
  const res = await auth(request(app).post('/api/store/buy'), outsiderToken).send({ itemId: owned.id });
  assert.equal(res.status, 409);
});

test('buying without enough XP is refused', async () => {
  await dbRun('UPDATE users SET xp_points = 0 WHERE id = ?', [outsiderId]);
  const store = await auth(request(app).get('/api/store'), outsiderToken);
  const notOwned = store.body.items.find((i) => !i.owned);
  const res = await auth(request(app).post('/api/store/buy'), outsiderToken).send({ itemId: notOwned.id });
  assert.equal(res.status, 400);
});

test('an unowned item cannot be equipped', async () => {
  const store = await auth(request(app).get('/api/store'), outsiderToken);
  const notOwned = store.body.items.find((i) => !i.owned);
  const res = await auth(request(app).post('/api/store/equip'), outsiderToken).send({
    itemId: notOwned.id,
    type: notOwned.type,
  });
  assert.equal(res.status, 403);
});

/* ---------------------------------------------------- store: PRO-only items */

// Дорогие предметы (звания за 200 XP) недостижимы на бесплатном плане:
// потолок пробного аккаунта — trialStarLimit × xpPerStar = 3 × 50 = 150 XP.
// Отдельный пользователь, регистрируемый в первом тесте блока и переиспользуемый
// далее по порядку (как это уже сделано для outsider-тестов магазина выше).
let proToken;
let proUserId;

test('REGRESSION: пробный пользователь видит proOnly на предметах дороже потолка', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Пробный', email: `pro-gate-${Date.now()}@example.com`, password: 'password123' });
  assert.equal(reg.status, 201);
  proToken = reg.body.token;
  proUserId = reg.body.user.id;

  const store = await auth(request(app).get('/api/store'), proToken);
  assert.equal(store.status, 200);

  const expensive = store.body.items.filter((i) => i.price === 200);
  const cheap = store.body.items.filter((i) => i.price === 100);
  assert.ok(expensive.length >= 1, 'в каталоге есть звания за 200 XP');
  assert.ok(cheap.length >= 1, 'в каталоге есть аватары за 100 XP');

  assert.ok(expensive.every((i) => i.proOnly === true), '200 XP недостижимы на бесплатном плане');
  assert.ok(cheap.every((i) => i.proOnly === false), '100 XP доступны без подписки');
});

test('REGRESSION: покупка proOnly предмета пробным пользователем возвращает 402 с сообщением про PRO', async () => {
  // Даём заведомо достаточно XP, чтобы отказ был именно про PRO, а не про нехватку опыта.
  await dbRun('UPDATE users SET xp_points = 1000 WHERE id = ?', [proUserId]);

  const store = await auth(request(app).get('/api/store'), proToken);
  const locked = store.body.items.find((i) => i.proOnly && !i.owned);
  assert.ok(locked, 'должен найтись недоступный без PRO предмет');

  const res = await auth(request(app).post('/api/store/buy'), proToken).send({ itemId: locked.id });
  assert.equal(res.status, 402, 'причина — подписка, а не деньги');
  assert.equal(res.body.error, 'Этот предмет доступен с подпиской PRO');

  // XP не списан — покупка не состоялась.
  const still = await auth(request(app).get('/api/store'), proToken);
  assert.equal(still.body.xp, 1000, 'опыт не тронут при отказе');
  assert.ok(!still.body.items.find((i) => i.id === locked.id).owned, 'предмет не куплен');
});

test('после оформления PRO тот же предмет перестаёт быть proOnly и покупается', async () => {
  const before = await auth(request(app).get('/api/store'), proToken);
  const locked = before.body.items.find((i) => i.proOnly && !i.owned);
  assert.ok(locked, 'до апгрейда предмет недоступен без PRO');

  const upgrade = await auth(request(app).post('/api/users/subscription/upgrade'), proToken);
  assert.equal(upgrade.status, 200);
  assert.equal(upgrade.body.user.subscription, 'pro');

  const after = await auth(request(app).get('/api/store'), proToken);
  const nowItem = after.body.items.find((i) => i.id === locked.id);
  assert.equal(nowItem.proOnly, false, 'с PRO предмет больше не заблокирован');

  const buy = await auth(request(app).post('/api/store/buy'), proToken).send({ itemId: locked.id });
  assert.equal(buy.status, 200, 'теперь предмет можно купить');
  assert.equal(buy.body.user.xp, before.body.xp - locked.price, 'списана настоящая цена');
});

/* ------------------------------------------------------------- diagnostics */

test('the questionnaire has the 12 questions required by the TZ', async () => {
  const res = await request(app).get('/api/diagnostics/questions');
  assert.equal(res.status, 200);
  assert.equal(res.body.questions.length, 12);
  assert.equal(res.body.questions.filter((q) => q.block === 'parent').length, 7);
  assert.equal(res.body.questions.filter((q) => q.block === 'child').length, 5);
  // Scoring weights must never be exposed to the client.
  assert.ok(!JSON.stringify(res.body).includes('weights'));
});

test('city autocomplete returns suggestions', async () => {
  const res = await request(app).get('/api/diagnostics/cities?q=мос');
  assert.equal(res.status, 200);
  assert.ok(res.body.cities.includes('Москва'));
});

test('REGRESSION: different answers produce different recommendations', async () => {
  // The prototype always fell back to constellation #1 without an API key,
  // so every child received an identical map.
  const makeUser = async (label) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: label, email: `${label}-${Date.now()}@example.com`, password: 'password123' });
    return res.body.token;
  };

  const artist = await makeUser('artist');
  const engineer = await makeUser('engineer');

  const artistRes = await auth(request(app).post('/api/diagnostics/submit'), artist).send({
    answers: {
      age: '7-8', hobby: 'draw', clubs: 'art', weeklyHours: '3-5 часов', priority: 'fun',
      concern: 'unknown', city: 'Москва', picture: 'paint', makeWithHands: 'drawing',
      fearSoftware: 'yes', orderOrFreedom: 'freedom', dailyTime: '30m',
    },
  });

  const engineerRes = await auth(request(app).post('/api/diagnostics/submit'), engineer).send({
    answers: {
      age: '16-18', hobby: 'build', clubs: 'digital', weeklyHours: 'больше 8 часов', priority: 'profession',
      concern: 'jumping', city: 'Казань', picture: 'draft', makeWithHands: 'model',
      fearSoftware: 'no', orderOrFreedom: 'order', dailyTime: 'more',
    },
  });

  assert.equal(artistRes.status, 200);
  assert.equal(engineerRes.status, 200);

  const artistIds = artistRes.body.recommended.map((c) => c.key);
  const engineerIds = engineerRes.body.recommended.map((c) => c.key);

  assert.ok(artistIds.length >= 2 && artistIds.length <= 4, '2–4 recommendations');
  assert.notDeepEqual(artistIds, engineerIds, 'profiles must diverge');
  assert.ok(artistRes.body.summary.length > 80, 'a real summary paragraph is produced without an API key');
  assert.ok(engineerRes.body.recommended.every((c) => c.reason), 'each recommendation is explained');
});

test('the questionnaire offers enough choice to be meaningful', async () => {
  const res = await request(app).get('/api/diagnostics/questions');
  const { questions } = res.body;

  const withOptions = questions.filter((q) => q.options);
  for (const q of withOptions) {
    assert.ok(q.options.length >= 4, `вопрос «${q.id}» предлагает всего ${q.options.length} вариантов`);
  }

  const multi = questions.filter((q) => q.multi);
  assert.ok(multi.length >= 2, 'должны быть вопросы с множественным выбором');
  for (const q of multi) {
    assert.ok(q.maxChoices >= 2, `вопрос «${q.id}» помечен multi, но лимит ${q.maxChoices}`);
  }

  // Веса не должны утекать клиенту.
  assert.ok(!JSON.stringify(questions).includes('weights'));
});

test('REGRESSION: ответы валидируются по определению вопросов', async () => {
  const token = (
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Валидация', email: `val-${Date.now()}@example.com`, password: 'password123' })
  ).body.token;

  const base = { age: '9-10', hobby: ['draw'], picture: 'paint', fearSoftware: 'little', orderOrFreedom: 'freedom' };

  // Несуществующий вариант ответа.
  const badOption = await auth(request(app).post('/api/diagnostics/submit'), token).send({
    answers: { ...base, picture: 'телепортация' },
  });
  assert.equal(badOption.status, 400, 'выдуманный вариант должен отклоняться');
  assert.ok(badOption.body.details.some((d) => d.field === 'picture'));

  // Несуществующий вопрос.
  const badQuestion = await auth(request(app).post('/api/diagnostics/submit'), token).send({
    answers: { ...base, любимыйЦвет: 'синий' },
  });
  assert.equal(badQuestion.status, 400, 'неизвестный вопрос должен отклоняться');

  // Несколько ответов там, где разрешён один.
  const tooMany = await auth(request(app).post('/api/diagnostics/submit'), token).send({
    answers: { ...base, picture: ['paint', 'computer'] },
  });
  assert.equal(tooMany.status, 400, 'одиночный вопрос не принимает массив');

  // Превышение лимита множественного выбора.
  const overLimit = await auth(request(app).post('/api/diagnostics/submit'), token).send({
    answers: { ...base, hobby: ['draw', 'games', 'build'] },
  });
  assert.equal(overLimit.status, 400, 'лимит выбора должен соблюдаться');

  // Взаимоисключающий вариант вместе с остальными.
  const conflicting = await auth(request(app).post('/api/diagnostics/submit'), token).send({
    answers: { ...base, clubs: ['none', 'art'] },
  });
  assert.equal(conflicting.status, 400, '«ничего не пробовали» нельзя совмещать');

  // Слишком мало ответов, чтобы что-то считать.
  const tooFew = await auth(request(app).post('/api/diagnostics/submit'), token).send({
    answers: { age: '9-10' },
  });
  assert.equal(tooFew.status, 400, 'по одному ответу карту не строят');

  // Корректный набор проходит.
  const ok = await auth(request(app).post('/api/diagnostics/submit'), token).send({ answers: base });
  assert.equal(ok.status, 200);
});

test('оценка объясняется процентами, профилем и уверенностью', async () => {
  const token = (
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Инженер', email: `eng-${Date.now()}@example.com`, password: 'password123' })
  ).body.token;

  const res = await auth(request(app).post('/api/diagnostics/submit'), token).send({
    answers: {
      age: '11-12', hobby: ['build', 'tinker'], clubs: ['robotics'], weeklyHours: '6-8 часов',
      priority: 'achievements', concern: 'jumping', city: 'Казань', picture: 'bricks',
      makeWithHands: ['robot', 'model'], fearSoftware: 'no', orderOrFreedom: 'order', dailyTime: '1h',
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.answeredCount, 12, 'засчитаны все двенадцать ответов');

  for (const rec of res.body.recommended) {
    assert.equal(typeof rec.match, 'number');
    assert.ok(rec.match >= 0 && rec.match <= 100, `процент вне диапазона: ${rec.match}`);
    assert.ok(rec.reason, 'у каждой рекомендации есть объяснение');
  }

  const matches = res.body.recommended.map((r) => r.match);
  assert.deepEqual(matches, [...matches].sort((a, b) => b - a), 'рекомендации отсортированы по совпадению');
  assert.ok(matches[0] >= 60, `лидер должен уверенно совпадать, получено ${matches[0]}%`);

  assert.ok(res.body.highlights.length >= 3, 'показаны сильные стороны');
  assert.equal(res.body.highlights[0].value, 100, 'сильные стороны нормированы к 100');
  assert.ok(['high', 'medium', 'low'].includes(res.body.confidence.level));

  // Профиль «конструктор + робототехника» обязан вывести технические направления.
  const keys = res.body.recommended.map((r) => r.key);
  assert.ok(
    keys.some((k) => ['robotics', '3d-printing', 'engineering-graphics'].includes(k)),
    `для технического профиля ожидались технические направления, получено: ${keys.join(', ')}`
  );
});

test('возраст влияет на подбор: малышам не предлагают взрослые направления первыми', async () => {
  const make = async (age) => {
    const token = (
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Возраст', email: `age-${age}-${Date.now()}@example.com`, password: 'password123' })
    ).body.token;
    const res = await auth(request(app).post('/api/diagnostics/submit'), token).send({
      answers: {
        age, hobby: ['games'], clubs: ['coding'], picture: 'computer',
        makeWithHands: ['site'], fearSoftware: 'love', orderOrFreedom: 'alone',
      },
    });
    return res.body.recommended.map((r) => r.key);
  };

  const little = await make('7-8');
  const teen = await make('16-18');

  assert.ok(!little.includes('cybersecurity'), 'кибербезопасность не для семилетки');
  assert.ok(!little.includes('ai-data'), 'ИИ и данные не для семилетки');
  assert.ok(
    teen.includes('programming-web') || teen.includes('ai-data') || teen.includes('cybersecurity'),
    `подростку с таким профилем ожидались цифровые направления, получено: ${teen.join(', ')}`
  );
});

test('diagnostics marks the user as onboarded and stores the answers', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Онборд', email: `onb-${Date.now()}@example.com`, password: 'password123' });
  const token = reg.body.token;
  assert.equal(reg.body.user.onboarded, false);

  await auth(request(app).post('/api/diagnostics/submit'), token).send({
    answers: { age: '11-12', hobby: 'games', city: 'Пермь', picture: 'computer', fearSoftware: 'no', makeWithHands: ['site'] },
  });

  const me = await auth(request(app).get('/api/auth/me'), token);
  assert.equal(me.body.user.onboarded, true);
  assert.ok(me.body.user.recommendedGraphs.length >= 2);

  const saved = await auth(request(app).get('/api/diagnostics/result'), token);
  assert.equal(saved.body.result.answers.city, 'Пермь');
});

/* ------------------------------------------------------------------- users */

test('password change requires the current password', async () => {
  const email = `pw-${Date.now()}@example.com`;
  const reg = await request(app).post('/api/auth/register').send({ name: 'Пароль', email, password: 'password123' });
  const token = reg.body.token;

  const wrong = await auth(request(app).post('/api/auth/change-password'), token).send({
    currentPassword: 'notmypassword',
    newPassword: 'brandnewpass1',
  });
  assert.equal(wrong.status, 400);

  const ok = await auth(request(app).post('/api/auth/change-password'), token).send({
    currentPassword: 'password123',
    newPassword: 'brandnewpass1',
  });
  assert.equal(ok.status, 200);

  const relogin = await request(app).post('/api/auth/login').send({ email, password: 'brandnewpass1' });
  assert.equal(relogin.status, 200, 'the new password works');

  const old = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  assert.equal(old.status, 400, 'the old password no longer works');
});

test('the onboarding role choice persists to the profile', async () => {
  // Формулировки диагностики зависят от роли, поэтому выбор с онбординга
  // должен сохраняться, а не жить только в состоянии навигации.
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Подросток', email: `teen-${Date.now()}@example.com`, password: 'password123' });
  const token = reg.body.token;
  assert.equal(reg.body.user.role, 'parent', 'по умолчанию — родитель');

  const saved = await auth(request(app).patch('/api/users/profile'), token).send({ role: 'child' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.user.role, 'child');

  const me = await auth(request(app).get('/api/auth/me'), token);
  assert.equal(me.body.user.role, 'child', 'роль сохраняется между запросами');
});

test('an unknown role value is rejected', async () => {
  const res = await auth(request(app).patch('/api/users/profile'), demoToken).send({ role: 'teacher' });
  assert.equal(res.status, 400);
});

test('the parent PIN is stored hashed and verified correctly', async () => {
  const set = await auth(request(app).post('/api/users/pin'), demoToken).send({ pin: '4321' });
  assert.equal(set.status, 200);

  const stored = await dbGet('SELECT parent_pin FROM users WHERE email = ?', ['demo@talentmap.ai']);
  assert.notEqual(stored.parent_pin, '4321', 'the PIN must never be stored in plaintext');
  assert.ok(stored.parent_pin.startsWith('$2'), 'stored as a bcrypt hash');

  const bad = await auth(request(app).post('/api/users/pin/verify'), demoToken).send({ pin: '0000' });
  assert.equal(bad.status, 400);

  const good = await auth(request(app).post('/api/users/pin/verify'), demoToken).send({ pin: '4321' });
  assert.equal(good.status, 200);
});

test('a non-4-digit PIN is rejected', async () => {
  const res = await auth(request(app).post('/api/users/pin'), demoToken).send({ pin: 'abcd' });
  assert.equal(res.status, 400);
});

test('setting the first PIN needs no currentPin', async () => {
  // Fresh account with no PIN yet: currentPin must not be required.
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'ПИН-первый', email: `pin-first-${Date.now()}@example.com`, password: 'password123' });
  const token = reg.body.token;

  const set = await auth(request(app).post('/api/users/pin'), token).send({ pin: '1234' });
  assert.equal(set.status, 200, 'the first PIN is set without a current PIN');

  const stored = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [reg.body.user.id]);
  assert.ok(stored.parent_pin && stored.parent_pin.startsWith('$2'), 'stored as a bcrypt hash');
});

test('REGRESSION: changing a PIN requires the current one', async () => {
  // The child could open Settings and overwrite the parent PIN outright; now a
  // change must prove knowledge of the current PIN.
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'ПИН-смена', email: `pin-change-${Date.now()}@example.com`, password: 'password123' });
  const token = reg.body.token;

  const first = await auth(request(app).post('/api/users/pin'), token).send({ pin: '1234' });
  assert.equal(first.status, 200);

  // Without the current PIN — rejected.
  const missing = await auth(request(app).post('/api/users/pin'), token).send({ pin: '5678' });
  assert.equal(missing.status, 400, 'a change without the current PIN is refused');

  // With the wrong current PIN — rejected, with the specific message.
  const wrong = await auth(request(app).post('/api/users/pin'), token).send({ pin: '5678', currentPin: '0000' });
  assert.equal(wrong.status, 400, 'a wrong current PIN is refused');
  assert.equal(wrong.body.error, 'Неверный текущий PIN-код');

  // With the correct current PIN — succeeds and actually replaces the hash.
  const before = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [reg.body.user.id]);
  const ok = await auth(request(app).post('/api/users/pin'), token).send({ pin: '5678', currentPin: '1234' });
  assert.equal(ok.status, 200, 'the correct current PIN lets the change through');
  const after = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [reg.body.user.id]);
  assert.notEqual(after.parent_pin, before.parent_pin, 'the stored hash was replaced');

  const verifiesNew = await auth(request(app).post('/api/users/pin/verify'), token).send({ pin: '5678' });
  assert.equal(verifiesNew.status, 200, 'the new PIN verifies');
});

test('REGRESSION: removing a PIN requires the current one', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'ПИН-удаление', email: `pin-delete-${Date.now()}@example.com`, password: 'password123' });
  const token = reg.body.token;

  const first = await auth(request(app).post('/api/users/pin'), token).send({ pin: '1234' });
  assert.equal(first.status, 200);

  // Without the current PIN in the query — rejected.
  const missing = await auth(request(app).delete('/api/users/pin'), token);
  assert.equal(missing.status, 400, 'deleting without the current PIN is refused');

  // With the wrong current PIN — rejected, with the specific message.
  const wrong = await auth(request(app).delete('/api/users/pin').query({ currentPin: '0000' }), token);
  assert.equal(wrong.status, 400, 'a wrong current PIN is refused');
  assert.equal(wrong.body.error, 'Неверный текущий PIN-код');

  // Still set after the failed attempts.
  const stillSet = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [reg.body.user.id]);
  assert.ok(stillSet.parent_pin, 'the PIN survives failed deletions');

  // With the correct current PIN — succeeds and clears the hash.
  const ok = await auth(request(app).delete('/api/users/pin').query({ currentPin: '1234' }), token);
  assert.equal(ok.status, 200, 'the correct current PIN removes the PIN');
  const gone = await dbGet('SELECT parent_pin FROM users WHERE id = ?', [reg.body.user.id]);
  assert.equal(gone.parent_pin, null, 'the PIN is cleared');
});

/* ------------------------------------------------------------------- admin */

test('admin can create a constellation, a star and a resource', async () => {
  const con = await auth(request(app).post('/api/admin/constellations'), adminToken).send({
    name: 'Тестовое созвездие',
    description: 'Проверка админского API',
  });
  assert.equal(con.status, 201);

  const star = await auth(request(app).post('/api/admin/stars'), adminToken).send({
    constellationId: con.body.id,
    name: 'Тестовый навык',
    level: 'Низкий (Начальный)',
  });
  assert.equal(star.status, 201);

  const resource = await auth(request(app).post('/api/admin/resources'), adminToken).send({
    starId: star.body.id,
    type: 'online',
    title: 'Тестовый курс',
    link: 'https://example.com/course',
  });
  assert.equal(resource.status, 201);

  const del = await auth(request(app).delete(`/api/admin/constellations/${con.body.id}`), adminToken);
  assert.equal(del.status, 200);

  const gone = await dbGet('SELECT id FROM stars WHERE id = ?', [star.body.id]);
  assert.equal(gone, undefined, 'deleting a constellation cascades to its stars');
});

test('REGRESSION: an edge that would create a cycle is rejected', async () => {
  const graph = await auth(request(app).get('/api/admin/graph'), adminToken);
  const chain = graph.body.stars
    .filter((s) => s.constellationId === graph.body.stars[0].constellationId)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // chain is already a -> b -> c ...; closing the loop must fail.
  const res = await auth(request(app).post('/api/admin/edges'), adminToken).send({
    parent: chain[chain.length - 1].id,
    child: chain[0].id,
  });
  assert.equal(res.status, 400, 'a cycle would permanently lock those skills');
});

test('a star cannot be linked to itself', async () => {
  const graph = await auth(request(app).get('/api/admin/graph'), adminToken);
  const id = graph.body.stars[0].id;
  const res = await auth(request(app).post('/api/admin/edges'), adminToken).send({ parent: id, child: id });
  assert.equal(res.status, 400);
});

test('admin can list registered users', async () => {
  const res = await auth(request(app).get('/api/admin/users'), adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.users.length >= 2);
  assert.ok(!JSON.stringify(res.body).includes('$2b$'), 'no password hashes in the user list');
});

test('REGRESSION: Cyrillic search works (SQLite LIKE is ASCII-only)', async () => {
  // `LIKE '%каз%'` never matches «Казань» in SQLite, so Russian queries used to
  // silently return nothing. Both search endpoints filter in JS instead.
  const cities = await request(app).get('/api/diagnostics/cities').query({ q: 'каз' });
  assert.equal(cities.status, 200);
  assert.ok(cities.body.cities.includes('Казань'), 'lowercase query must match a capitalised city');

  const users = await auth(request(app).get('/api/admin/users'), adminToken).query({ q: 'софия' });
  assert.equal(users.status, 200);
  assert.ok(
    users.body.users.some((u) => u.name === 'София'),
    'lowercase query must match a capitalised name'
  );
});

test('admin can add and remove a city', async () => {
  const name = `Тестоград-${Date.now()}`;

  const created = await auth(request(app).post('/api/admin/cities'), adminToken).send({ name });
  assert.equal(created.status, 201);

  const dup = await auth(request(app).post('/api/admin/cities'), adminToken).send({ name });
  assert.equal(dup.status, 409, 'duplicates are refused');

  const suggest = await request(app).get('/api/diagnostics/cities').query({ q: 'Тестоград' });
  assert.ok(suggest.body.cities.includes(name), 'a new city appears in the autocomplete');

  const removed = await auth(request(app).delete(`/api/admin/cities/${created.body.id}`), adminToken);
  assert.equal(removed.status, 200);

  const after = await request(app).get('/api/diagnostics/cities').query({ q: 'Тестоград' });
  assert.ok(!after.body.cities.includes(name), 'a removed city disappears from the autocomplete');
});

test('city management is admin-only', async () => {
  const anon = await request(app).get('/api/admin/cities');
  assert.equal(anon.status, 401);
  const asUser = await auth(request(app).get('/api/admin/cities'), demoToken);
  assert.equal(asUser.status, 403);
});

test('admin stats report curriculum health', async () => {
  const res = await auth(request(app).get('/api/admin/stats'), adminToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.starsWithoutResources, 0, 'every skill has learning resources');
  assert.equal(res.body.cycle, null, 'the seeded graph is acyclic');
});

/* ------------------------------------------------------------- validation */

test('invalid payloads produce 400 with field-level messages', async () => {
  const res = await auth(request(app).post('/api/admin/stars'), adminToken).send({
    constellationId: 'не число',
    name: 'x',
  });
  assert.equal(res.status, 400);
  assert.ok(Array.isArray(res.body.details), 'validation details are returned');
});

test('unknown API routes return JSON 404, not the SPA shell', async () => {
  const res = await request(app).get('/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'], /json/);
});

/* ------------------------------------------------------------------ venues */

test('каталог площадок отдаёт три корзины: свой город, другие, откуда угодно', async () => {
  const res = await auth(request(app).get('/api/venues').query({ key: 'computer-graphics' }), demoToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.city, 'Москва', 'город берётся из профиля');
  assert.ok(res.body.local.length > 0, 'в Москве есть площадки по графике');
  assert.ok(Array.isArray(res.body.elsewhere));
  assert.ok(Array.isArray(res.body.anywhere));

  for (const v of res.body.local) {
    assert.equal(v.city, 'Москва');
    assert.ok(v.directions.includes('computer-graphics'), 'в корзину попали только площадки этого направления');
  }
});

test('REGRESSION: в каталоге нет доменов-заглушек', async () => {
  const res = await auth(request(app).get('/api/venues'), demoToken);
  assert.equal(res.status, 200);
  const all = [...res.body.local, ...res.body.elsewhere, ...res.body.anywhere];
  // Прототип раздавал ссылки вида https://example-kvantorium.ru — выглядело
  // как настоящий каталог, вело в никуда.
  const fake = all.filter((v) => v.url && /(^|\.)(example|test|placeholder)[-.]/i.test(new URL(v.url).hostname));
  assert.equal(fake.length, 0, `выдуманные домены: ${fake.map((v) => v.url).join(', ')}`);
  assert.ok(all.every((v) => v.url), 'у каждой площадки есть ссылка');
});

test('REGRESSION: город запроса перекрывает город профиля', async () => {
  const res = await auth(
    request(app).get('/api/venues').query({ key: 'robotics', city: 'Новосибирск' }),
    demoToken
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.city, 'Новосибирск');
  assert.ok(res.body.local.length > 0, 'в Новосибирске есть робототехника');
  assert.ok(
    res.body.local.every((v) => v.city === 'Новосибирск'),
    'в «своём городе» только площадки этого города'
  );
  assert.ok(
    res.body.elsewhere.every((v) => v.city !== 'Новосибирск'),
    'город не дублируется в «других городах»'
  );
});

test('каждое направление покрыто хотя бы в десяти городах', async () => {
  // Ключи берём из самого приложения: список, переписанный руками, однажды уже
  // разошёлся с контентом на один символ, и целое направление осталось без
  // площадок, а тест этого не заметил.
  const state = await auth(request(app).get('/api/app-state'), demoToken);
  const keys = state.body.constellations.map((c) => c.key);
  assert.equal(keys.length, 14);
  const thin = [];
  for (const key of keys) {
    const res = await auth(request(app).get('/api/venues').query({ key }), demoToken);
    const all = [...res.body.local, ...res.body.elsewhere];
    const cities = new Set(all.map((v) => v.city));
    if (cities.size < 10) thin.push(`${key}: ${cities.size}`);
  }
  assert.equal(thin.length, 0, `направления с узким покрытием: ${thin.join(', ')}`);
});

test('в каждом из четырнадцати крупных городов есть хотя бы одна площадка', async () => {
  const cities = [
    'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород',
    'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону', 'Уфа', 'Красноярск', 'Пермь', 'Воронеж',
  ];
  const empty = [];
  for (const city of cities) {
    const res = await auth(request(app).get('/api/venues').query({ city }), demoToken);
    if (!res.body.local.length) empty.push(city);
  }
  assert.equal(empty.length, 0, `города без площадок: ${empty.join(', ')}`);
});

test('каталог закрыт для неавторизованных', async () => {
  const res = await request(app).get('/api/venues');
  assert.equal(res.status, 401);
});
