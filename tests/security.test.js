'use strict';

/**
 * Проверки безопасности.
 *
 * Каждый тест здесь — это попытка провести настоящую атаку. Отличие от
 * обычного набора в том, что тут не проверяется «работает ли функция»:
 * проверяется, что закрытая дыра осталась закрытой. Если кто-то однажды
 * упростит код и вернёт уязвимость, упадёт именно этот файл.
 *
 * Запуск: npm test (файл подхватывается вместе с остальными)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const jwt = require('jsonwebtoken');
const net = require('node:net');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'talentmap-sec-'));
process.env.NODE_ENV = 'test';
process.env.DB_PATH = path.join(TMP, 'sec.db');
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.JWT_SECRET = 'security-test-secret-that-is-long-enough-000000';

const request = require('supertest');
const { app } = require('../server');
const config = require('../src/config');
const { createSchema } = require('../src/db/schema');
const { seedAll } = require('../src/db/seed');
const { dbGet, dbRun, close } = require('../src/db');

let demoToken;
let demoId;
let adminToken;
let victimToken;
let victimId;

const auth = (req, token) => req.set('Authorization', `Bearer ${token}`);
const uniqueEmail = (tag) => `sec-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test.before(async () => {
  await createSchema();
  await seedAll();

  const demo = await request(app).post('/api/auth/login').send({ email: 'demo@talentmap.ai', password: 'demo123' });
  assert.equal(demo.status, 200, 'демо-аккаунт должен входить');
  demoToken = demo.body.token;
  demoId = demo.body.user.id;

  const admin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@talentmap.ai', password: 'admin12345' });
  assert.equal(admin.status, 200);
  adminToken = admin.body.token;

  const victim = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Жертва', email: uniqueEmail('victim'), password: 'password123' });
  assert.equal(victim.status, 201);
  victimToken = victim.body.token;
  victimId = victim.body.user.id;
});

test.after(async () => {
  await close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

/* ══════════════════════════════════════════════ подделка токенов */

test('токен, подписанный чужим ключом, отвергается', async () => {
  const forged = jwt.sign({ userId: demoId, v: 0 }, 'ключ-которого-у-сервера-нет', { expiresIn: '1h' });
  const res = await auth(request(app).get('/api/auth/me'), forged);
  assert.equal(res.status, 401);
});

test('REGRESSION: токен с алгоритмом none не принимается', async () => {
  // Классическая атака: подписи нет вовсе, алгоритм объявлен как none.
  // Проверяющая сторона обязана требовать конкретный алгоритм, а не верить
  // тому, который назван в самом токене.
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId: demoId, v: 0, exp: 2 ** 31 })).toString('base64url');
  const res = await auth(request(app).get('/api/auth/me'), `${header}.${payload}.`);
  assert.equal(res.status, 401);
});

test('REGRESSION: смена пароля обрывает все ранее выданные сессии', async () => {
  const email = uniqueEmail('rotate');
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Ротация', email, password: 'password123' });
  const oldToken = reg.body.token;

  // Старый токен работает.
  assert.equal((await auth(request(app).get('/api/auth/me'), oldToken)).status, 200);

  const changed = await auth(request(app).post('/api/auth/change-password'), oldToken).send({
    currentPassword: 'password123',
    newPassword: 'совершенно-другой-пароль-1',
  });
  assert.equal(changed.status, 200);

  // Смысл смены пароля — выгнать того, кто увёл сессию. Старый токен обязан
  // умереть немедленно, а не дожить до конца своего трёхсуточного срока.
  const afterChange = await auth(request(app).get('/api/auth/me'), oldToken);
  assert.equal(afterChange.status, 401, 'старый токен продолжает работать после смены пароля');

  // Новый токен, выданный в том же ответе, работать обязан.
  assert.equal((await auth(request(app).get('/api/auth/me'), changed.body.token)).status, 200);
});

test('токен с чужим номером поколения не принимается', async () => {
  const forged = jwt.sign({ userId: demoId, v: 999 }, config.jwt.secret, { algorithm: 'HS256', expiresIn: '1h' });
  const res = await auth(request(app).get('/api/auth/me'), forged);
  assert.equal(res.status, 401);
});

/* ══════════════════════════════════════════════ чужие данные */

test('REGRESSION: нельзя прочитать чужой аккаунт, подставив номер в запрос', async () => {
  for (const attempt of [
    request(app).get('/api/app-state').query({ userId: victimId }),
    request(app).get('/api/portfolio').query({ userId: victimId }),
  ]) {
    const res = await auth(attempt, demoToken);
    assert.equal(res.status, 200);
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('Жертва'), 'в ответе оказались данные чужого аккаунта');
  }
});

