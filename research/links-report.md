# Отчёт по проверке и замене ссылок (online + tool)

Дата: 2026-07-29. Файлы: `src/db/content-a.js` (направления 1–10), `src/db/content-b.js` (11–14).
Проверялись только ключи `online` и `tool`. Ключ `offline` не трогался.

## Итоги
- Проверено уникальных ссылок (online + tool): **118**.
- Заменено «мёртвых» ссылок: **34** (32 × `online`, 2 × `tool`).
  - Из них фабрикованные deep-ссылки (404) и `edu.sirius.online` (503): 31 × `online`.
  - Плюс 1 × `online` заменён на честный YouTube-поиск (нет бесплатного курса по теме).
  - 2 × `tool`: Liftoff (было 503) и UTM/ОрВД (было 502).
- Осталось YouTube-поисков как честный fallback (добавлено этой правкой): **2** («Продюсирование канала», «Паблишинг игры»). Прочие YouTube-поиски в репозитории были и раньше.
- Каждая новая ссылка реально открыта и подтверждена (HTTP 200 с релевантным содержимым). Курсы Stepik в форме `/course/<id>` редиректят на `/course/<id>/promo` (это 200 с настоящей страницей курса). Все выбранные курсы Stepik — бесплатные (на странице явно «Бесплатно»).
- Не менялись реально живые ссылки, даже slug-формы: `skillbox.ru/course/level-design` (200, настоящая страница) и `coursera.org/learn/python-data-analysis` (200, настоящая страница) — не фабрикованы, оставлены как есть.

## Заменённые `online`-ссылки — content-a.js

| Звезда (навык) | Было (404/503) | Стало | Почему |
|---|---|---|---|
| Работа со слоями в Photoshop | stepik.org/course/photoshop-layers | https://stepik.org/course/70401 | Реальный бесплатный курс Stepik «Цифровая обработка изображений в Photoshop» (слои, ретушь) |
| Векторная графика | skillbox.ru/course/vector-figma | https://stepik.org/course/250391 | Бесплатный курс Stepik «Figma с нуля: UI/UX» (вектор, кривые) |
| Цифровой рисунок и ретушь | coursera.org/learn/digital-painting | https://stepik.org/course/209511 | Бесплатный курс Stepik «Adobe Photoshop: от основ до стилизации» |
| Концепт-арт объектов | skillbox.ru/course/concept-art | https://stepik.org/course/184176 | Бесплатный курс Stepik «Графический дизайн» (Digital Art / концепт) |
| Эргономика изделий | edu.sirius.online/courses/ergonomics | https://stepik.org/course/113643 | Бесплатный курс Stepik «Основы промышленного дизайна» (эргономика, дизайн-мышление) |
| Презентация проекта | stepik.org/course/project-presentation | https://stepik.org/course/213565 | Бесплатный курс Stepik «Дизайн презентаций для начинающих» (для школьников) |
| Черчение 2D | edu.sirius.online/courses/engineering-drawing | https://stepik.org/course/52643 | Бесплатный курс Stepik «Инженерная графика. Азбука инженера» |
| Сборочные чертежи и узлы | stepik.org/course/assembly-drawings | https://stepik.org/course/51420 | Бесплатный курс Stepik «Моделирование в Компас-3D» (сборки, для школьников) |
| Фотореалистичный CAD-рендер | coursera.org/learn/product-rendering | https://stepik.org/course/72370 | Бесплатный курс Stepik «Основы 3D-моделирования в Blender» (рендер) |
| Основы логики и алгоритмов | edu.sirius.online/courses/scratch-basics | https://stepik.org/course/68933 | Бесплатный курс Stepik «Программирование в Scratch для детей» (7–12 лет) |
| Вёрстка (HTML/CSS) | stepik.org/course/html-css-basics | https://stepik.org/course/52164 | Бесплатный курс Stepik «Основы HTML и CSS» |
| Интерактивность (JavaScript) | skillbox.ru/course/javascript-basics | https://stepik.org/course/2223 | Бесплатный курс Stepik «JavaScript для начинающих» |
| Создание веб-приложений | coursera.org/learn/web-applications | https://stepik.org/course/193612 | Бесплатный курс Stepik «HTML CSS JS (lite)» — сборка веб-приложения с проектом |
| Разработка мобильных интерфейсов | stepik.org/course/flutter-mobile | https://stepik.org/course/4792 | Бесплатный курс Stepik «Разработка Android-приложений на Kotlin» |
| Знакомство с электроникой | edu.sirius.online/courses/electronics-basics | https://stepik.org/course/55014 | Бесплатный курс Stepik «Основы программирования микроконтроллеров Arduino» |
| Сборка механизмов и датчиков | stepik.org/course/robotics-sensors | https://stepik.org/course/102886 | Бесплатный курс Stepik «Разработка умных устройств на базе Arduino» (датчики, Tinkercad) |
| Автономные роботы | coursera.org/learn/autonomous-robots | https://stepik.org/course/92047 | Бесплатный курс Stepik «Робототехника в среде TRIK Studio» (линия, препятствия) |
| Проектирование сложных систем | stepik.org/course/complex-systems | https://stepik.org/course/71759 | Бесплатный курс Stepik «Введение в Интернет вещей» (комплексные системы) |
| Концепт и нарратив (геймдизайн) | edu.sirius.online/courses/gamedesign-basics | https://stepik.org/course/73028 | Бесплатный курс Stepik «Гейм-дизайн» (14–17 лет) |
| Игровая логика | stepik.org/course/game-logic | https://stepik.org/course/66472 | Бесплатный курс Stepik «Введение в Unity» (5–8 класс) |
| Паблишинг и полировка | coursera.org/learn/game-publishing | https://www.youtube.com/results?search_query=как+опубликовать+игру+на+itch.io | Нет бесплатного профильного курса → честный YouTube-поиск (совпадает с tool itch.io) |
| Введение в ИИ | edu.sirius.online/courses/ai-intro | https://stepik.org/course/80782 | Бесплатный курс Stepik «Быстрый старт в искусственный интеллект» (старшеклассники) |
| Промпт-инжиниринг | stepik.org/course/prompt-engineering | https://stepik.org/course/243614 | Бесплатный курс Stepik «Промт-инжиниринг с нуля» |
| Обучение ML-моделей | stepik.org/course/machine-learning-kids | https://stepik.org/course/229868 | Бесплатный курс Stepik «Машинное обучение: начальный уровень» |
| Создание ИИ-агентов | coursera.org/learn/ai-agents | https://stepik.org/course/272932 | Бесплатный курс Stepik «Введение в разработку ИИ-агентов» (Function Calling, LangGraph) |

