'use strict';

/**
 * Тесты раздела управления площадками (src/routes/adminVenues.js).
 *
 * Роутер ещё не смонтирован в основном приложении (это сделает родитель), поэтому
 * поднимаем маленькое Express-приложение прямо здесь и вешаем роутер ЗА
 * `requireAuth` + `requireAdmin` — ровно так, как он будет смонтирован в бою. Это
 * заодно проверяет настоящую защиту доступа, а не только бизнес-логику.
 *
 * Бутстрап такой же, как в tests/security.test.js: временная база и переменные
 * окружения выставляются ДО первого require серверного кода.
 *
 * Запуск: node --test tests/adminVenues.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'talentmap-venues-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(TMP, 'venues.db');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.JWT_SECRET = 'venues-test-secret-that-is-long-enough-0000000000';

const express = require('express');
const request = require('supertest');

// Приложение-хост поднимаем сами — маршрут /api/auth нужен, чтобы получить
// настоящие токены (admin и обычный пользователь).
const { app } = require('../server');
const { createSchema } = require('../src/db/schema');
const { seedAll } = require('../src/db/seed');
const { dbGet, close } = require('../src/db');

const { requireAuth, requireAdmin } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/error');
const adminVenues = require('../src/routes/adminVenues');

// Отдельное маленькое приложение с нашим роутером за настоящей защитой.
const venuesApp = express();
venuesApp.use(express.json());
venuesApp.use('/api/admin/venues', requireAuth, requireAdmin, adminVenues);
venuesApp.use(errorHandler);

let adminToken;
let userToken;

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const av = (method, url) => request(venuesApp)[method](url);

test.before(async () => {
  await createSchema();
  await seedAll();

  const admin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@talentmap.ai', password: 'admin12345' });
  assert.equal(admin.status, 200, 'админ должен входить');
  adminToken = admin.body.token;

  const user = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Обычный', email: `venue-user-${Date.now()}@example.com`, password: 'password123' });
  assert.equal(user.status, 201);
  userToken = user.body.token;
});

test.after(async () => {
  await close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

/* ════════════════════════════════════════════════ доступ */

test('не-администратор получает 403 на списке площадок', async () => {
  const anon = await av('get', '/api/admin/venues');
  assert.equal(anon.status, 401, 'аноним должен получить 401');

  const asUser = await auth(av('get', '/api/admin/venues'), userToken);
  assert.equal(asUser.status, 403, 'обычный пользователь не должен видеть каталог');

  const asUserWrite = await auth(av('post', '/api/admin/venues'), userToken).send({
    name: 'Пиратский центр',
    city: 'Москва',
    url: 'https://example.org',
    directions: ['robotics'],
  });
  assert.equal(asUserWrite.status, 403, 'обычный пользователь не должен создавать площадки');
});

/* ════════════════════════════════════════════════ meta для формы */

test('meta отдаёт направления с названиями, города и справочники', async () => {
  const res = await auth(av('get', '/api/admin/venues/meta'), adminToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.directions) && res.body.directions.length >= 14);
  const robotics = res.body.directions.find((d) => d.key === 'robotics');
  assert.ok(robotics && robotics.name, 'у направления есть человеческое название, а не только ключ');
  assert.ok(res.body.cities.includes('Казань'), 'среди городов есть уже используемые');
  assert.ok(res.body.kinds.includes('state') && res.body.formats.includes('offline'));
});

/* ════════════════════════════════════════════════ жизненный цикл */