test('обычный пользователь не проходит в администраторские маршруты', async () => {
  for (const [method, url] of [
    ['get', '/api/admin/graph'],
    ['get', '/api/admin/users'],
    ['get', '/api/admin/stats'],
  ]) {
    const res = await auth(request(app)[method](url), demoToken);
    assert.equal(res.status, 403, `${url} пустил обычного пользователя`);
  }
});

test('признак администратора нельзя выставить себе через профиль', async () => {
  await auth(request(app).patch('/api/users/profile'), demoToken).send({
    name: 'Хитрец',
    is_admin: 1,
    isAdmin: true,
    role: 'parent',
  });
  const row = await dbGet('SELECT is_admin FROM users WHERE id = ?', [demoId]);
  assert.equal(row.is_admin, 0, 'пользователь выдал себе права администратора');
});

test('опыт и подписку нельзя назначить себе запросом', async () => {
  const before = await dbGet('SELECT xp_points, subscription_status FROM users WHERE id = ?', [demoId]);
  await auth(request(app).patch('/api/users/profile'), demoToken).send({
    xp_points: 999999,
    xp: 999999,
    subscription_status: 'pro',
  });
  const after = await dbGet('SELECT xp_points, subscription_status FROM users WHERE id = ?', [demoId]);
  assert.equal(after.xp_points, before.xp_points);
  assert.equal(after.subscription_status, before.subscription_status);
});

/* ══════════════════════════════════════════════ подбор паролей */

test('REGRESSION: серия неудачных входов блокирует подбор по этой почте', async () => {
  const email = uniqueEmail('brute');
  await request(app).post('/api/auth/register').send({ name: 'Цель', email, password: 'password123' });

  const { maxAttempts } = config.lockout;
  let blockedAt = 0;

  for (let i = 1; i <= maxAttempts + 2; i++) {
    const res = await request(app).post('/api/auth/login').send({ email, password: `неверный-${i}` });
    if (res.status === 429) {
      blockedAt = i;
      break;
    }
    assert.equal(res.status, 400, `попытка ${i} должна отвергаться как неверный пароль`);
  }

  assert.ok(blockedAt > 0, `после ${maxAttempts} неудач блокировки не произошло`);
  assert.ok(blockedAt <= maxAttempts, `блокировка сработала только на попытке ${blockedAt}`);

  // Главное: правильный пароль тоже не проходит, пока действует блокировка.
  // Иначе перебор просто продолжится с другого адреса.
  const correct = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
  assert.equal(correct.status, 429, 'блокировка не удержала подбор');
});

test('REGRESSION: блокировку нельзя обойти сменой регистра почты', async () => {
  const email = uniqueEmail('case');
  await request(app).post('/api/auth/register').send({ name: 'Регистр', email, password: 'password123' });

  for (let i = 0; i < config.lockout.maxAttempts; i++) {
    await request(app).post('/api/auth/login').send({ email, password: 'нет' });
  }

  const upper = await request(app).post('/api/auth/login').send({ email: email.toUpperCase(), password: 'нет' });
  assert.equal(upper.status, 429, 'смена регистра обнулила счётчик попыток');
});

test('REGRESSION: подбор родительского PIN блокируется', async () => {
  const email = uniqueEmail('pin');
  const reg = await request(app).post('/api/auth/register').send({ name: 'Родитель', email, password: 'password123' });
  const token = reg.body.token;

  const set = await auth(request(app).post('/api/users/pin'), token).send({ pin: '1234' });
  assert.equal(set.status, 200);

  // Четыре цифры — десять тысяч комбинаций. Без блокировки скрипт переберёт
  // их за минуты, и ребёнок попадёт в закрытый от него раздел.
  let blocked = false;
  for (let i = 0; i < config.lockout.maxAttempts + 2; i++) {
    const guess = String(1000 + i);
    const res = await auth(request(app).post('/api/users/pin/verify'), token).send({ pin: guess });
    if (res.status === 429) {
      blocked = true;
      break;
    }
  }
  assert.ok(blocked, 'PIN можно перебирать без ограничений');

  const correct = await auth(request(app).post('/api/users/pin/verify'), token).send({ pin: '1234' });
  assert.equal(correct.status, 429, 'блокировка не удержала подбор PIN');
});

/* ══════════════════════════════════════════════ фильтрация входа */