## Заменённые `online`-ссылки — content-b.js

| Звезда (навык) | Было (503) | Стало | Почему |
|---|---|---|---|
| Написание саундтреков | edu.sirius.online | https://stepik.org/course/129826 | Бесплатный курс Stepik «Создание электронной музыки в FL Studio» |
| Продюсирование канала | edu.sirius.online | https://www.youtube.com/results?search_query=как+развивать+youtube+канал+с+нуля | Профильные Stepik-курсы по YouTube оказались платными → честный YouTube-поиск |
| Криптография | edu.sirius.online | https://stepik.org/course/126091 | Бесплатный курс Stepik «Основы шифрования для младших школьников» |
| Лабораторные методы (биология) | edu.sirius.online | https://stepik.org/course/70 | Бесплатный курс Stepik «Молекулярная биология и генетика» (для школьников) |
| Развитие своего канала (стриминг) | edu.sirius.online | https://stepik.org/course/174815 | Бесплатный курс Stepik «Организация прямых трансляций» (OBS/Twitch) |
| Свой мейкер-проект | edu.sirius.online | https://stepik.org/course/52711 | Бесплатный курс Stepik «3D-моделирование в Blender и 3D-печать» (проект) |
| Гоночные дроны и FPV | edu.sirius.online | https://stepik.org/course/122089 | Бесплатный курс Stepik «Летающая робототехника: Клевер, Gazebo, Python» |

## Заменённые `tool`-ссылки — content-b.js

| Звезда | Инструмент | Было | Стало | Почему |
|---|---|---|---|---|
| Основы пилотирования | Liftoff | www.immersionrc.com/fpv-products/liftoff/ (503, «Site en maintenance») | https://liftoff-game.com | Официальный сайт симулятора Liftoff (LuGus Studios), 200. Бейдж изменён на «Платно» — на Steam продукт платный, бесплатной/пробной версии подтвердить не удалось |
| Безопасность и правила полётов | UTM (было «UTM для БАС») → «Flydrone» | utm.orvd.ru (502, пусто); orvd.ru перепрофилирован и не относится к БАС | https://flydrone.ru | Живой (200) российский сервис планирования полётов дрона с картой запретных/ограниченных зон |

## Оставлены как есть: живые сайты с bot-блоком (403/429) или таймаутом — НЕ трогались (все `tool`)

| URL | Ответ боту | Доказательство, что сайт живой |
|---|---|---|
| https://www.canva.com | 403 | GET вернул полную страницу 1.4 МБ, `<title>Canva</title>` (Cloudflare-защита) |
| https://codepen.io | 403 | «Just a moment...» — Cloudflare challenge, известный живой сайт |
| https://fritzing.org | 403 (иногда 200) | В отдельных запросах отдавал 200 «Welcome to Fritzing» — сайт живой, 403 периодический |
| https://www.raspberrypi.com | 403 | «Just a moment...» — Cloudflare challenge |
| https://chat.openai.com | 403 | Cloudflare, живой редирект на chatgpt.com |
| https://tryhackme.com | 429 | «Vercel Security Checkpoint» — антибот-защита, сайт живой |
| https://ultimaker.com/software/ultimaker-cura | 403 (иногда 200) | В отдельных запросах отдавал 200 (223 КБ, «UltiMaker Cura») — сайт живой |
| https://www.autodesk.com/products/fusion-360/ | 403 | «Access Denied» (Akamai) — известный живой продуктовый URL |
| https://www.adobe.com/ru/products/photoshop.html | таймаут с датацентр-IP | Подтверждено через Exa: живая RU-страница «ИИ следующего поколения. Теперь в Photoshop.» с подстраницами (`/plans.html`, helpx) |

## Также проверены и оставлены (живые, не фабрикованы)
- `skillbox.ru/course/level-design` — 200, «Курс «Левел-дизайн»» (Skillbox).
- `coursera.org/learn/python-data-analysis` — 200, «Введение в науку о данных с Python» (Coursera).
- Обобщённые честные fallback-ссылки, уже бывшие в репозитории (`stepik.org/catalog`, `skillbox.ru/courses/`, `coursera.org/search?...`, YouTube-поиски) — все резолвятся (200), оставлены без изменений.

## Проверка целостности
- `node -e "require('./src/db/content-a');require('./src/db/content-b');console.log('ok')"` → `ok`.
- Изменены только строковые значения `online`/`tool`; форма объектов не менялась; ключ `offline` не затронут (подтверждено диффом: 32 строки `online` + 2 строки `tool`, 0 строк `offline`).