test('создание → обновление → удаление проходят полный круг', async () => {
  // create
  const created = await auth(av('post', '/api/admin/venues'), adminToken).send({
    network: 'Мой Кружок',
    name: 'Центр робототехники «Шестерёнка»',
    org: 'ООО «Шестерёнка»',
    city: 'Владимир',
    address: 'ул. Мира, д. 5',
    url: 'https://shesterenka-club.ru',
    kind: 'commercial',
    format: 'offline',
    priceNote: 'от 3000 ₽/мес',
    ageRange: '7–14 лет',
    summary: 'Занятия робототехникой и программированием для школьников.',
    directions: ['robotics', 'programming-web'],
    verified: true,
  });
  assert.equal(created.status, 201, `ожидали 201, тело: ${JSON.stringify(created.body)}`);
  assert.ok(created.body.id, 'вернулся id');
  assert.equal(created.body.venue.city, 'Владимир');
  assert.equal(created.body.venue.verified, true, 'флаг «проверено» сохранён как передан');
  assert.deepEqual(created.body.venue.directions, ['robotics', 'programming-web']);
  // Код сгенерирован транслитом из сети и города.
  assert.match(created.body.venue.code, /__vladimir$/, `код построен из города, получено: ${created.body.venue.code}`);
  const id = created.body.id;

  // update (частичный): меняем название, город и направления
  const updated = await auth(av('put', `/api/admin/venues/${id}`), adminToken).send({
    name: 'Центр робототехники «Шестерёнка+»',
    city: 'Суздаль',
    directions: ['robotics'],
    verified: false,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.venue.name, 'Центр робототехники «Шестерёнка+»');
  assert.equal(updated.body.venue.city, 'Суздаль');
  assert.equal(updated.body.venue.verified, false, 'флаг «проверено» можно снять');
  assert.deepEqual(updated.body.venue.directions, ['robotics']);

  // в базе действительно обновилось
  const row = await dbGet('SELECT name, city, verified FROM venues WHERE id = ?', [id]);
  assert.equal(row.city, 'Суздаль');
  assert.equal(row.verified, 0);

  // delete
  const removed = await auth(av('delete', `/api/admin/venues/${id}`), adminToken);
  assert.equal(removed.status, 200);
  const gone = await dbGet('SELECT id FROM venues WHERE id = ?', [id]);
  assert.equal(gone, undefined, 'площадка удалена из базы');

  // повторное удаление — 404
  const again = await auth(av('delete', `/api/admin/venues/${id}`), adminToken);
  assert.equal(again.status, 404);
});

/* ════════════════════════════════════════════════ кириллический поиск */

test('REGRESSION: поиск по «каз» находит «Казань» (SQLite LIKE — только ASCII)', async () => {
  // Строчный запрос обязан совпасть с городом с заглавной буквы. В SQLite
  // `LIKE '%каз%'` этого не делает, поэтому фильтрация идёт в JS.
  const res = await auth(av('get', '/api/admin/venues'), adminToken).query({ q: 'каз', pageSize: 200 });
  assert.equal(res.status, 200);
  assert.ok(res.body.total > 0, 'поиск по подстроке названия/города должен что-то найти');
  assert.ok(
    res.body.venues.some((v) => v.city === 'Казань' || /каз/i.test(v.name) || /каз/i.test(v.org || '')),
    'среди результатов есть площадка, связанная с «Казань»'
  );

  // Фильтр по городу тоже нечувствителен к регистру и работает с кириллицей.
  const byCity = await auth(av('get', '/api/admin/venues'), adminToken).query({ city: 'казань', pageSize: 200 });
  assert.equal(byCity.status, 200);
  assert.ok(byCity.body.total > 0, 'фильтр по городу «казань» находит площадки');
  assert.ok(byCity.body.venues.every((v) => v.city === 'Казань'), 'в выборку попал только запрошенный город');
});

test('фильтр по направлению и статусу «проверено» работает', async () => {
  const byDir = await auth(av('get', '/api/admin/venues'), adminToken).query({ direction: 'robotics', pageSize: 200 });
  assert.equal(byDir.status, 200);
  assert.ok(byDir.body.total > 0);
  assert.ok(byDir.body.venues.every((v) => v.directions.includes('robotics')), 'только площадки этого направления');

  const verified = await auth(av('get', '/api/admin/venues'), adminToken).query({ verified: '1', pageSize: 200 });
  assert.equal(verified.status, 200);
  assert.ok(verified.body.venues.every((v) => v.verified === true), 'только проверенные');
});

test('пагинация ограничивает выдачу и сообщает общее число', async () => {
  const res = await auth(av('get', '/api/admin/venues'), adminToken).query({ page: 1, pageSize: 5 });
  assert.equal(res.status, 200);
  assert.ok(res.body.total >= 150, 'в засеянном каталоге больше сотни площадок');
  assert.equal(res.body.venues.length, 5, 'страница ограничена pageSize');
  assert.equal(res.body.page, 1);
  assert.ok(res.body.pages > 1, 'страниц больше одной');
});

/* ════════════════════════════════════════════════ валидация */

test('ссылка javascript: отклоняется', async () => {
  for (const url of ['javascript:alert(document.cookie)', 'JaVaScRiPt:alert(1)', '//evil.example.com/steal']) {
    const res = await auth(av('post', '/api/admin/venues'), adminToken).send({
      name: 'Площадка со злой ссылкой',
      city: 'Москва',
      url,
      directions: ['robotics'],
    });
    assert.equal(res.status, 400, `опасная ссылка прошла проверку: ${url}`);
  }
});

test('неизвестный ключ направления отклоняется с указанием ключа', async () => {
  const res = await auth(av('post', '/api/admin/venues'), adminToken).send({
    name: 'Площадка с опечаткой в направлении',
    city: 'Москва',
    url: 'https://realsite.ru',
    directions: ['robotics', 'robtics-typo'],
  });
  assert.equal(res.status, 400, 'выдуманное направление должно отклоняться');
  assert.ok(/robtics-typo/.test(res.body.error), `ошибка должна называть плохой ключ, получено: ${res.body.error}`);
});

test('пустой список направлений отклоняется', async () => {
  const res = await auth(av('post', '/api/admin/venues'), adminToken).send({
    name: 'Площадка без направлений',
    city: 'Москва',
    url: 'https://realsite.ru',
    directions: [],
  });
  assert.equal(res.status, 400, 'без направлений площадка не имеет смысла');
});

test('город обязателен', async () => {
  const res = await auth(av('post', '/api/admin/venues'), adminToken).send({
    name: 'Площадка без города',
    url: 'https://realsite.ru',
    directions: ['robotics'],
  });
  assert.equal(res.status, 400);
});

test('пустой адрес допустим — его нельзя выдумывать', async () => {
  const res = await auth(av('post', '/api/admin/venues'), adminToken).send({
    network: 'Онлайн-школа',
    name: 'Онлайн-курс без адреса',
    city: 'Онлайн',
    url: 'https://realsite-online.ru',
    format: 'online',
    directions: ['programming-web'],
    // address намеренно не передан
  });
  assert.equal(res.status, 201, `пустой адрес должен приниматься, тело: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.venue.address, null, 'адрес остаётся пустым, а не выдуманным');

  await auth(av('delete', `/api/admin/venues/${res.body.id}`), adminToken);
});

/* ════════════════════════════════════════════════ дубли кода */

test('код подбирается сам, а явный дубль отвергается', async () => {
  const payload = {
    network: 'Дубль-сеть',
    name: 'Первая площадка',
    city: 'Тестоград',
    url: 'https://realsite-dup.ru',
    directions: ['robotics'],
  };

  const first = await auth(av('post', '/api/admin/venues'), adminToken).send(payload);
  assert.equal(first.status, 201);
  const firstId = first.body.id;
  const code = first.body.venue.code;

  /**
   * Вторая площадка той же сети в том же городе даёт ту же основу кода.
   * Раньше это была ошибка 409 — и она ставила администратора в тупик: он
   * добавляет второй филиал «Кванториума» в Казани, а система отказывает,
   * ссылаясь на код, которого он никогда не видел и не задавал. Теперь
   * свободный код подбирается сам.
   */
  const second = await auth(av('post', '/api/admin/venues'), adminToken).send({
    ...payload,
    name: 'Вторая площадка',
  });
  assert.equal(second.status, 201, 'второй филиал в том же городе должен добавляться');
  assert.notEqual(second.body.venue.code, code, 'коды двух площадок совпали');

  // Явно присланный код-дубль — по-прежнему 409: это осознанный ввод человека,
  // и молча подменять его на другой было бы обманом.
  const dupExplicit = await auth(av('post', '/api/admin/venues'), adminToken).send({
    ...payload,
    name: 'Третья площадка',
    code,
  });
  assert.equal(dupExplicit.status, 409);

  await auth(av('delete', `/api/admin/venues/${second.body.id}`), adminToken);
  await auth(av('delete', `/api/admin/venues/${firstId}`), adminToken);
});

/* ════════════════════════════════════════════════ разметка в тексте */

test('разметка вырезается из названия площадки', async () => {
  const res = await auth(av('post', '/api/admin/venues'), adminToken).send({
    name: '<img src=x onerror=alert(1)>Центр',
    city: 'Москва',
    url: 'https://realsite-xss.ru',
    directions: ['robotics'],
  });
  assert.equal(res.status, 201);
  assert.ok(!res.body.venue.name.includes('<'), `в названии осталась разметка: ${res.body.venue.name}`);
  assert.ok(!/onerror/i.test(res.body.venue.name), 'в названии остался обработчик события');

  await auth(av('delete', `/api/admin/venues/${res.body.id}`), adminToken);
});