test('REGRESSION: ссылка javascript: не проходит в каталог ресурсов', async () => {
  const star = await dbGet('SELECT id FROM stars LIMIT 1');
  for (const link of [
    'javascript:alert(document.cookie)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example.com/steal',
    'vbscript:msgbox(1)',
  ]) {
    const res = await auth(request(app).post('/api/admin/resources'), adminToken).send({
      starId: star.id,
      type: 'online',
      title: 'Проверка ссылки',
      link,
    });
    assert.equal(res.status, 400, `опасная ссылка прошла проверку: ${link}`);
  }
});

test('разметка вырезается из пользовательских текстов', async () => {
  const res = await auth(request(app).patch('/api/users/profile'), demoToken).send({
    name: '<img src=x onerror=alert(1)>Аня',
  });
  assert.equal(res.status, 200);
  const row = await dbGet('SELECT name FROM users WHERE id = ?', [demoId]);
  assert.ok(!row.name.includes('<'), `в базе осталась разметка: ${row.name}`);
  assert.ok(!/onerror/i.test(row.name), 'в базе остался обработчик события');
});

test('REGRESSION: невидимые символы не помогают обойти ограничение длины', async () => {
  // Двести нулевой ширины плюс имя: по длине строки это далеко за пределом,
  // а на экране — обычное короткое имя.
  const padded = `${'​'.repeat(200)}Аня${'​'.repeat(200)}`;
  const res = await auth(request(app).patch('/api/users/profile'), demoToken).send({ name: padded });
  assert.equal(res.status, 200);
  const row = await dbGet('SELECT name FROM users WHERE id = ?', [demoId]);
  assert.equal(row.name, 'Аня', `невидимки сохранились в базе: ${JSON.stringify(row.name)}`);
});

test('символы переворота направления текста не сохраняются', async () => {
  await auth(request(app).patch('/api/users/profile'), demoToken).send({ name: 'Аня‮йынтяирп' });
  const row = await dbGet('SELECT name FROM users WHERE id = ?', [demoId]);
  assert.ok(!/[‪-‮⁦-⁩]/.test(row.name), 'символы bidi сохранились');
});

test('обычное русское имя проходит без искажений', async () => {
  // Проверка от перестраховки: фильтр не должен ломать нормальные данные.
  for (const name of ['Анна-Мария', 'Пётр', 'Артём Ковалёв']) {
    const res = await auth(request(app).patch('/api/users/profile'), demoToken).send({ name });
    assert.equal(res.status, 200, `имя отвергнуто: ${name}`);
    const row = await dbGet('SELECT name FROM users WHERE id = ?', [demoId]);
    assert.equal(row.name, name, `имя исказилось: ${name} → ${row.name}`);
  }
});

/* ══════════════════════════════════════════════ отсев мусора */

test('пути сканеров отбиваются коротким ответом без разметки', async () => {
  for (const url of ['/wp-admin/', '/.env', '/.git/config', '/phpmyadmin/', '/shell.php', '/backup.sql']) {
    const res = await request(app).get(url);
    assert.equal(res.status, 404, `${url} ответил ${res.status}`);
    assert.ok(res.text.length < 40, `${url} вернул страницу приложения (${res.text.length} байт)`);
    assert.ok(!/<!doctype|<html/i.test(res.text), `${url} отдал разметку`);
  }
});

test('попытка выхода за пределы каталога отклоняется', async () => {
  const res = await request(app).get('/uploads/%2e%2e%2f%2e%2e%2fpackage.json');
  assert.ok(res.status === 400 || res.status === 404, `неожиданный ответ ${res.status}`);
  assert.ok(!res.text.includes('"dependencies"'), 'сервер отдал файл за пределами каталога загрузок');
});

test('запрос с непомерным заявленным телом отбивается до разбора', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Content-Length', String(50 * 1024 * 1024))
    .set('Content-Type', 'application/json')
    .send({ email: 'a@b.co', password: 'x' });
  assert.equal(res.status, 413);
});

/* ══════════════════════════════════════════════ утечки наружу */

test('в ответах нет хешей паролей и PIN-кодов', async () => {
  const responses = await Promise.all([
    auth(request(app).get('/api/auth/me'), demoToken),
    auth(request(app).get('/api/app-state'), demoToken),
    auth(request(app).get('/api/admin/users'), adminToken),
  ]);
  for (const res of responses) {
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('$2b$'), 'в ответе оказался хеш bcrypt');
    assert.ok(!/"password"/.test(body), 'в ответе оказалось поле пароля');
    assert.ok(!/parent_pin/.test(body), 'в ответе оказался PIN');
  }
});

