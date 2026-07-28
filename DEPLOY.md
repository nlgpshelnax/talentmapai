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
