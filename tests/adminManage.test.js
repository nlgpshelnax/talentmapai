'use strict';

/**
 * Управление пользователями и магазином из админ-панели.
 *
 * Проверяем настоящую защитную позицию: роутеры adminUsers и adminStore
 * монтируются ровно так, как их смонтирует admin.js — за `requireAuth` и
 * `requireAdmin`. Отдельное приложение поднимается на той же изолированной базе
 * (временный файл через переменные окружения ДО require сервера, как в
 * security.test.js), поэтому ни один тест не касается боевых данных.
 *
 * Запуск: node --test tests/adminManage.test.js  (и вместе со всеми: npm test)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'talentmap-manage-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(TMP, 'manage.db');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.JWT_SECRET = 'manage-test-secret-that-is-long-enough-00000000';

const express = require('express');
const request = require('supertest');

const { createSchema } = require('../src/db/schema');
const { seedAll } = require('../src/db/seed');
const { dbGet, dbAll, dbRun, close } = require('../src/db');
const { errorHandler } = require('../src/middleware/error');
const { requireAuth, requireAdmin } = require('../src/middleware/auth');
const authRouter = require('../src/routes/auth');
const adminUsers = require('../src/routes/adminUsers');
const adminStore = require('../src/routes/adminStore');

/**
 * Мини-приложение, повторяющее монтирование из admin.js: сначала общий шлюз,
 * затем роутеры. `/api/auth` нужен, чтобы получать настоящие токены через вход.
 */
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/admin/users', requireAuth, requireAdmin, adminUsers);
app.use('/api/admin/store', requireAuth, requireAdmin, adminStore);
app.use(errorHandler);

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const uniqueEmail = (tag) => `mng-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

let adminToken;
let adminId;
let userToken;
let userId;

/** Зарегистрировать обычного пользователя, вернуть { id, token }. */
async function registerUser(name = 'Тест') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email: uniqueEmail('u'), password: 'password123' });
  assert.equal(res.status, 201, 'регистрация должна проходить');
  return { id: res.body.user.id, token: res.body.token };
}

test.before(async () => {
  await createSchema();
  await seedAll();

  // Штатный админ из сидера.
  const admin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@talentmap.ai', password: 'admin12345' });
  assert.equal(admin.status, 200, 'админ должен входить');
  adminToken = admin.body.token;
  adminId = admin.body.user.id;

  const u = await registerUser('Обычный');
  userId = u.id;
  userToken = u.token;
});

test.after(async () => {
  await close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

/* ═══════════════════════════════════════════════ доступ (403 для не-админа) */

test('не-админ получает 403 на всех управляющих эндпоинтах', async () => {
  const item = await dbGet('SELECT id FROM store_items LIMIT 1');
  const attempts = [
    ['get', '/api/admin/users'],
    ['patch', `/api/admin/users/${userId}`],
    ['post', `/api/admin/users/${userId}/reset-password`],
    ['post', `/api/admin/users/${userId}/revoke-sessions`],
    ['delete', `/api/admin/users/${userId}`],
    ['get', '/api/admin/store'],
    ['post', '/api/admin/store'],
    ['put', `/api/admin/store/${item.id}`],
    ['delete', `/api/admin/store/${item.id}`],
  ];
  for (const [method, url] of attempts) {
    const res = await auth(request(app)[method](url), userToken).send({});
    assert.equal(res.status, 403, `${method.toUpperCase()} ${url} пустил обычного пользователя (${res.status})`);
  }
});

test('без токена управляющие эндпоинты отвечают 401', async () => {
  const res = await request(app).get('/api/admin/users');
  assert.equal(res.status, 401);
});

/* ═══════════════════════════════════════════════ поиск и список */

test('кириллический поиск по имени работает (LIKE в SQLite так не умеет)', async () => {
  const name = `Иван Кириллов ${Date.now()}`;
  await registerUser(name);

  // Ищем по подстроке в НИЖНЕМ регистре — именно это ломает SQLite lower().
  const res = await auth(request(app).get('/api/admin/users').query({ q: 'иван кир' }), adminToken);
  assert.equal(res.status, 200);
  const found = res.body.users.some((u) => u.name === name);
  assert.ok(found, 'кириллический поиск не нашёл пользователя');
});

test('поиск в другом регистре тоже находит', async () => {
  const name = `София Разумовская ${Date.now()}`;
  await registerUser(name);
  const res = await auth(request(app).get('/api/admin/users').query({ q: 'РАЗУМ' }), adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.users.some((u) => u.name === name), 'поиск чувствителен к регистру кириллицы');
});

test('фильтр по роли и пагинация отвечают согласованно', async () => {
  const res = await auth(request(app).get('/api/admin/users').query({ role: 'parent', page: 1, pageSize: 5 }), adminToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.users.length <= 5, 'pageSize не ограничил выдачу');
  assert.ok(res.body.users.every((u) => u.role === 'parent'), 'в выдаче есть не-parent');
  assert.equal(typeof res.body.total, 'number');
  assert.equal(typeof res.body.pages, 'number');
});

test('список не отдаёт хеши паролей', async () => {
  const res = await auth(request(app).get('/api/admin/users'), adminToken);
  const body = JSON.stringify(res.body);
  assert.ok(!body.includes('$2b$'), 'в ответе оказался хеш bcrypt');
  assert.ok(!/"password"/.test(body), 'в ответе оказалось поле пароля');
});

/* ═══════════════════════════════════════════════ правка пользователя */

test('админ меняет роль, подписку и опыт', async () => {
  const { id } = await registerUser('Правимый');
  const res = await auth(request(app).patch(`/api/admin/users/${id}`), adminToken).send({
    role: 'child',
    subscription_status: 'pro',
    xp_points: 777,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'child');
  assert.equal(res.body.user.subscription, 'pro');
  assert.equal(res.body.user.xp, 777);

  const row = await dbGet('SELECT role, subscription_status, xp_points FROM users WHERE id = ?', [id]);
  assert.equal(row.role, 'child');
  assert.equal(row.subscription_status, 'pro');
  assert.equal(row.xp_points, 777);
});

test('админ может выдать и снять права другому пользователю', async () => {
  const { id } = await registerUser('Кандидат');
  const grant = await auth(request(app).patch(`/api/admin/users/${id}`), adminToken).send({ is_admin: true });
  assert.equal(grant.status, 200);
  assert.equal(grant.body.user.isAdmin, true);

  const revoke = await auth(request(app).patch(`/api/admin/users/${id}`), adminToken).send({ is_admin: false });
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.user.isAdmin, false);
});

/* ═══════════════════════════════════════════════ предохранители */

test('админ не может снять админ-права с самого себя', async () => {
  const res = await auth(request(app).patch(`/api/admin/users/${adminId}`), adminToken).send({ is_admin: false });
  assert.equal(res.status, 400);
  const row = await dbGet('SELECT is_admin FROM users WHERE id = ?', [adminId]);
  assert.equal(row.is_admin, 1, 'админ разжаловал сам себя');
});

test('админ не может удалить собственный аккаунт', async () => {
  const res = await auth(request(app).delete(`/api/admin/users/${adminId}`), adminToken);
  assert.equal(res.status, 400);
  const row = await dbGet('SELECT id FROM users WHERE id = ?', [adminId]);
  assert.ok(row, 'админ удалил сам себя');
});

/**
 * Инвариант «последний админ неприкосновенен». Эти тесты приводят систему к
 * состоянию «ровно один администратор» и проверяют, что его нельзя ни
 * разжаловать, ни удалить. Каждый тест восстанавливает сидерского админа в
 * конце, чтобы не влиять на соседей.
 */

/** Сделать сидерского админа единственным; вернуть число админов до этого. */
async function reduceToSingleAdmin() {
  await dbRun('UPDATE users SET is_admin = 0 WHERE id != ?', [adminId]);
  await dbRun('UPDATE users SET is_admin = 1 WHERE id = ?', [adminId]);
  const { n } = await dbGet('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1');
  assert.equal(n, 1, 'подготовка: должен остаться ровно один админ');
}

test('последнего администратора нельзя разжаловать', async () => {
  await reduceToSingleAdmin();
  const res = await auth(request(app).patch(`/api/admin/users/${adminId}`), adminToken).send({ is_admin: false });
  assert.equal(res.status, 400, 'последнего админа разжаловали');
  assert.equal((await dbGet('SELECT is_admin FROM users WHERE id = ?', [adminId])).is_admin, 1);
  assert.equal((await dbGet('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1')).n, 1, 'система осталась без админов');
});

test('последнего администратора нельзя удалить', async () => {
  await reduceToSingleAdmin();
  const res = await auth(request(app).delete(`/api/admin/users/${adminId}`), adminToken);
  assert.equal(res.status, 400, 'последнего админа удалили');
  assert.ok(await dbGet('SELECT id FROM users WHERE id = ?', [adminId]), 'последний админ исчез');
});

test('пока админов двое, одного из них разжаловать можно (не последний)', async () => {
  // Готовим ровно двух админов: сидерского и «второго».
  await reduceToSingleAdmin();
  const second = await registerUser('Второй админ');
  await dbRun('UPDATE users SET is_admin = 1 WHERE id = ?', [second.id]);
  assert.equal((await dbGet('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1')).n, 2, 'подготовка: два админа');

  // Сидерский админ снимает права со второго — тот не последний, значит успех.
  const res = await auth(request(app).patch(`/api/admin/users/${second.id}`), adminToken).send({ is_admin: false });
  assert.equal(res.status, 200, 'разжалование не-последнего админа должно проходить');
  assert.equal((await dbGet('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1')).n, 1, 'должен остаться один админ');

  // Теперь сидерский — последний, и снять с него права уже нельзя.
  const guard = await auth(request(app).patch(`/api/admin/users/${adminId}`), adminToken).send({ is_admin: false });
  assert.equal(guard.status, 400, 'после разжалования второго последнего защита не сработала');
});

/* ═══════════════════════════════════════════════ сброс пароля и сессии */

test('сброс пароля возвращает новый пароль один раз и обрывает старые токены', async () => {
  const email = uniqueEmail('reset');
  const reg = await request(app).post('/api/auth/register').send({ name: 'Забывчивый', email, password: 'password123' });
  const oldToken = reg.body.token;
  const targetId = reg.body.user.id;

  // Старый токен работает (проверяем на /api/auth/me).
  assert.equal((await auth(request(app).get('/api/auth/me'), oldToken)).status, 200);

  const reset = await auth(request(app).post(`/api/admin/users/${targetId}/reset-password`), adminToken);
  assert.equal(reset.status, 200);
  assert.ok(typeof reset.body.password === 'string' && reset.body.password.length >= 12, 'пароль не возвращён');

  // Старый токен обязан умереть немедленно (сдвиг поколения через revokeSessions).
  const after = await auth(request(app).get('/api/auth/me'), oldToken);
  assert.equal(after.status, 401, 'старый токен пережил сброс пароля');

  // Новым паролем можно войти.
  const relogin = await request(app).post('/api/auth/login').send({ email, password: reset.body.password });
  assert.equal(relogin.status, 200, 'сгенерированный пароль не подошёл для входа');

  // Старым паролем войти уже нельзя.
  const oldLogin = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  assert.equal(oldLogin.status, 400, 'старый пароль всё ещё действует');
});

test('пароль каждого сброса разный (генерация случайна)', async () => {
  const a = await auth(request(app).post(`/api/admin/users/${userId}/reset-password`), adminToken);
  const b = await auth(request(app).post(`/api/admin/users/${userId}/reset-password`), adminToken);
  assert.notEqual(a.body.password, b.body.password, 'два сброса вернули одинаковый пароль');
});

test('принудительный выход обрывает выданные токены', async () => {
  const reg = await request(app).post('/api/auth/register').send({ name: 'Сессия', email: uniqueEmail('rev'), password: 'password123' });
  const token = reg.body.token;
  assert.equal((await auth(request(app).get('/api/auth/me'), token)).status, 200);

  const revoke = await auth(request(app).post(`/api/admin/users/${reg.body.user.id}/revoke-sessions`), adminToken);
  assert.equal(revoke.status, 200);

  assert.equal((await auth(request(app).get('/api/auth/me'), token)).status, 401, 'токен пережил принудительный выход');
});

/* ═══════════════════════════════════════════════ удаление без сирот */

test('удаление пользователя не оставляет строк ни в одной связанной таблице', async () => {
  // Заводим пользователя и наполняем все связанные таблицы.
  const { id } = await registerUser('Удаляемый');
  const star = await dbGet('SELECT id FROM stars LIMIT 1');
  const item = await dbGet('SELECT id FROM store_items LIMIT 1');

  await dbRun('INSERT INTO user_progress (user_id, star_id) VALUES (?, ?)', [id, star.id]);
  await dbRun('INSERT INTO portfolio (user_id, title, image) VALUES (?, ?, ?)', [id, 'Работа', '/uploads/none.png']);
  await dbRun('INSERT INTO history_logs (user_id, log_text) VALUES (?, ?)', [id, 'событие']);
  await dbRun('INSERT INTO purchases (user_id, item_id) VALUES (?, ?)', [id, item.id]);
  await dbRun('INSERT INTO diagnostics_results (user_id, answers, profile) VALUES (?, ?, ?)', [id, '{}', '{}']);

  const del = await auth(request(app).delete(`/api/admin/users/${id}`), adminToken);
  assert.equal(del.status, 200);

  for (const table of ['user_progress', 'portfolio', 'history_logs', 'purchases', 'diagnostics_results']) {
    const row = await dbGet(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, [id]);
    assert.equal(row.n, 0, `после удаления остались строки в ${table}`);
  }
  const gone = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
  assert.ok(!gone, 'пользователь не удалён');
});

test('удаление пользователя снимает его файлы портфолио с диска', async () => {
  fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
  const fileName = `test-${Date.now()}.png`;
  const filePath = path.join(process.env.UPLOAD_DIR, fileName);
  fs.writeFileSync(filePath, 'fake-png-bytes');

  const { id } = await registerUser('С файлом');
  await dbRun('INSERT INTO portfolio (user_id, title, image) VALUES (?, ?, ?)', [id, 'Работа', `/uploads/${fileName}`]);

  assert.ok(fs.existsSync(filePath), 'подготовка: файл должен существовать');
  const del = await auth(request(app).delete(`/api/admin/users/${id}`), adminToken);
  assert.equal(del.status, 200);
  assert.ok(!fs.existsSync(filePath), 'файл портфолио остался на диске после удаления пользователя');
});

/* ═══════════════════════════════════════════════ CRUD магазина */

test('магазин: полный цикл создания, чтения, правки', async () => {
  const code = `test_item_${Date.now()}`;
  const create = await auth(request(app).post('/api/admin/store'), adminToken).send({
    code,
    title: 'Тестовый аватар',
    description: 'Описание',
    price: 120,
    type: 'avatar',
    icon: '🐱',
    payload: '🐱',
  });
  assert.equal(create.status, 201);
  const id = create.body.item.id;
  assert.equal(create.body.item.owners, 0);
  assert.equal(create.body.item.sortOrder >= 0, true);

  const list = await auth(request(app).get('/api/admin/store'), adminToken);
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((i) => i.id === id && i.code === code), 'созданный товар не в списке');

  const upd = await auth(request(app).put(`/api/admin/store/${id}`), adminToken).send({ price: 999, title: 'Новое имя' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.item.price, 999);
  assert.equal(upd.body.item.title, 'Новое имя');

  const del = await auth(request(app).delete(`/api/admin/store/${id}`), adminToken);
  assert.equal(del.status, 200);
  const gone = await dbGet('SELECT id FROM store_items WHERE id = ?', [id]);
  assert.ok(!gone, 'товар без покупок не удалился');
});

test('магазин: дублирующийся код отклоняется', async () => {
  const code = `dup_${Date.now()}`;
  const first = await auth(request(app).post('/api/admin/store'), adminToken).send({
    code, title: 'Первый', price: 10, type: 'title', icon: '⭐', payload: 'Титул',
  });
  assert.equal(first.status, 201);
  const second = await auth(request(app).post('/api/admin/store'), adminToken).send({
    code, title: 'Второй', price: 20, type: 'title', icon: '⭐', payload: 'Титул2',
  });
  assert.equal(second.status, 409, 'дубликат кода прошёл');
});

test('магазин: показывает число владельцев по товару', async () => {
  const create = await auth(request(app).post('/api/admin/store'), adminToken).send({
    code: `owned_${Date.now()}`, title: 'Со владельцем', price: 10, type: 'frame', icon: '🖼️', payload: 'gold',
  });
  const id = create.body.item.id;
  const buyer = await registerUser('Покупатель');
  await dbRun('INSERT INTO purchases (user_id, item_id) VALUES (?, ?)', [buyer.id, id]);

  const list = await auth(request(app).get('/api/admin/store'), adminToken);
  const row = list.body.items.find((i) => i.id === id);
  assert.equal(row.owners, 1, 'число владельцев посчитано неверно');
});

test('магазин: РЕШЕНИЕ — купленный товар удалить нельзя (409 с числом владельцев)', async () => {
  const create = await auth(request(app).post('/api/admin/store'), adminToken).send({
    code: `locked_${Date.now()}`, title: 'Купленный', price: 10, type: 'avatar', icon: '👽', payload: '👽',
  });
  const id = create.body.item.id;
  const buyer = await registerUser('Владелец');
  await dbRun('INSERT INTO purchases (user_id, item_id) VALUES (?, ?)', [buyer.id, id]);

  const del = await auth(request(app).delete(`/api/admin/store/${id}`), adminToken);
  assert.equal(del.status, 409, 'купленный товар удалился — покупки осиротели бы');

  // Товар и покупка на месте.
  assert.ok(await dbGet('SELECT id FROM store_items WHERE id = ?', [id]), 'товар исчез, несмотря на отказ');
  assert.ok(await dbGet('SELECT id FROM purchases WHERE item_id = ?', [id]), 'покупка исчезла');
});

test('магазин: изменение цены не трогает уже совершённые покупки', async () => {
  const create = await auth(request(app).post('/api/admin/store'), adminToken).send({
    code: `price_${Date.now()}`, title: 'Ценник', price: 100, type: 'avatar', icon: '🤖', payload: '🤖',
  });
  const id = create.body.item.id;
  const buyer = await registerUser('Купил за 100');
  await dbRun('UPDATE users SET xp_points = 500 WHERE id = ?', [buyer.id]);
  await dbRun('INSERT INTO purchases (user_id, item_id) VALUES (?, ?)', [buyer.id, id]);
  const xpBefore = (await dbGet('SELECT xp_points FROM users WHERE id = ?', [buyer.id])).xp_points;

  const upd = await auth(request(app).put(`/api/admin/store/${id}`), adminToken).send({ price: 400 });
  assert.equal(upd.status, 200);

  const xpAfter = (await dbGet('SELECT xp_points FROM users WHERE id = ?', [buyer.id])).xp_points;
  assert.equal(xpAfter, xpBefore, 'изменение цены задним числом тронуло опыт владельца');
  // Покупка не задвоилась и осталась одна.
  assert.equal((await dbGet('SELECT COUNT(*) AS n FROM purchases WHERE item_id = ? AND user_id = ?', [id, buyer.id])).n, 1);
});