test('внутренняя ошибка не раскрывает устройство сервера', async () => {
  const res = await auth(request(app).get('/api/venues').query({ constellationId: 'не-число' }), demoToken);
  const body = JSON.stringify(res.body);
  assert.ok(!/at \/|node_modules|\.js:\d+/.test(body), 'в ответе оказался стек вызовов');
});

test('заголовки безопасности выставлены', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(!res.headers['x-powered-by'], 'сервер представляется по имени');
  assert.ok(res.headers['content-security-policy'], 'нет политики источников контента');
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/, 'страницу можно встроить в чужой фрейм');
});

/* ══════════════════════════════════════════════ целостность данных */

test('REGRESSION: цену покупки нельзя прислать в запросе', async () => {
  await dbRun('UPDATE users SET xp_points = 500 WHERE id = ?', [victimId]);
  const store = await auth(request(app).get('/api/store'), victimToken);
  const item = store.body.items.find((i) => !i.proOnly && !i.owned);

  const res = await auth(request(app).post('/api/store/buy'), victimToken).send({
    itemId: item.id,
    price: 0,
    itemPrice: 0,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.xp, 500 - item.price, 'списана цена из запроса, а не из базы');
});

test('нельзя отметить выполненным закрытый навык', async () => {
  const state = await auth(request(app).get('/api/app-state'), victimToken);
  const completed = new Set(state.body.completedStars);
  const edges = state.body.edges;
  // Навык, у которого есть невыполненный предшественник.
  const locked = state.body.stars.find((s) =>
    edges.some((e) => e.child === s.id && !completed.has(e.parent))
  );
  assert.ok(locked, 'в графе не нашлось закрытого навыка для проверки');

  const res = await auth(request(app).post('/api/progress/complete'), victimToken).send({ starId: locked.id });
  assert.ok(res.status >= 400, 'закрытый навык удалось отметить выполненным');
});

test('чужую работу из портфолио нельзя удалить', async () => {
  const own = await dbGet('SELECT id FROM portfolio WHERE user_id = ?', [demoId]);
  if (!own) return; // у демо-аккаунта нет работ — проверять нечего

  const res = await auth(request(app).delete(`/api/portfolio/${own.id}`), victimToken);
  assert.ok(res.status === 403 || res.status === 404, `чужая работа удалена (${res.status})`);

  const still = await dbGet('SELECT id FROM portfolio WHERE id = ?', [own.id]);
  assert.ok(still, 'чужая работа исчезла из базы');
});

/* ══════════════════════════════════════════════ медленные соединения */

test('REGRESSION: медленное соединение разрывается по сроку', async () => {
  /**
   * Клиент открывает сокет и подкидывает по заголовку раз в полсекунды,
   * никогда не завершая запрос. Несколько сотен таких соединений исчерпывают
   * пул, и сервер перестаёт отвечать живым людям — при почти нулевом трафике.
   *
   * Встроенного `server.headersTimeout` для этого недостаточно: в проверке он
   * такое соединение не обрывал. Тест поднимает настоящий сервер со сторожем
   * и убеждается, что срок считается от открытия соединения, а не от простоя.
   */
  const { guardSlowConnections } = require('../src/middleware/security');

  const srv = http.createServer((req, res) => res.end('ok'));
  guardSlowConnections(srv, { headersMs: 1500, idleMs: 1200 });

  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();

  const startedAt = Date.now();
  const lifetime = await new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write('GET / HTTP/1.1\r\nHost: test\r\n');
      const trickle = setInterval(() => {
        try {
          socket.write(`X-Pad-${Date.now()}: 1\r\n`);
        } catch {
          /* сокет уже закрыт */
        }
      }, 300);
      const done = () => {
        clearInterval(trickle);
        resolve(Date.now() - startedAt);
      };
      socket.on('close', done);
      socket.on('error', done);
    });
    setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, 8000);
  });

  srv.close();

  assert.ok(lifetime !== null, 'соединение не было разорвано — медленная атака проходит');
  assert.ok(lifetime < 5000, `соединение жило ${lifetime}мс при сроке 1500мс`);
});

test('целое соединение с обычным запросом не рвётся раньше времени', async () => {
  // Обратная проверка: сторож не должен мешать нормальному клиенту.
  const { guardSlowConnections } = require('../src/middleware/security');

  const srv = http.createServer((req, res) => res.end('ok'));
  guardSlowConnections(srv, { headersMs: 1500, idleMs: 1200 });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();

  const body = await new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => resolve(out));
      })
      .on('error', reject);
  });

  srv.close();
  assert.equal(body, 'ok');
});
