# Развёртывание

Приложение — один процесс Node, который отдаёт и API, и собранный фронтенд. Никаких внешних сервисов не требуется: база — файл SQLite, ИИ работает в офлайн-режиме без ключа.

---

## Обязательные переменные окружения

| Переменная | Значение | Зачем |
|---|---|---|
| `NODE_ENV` | `production` | Включает продакшен-режим |
| `JWT_SECRET` | 48 случайных байт в hex | **Сервер не стартует без него.** Иначе токены сессий можно подделать |
| `ADMIN_PASSWORD` | свой надёжный пароль | Иначе останется `admin12345` из примера |
| `PORT` | обычно задаёт сам хостинг | Порт прослушивания |

Сгенерировать секрет:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Необязательные: `DB_PATH`, `UPLOAD_DIR`, `CORS_ORIGINS`, `AI_API_KEY`, `YANDEX_CAPTCHA_SECRET_KEY` — см. `.env.example`.

---

## Вариант 1. Docker (рекомендуется)

В корне лежит готовый многоступенчатый `Dockerfile`: клиент собирается отдельно, в финальный образ не попадают ни dev-зависимости, ни инструменты сборки.

```bash
docker build -t talentmap .

docker run -d --name talentmap \
  -p 80:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" \
  -e ADMIN_PASSWORD="ваш-пароль" \
  -v talentmap-data:/data \
  talentmap
```

Том `/data` хранит базу и загруженные работы. **Без тома данные сбрасываются при каждом передеплое** — для демонстрационного стенда это нормально (содержимое пересоздаётся автоматически), для боевого — том обязателен.

---

## Вариант 2. Railway / Render / Fly.io

Все три подхватывают `Dockerfile` автоматически.

1. Подключите репозиторий или загрузите код.
2. Задайте переменные окружения из таблицы выше.
3. Проверка живости: `GET /api/health` → `{"status":"ok"}`.
4. Смонтируйте том на `/data`, если нужно сохранять данные между деплоями.

Файл `railway.json` уже задаёт сборщик, healthcheck и политику перезапуска.

---

## Вариант 3. Обычный сервер (VPS)

```bash
git clone <репозиторий> && cd talentmap
npm run setup
npm run build

cp .env.example .env
# впишите NODE_ENV, JWT_SECRET, ADMIN_PASSWORD

NODE_ENV=production npm start
```

Дальше — systemd-юнит или pm2 для автозапуска, nginx или Caddy для HTTPS. Сервер уже настроен на `trust proxy`, поэтому за обратным прокси корректно читается `X-Forwarded-For` (это важно для ограничения частоты запросов).

Минимальный конфиг nginx:

```nginx
server {
    server_name talentmap.example.ru;
    client_max_body_size 6M;   # запас над лимитом загрузки в 5 МБ

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## После первого запуска

1. Откройте сайт и войдите как `admin@talentmap.ai` с паролем из `ADMIN_PASSWORD`.
2. **Смените пароль администратора** в настройках.
3. Проверьте `/api/health`.
4. Демо-аккаунт `demo@talentmap.ai` / `demo123` удалите или смените ему пароль перед публичным запуском.

## Безопасность: что настроить обязательно

Код закрывает прикладной уровень — подбор паролей, медленные соединения,
наводнение запросами, подделку данных. Всё остальное за внешним рубежом, и без
него защита неполна. Подробный разбор — в [SECURITY.md](SECURITY.md).

### Без этого не запускать

| Что | Почему |
|---|---|
| `JWT_SECRET` от 32 символов | Без него сервер не стартует. Предсказуемый секрет — это возможность подписать себе любой токен |
| `ADMIN_PASSWORD` | Без него сервер не стартует. Пароль из исходного кода известен всем |
| HTTPS | Иначе токен уходит по сети открытым текстом |
| `CORS_ORIGINS` с вашим доменом | Иначе браузерные запросы с сайта не пройдут |

### Обратный прокси и TRUST_PROXY

Приложению нужно знать настоящий адрес клиента, иначе все ограничения по
частоте считаются по одному адресу на всех. Но доверять заголовку можно только
тогда, когда его ставит ваш прокси, а не сам клиент.

**Поэтому `TRUST_PROXY` по умолчанию выключен.** Включайте его, только когда
перед приложением действительно стоит nginx, Caddy или Cloudflare:

```bash
TRUST_PROXY=1      # один прокси
TRUST_PROXY=2      # Cloudflare + nginx
```

Если поставить его без прокси — любой клиент подставит выдуманный адрес и
обойдёт защиту от подбора пароля полностью.

### Настройка nginx

```nginx
limit_req_zone  $binary_remote_addr zone=api:10m rate=10r/s;
limit_conn_zone $binary_remote_addr zone=conn:10m;

server {
    listen 443 ssl http2;
    server_name talentmap.example.ru;

    # Сроки против медленных соединений — второй рубеж поверх приложения.
    client_body_timeout   10s;
    client_header_timeout 10s;
    client_max_body_size  6m;
    send_timeout          20s;

    location /api/ {
        limit_req  zone=api burst=20 nodelay;
        limit_conn conn 20;
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Объёмные атаки

Отдельно и честно: **атаку в сотни гигабит приложением на Node не отбить**.
Трафик умрёт на канале раньше, чем дойдёт до процесса. Единственная реальная
защита — внешний рубеж, который поглощает трафик до вашего сервера.

Бесплатного тарифа Cloudflare для этого достаточно:

1. Направьте домен на Cloudflare, включите проксирование (оранжевое облако).
2. **Bot Fight Mode** — отсекает основную массу автоматики.
3. Правило ограничения частоты на `/api/auth/*` — 10 запросов за 10 минут с адреса.
4. **Always Use HTTPS** и минимальная версия TLS 1.2.
5. После подключения выставьте `TRUST_PROXY=2` (Cloudflare + ваш nginx).

### Проверка перед выкладкой

```bash
npm run audit          # уязвимости в зависимостях
npm run test:security  # 27 проверок: каждая пытается провести атаку
npm test               # весь набор целиком
```

Если `npm run audit` показывает находку вне списка исключений — обновите пакет
или добавьте исключение с обоснованием в `scripts/audit-gate.js`. Не
отключайте проверку целиком: она перестанет ловить настоящие уязвимости.

---

## Резервное копирование

Достаточно копировать каталог с томом — там лежат `talentmap.db` и `uploads/`. Для консистентного снимка базы под нагрузкой:

```bash
sqlite3 /data/talentmap.db ".backup '/backup/talentmap-$(date +%F).db'"
```

## Обновление

```bash
git pull
npm run setup && npm run build
# перезапустить процесс
```

Схема базы обновляется сама при старте: таблицы создаются через `CREATE TABLE IF NOT EXISTS`, недостающие колонки добавляются миграциями. Существующие данные не теряются.
