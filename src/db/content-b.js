'use strict';

/** Созвездия 8–14. Координаты звёзд задаются смещением от центра созвездия. */
module.exports = [
  {
    key: 'sound-design',
    name: 'Саунд-дизайн и музыкальный продакшен',
    icon: '🎧',
    accent: '#fb7185',
    stroke: 'rgba(251,113,133,0.28)',
    descriptionForAi: 'Работа со звуком: ритм, DAW, синтез, сведение, написание саундтреков.',
    stars: [
      {
        name: 'Основы ритма и звука',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок знакомится с высотой, громкостью и тембром звука, учится слышать доли и собирать простые ритмические рисунки из первых сэмплов.',
        dx: -120, dy: 40,
        resources: {
          online:  { title: "Курс «Основы звука для начинающих»", detail1: 'Stepik', detail2: '3 часа', link: 'https://stepik.org/catalog' },
          tool:    { title: 'BandLab', detail1: 'Бесплатная онлайн-студия для записи и сведения музыки прямо в браузере.', detail2: 'Бесплатно', link: 'https://www.bandlab.com' }
        }
      },
      {
        name: 'Работа в DAW',
        level: 'Допустимый (Базовый)',
        description: 'Ученик осваивает цифровую звуковую станцию: создаёт дорожки, расставляет ноты в пианоролле, записывает партии и выстраивает структуру трека по частям.',
        dx: -55, dy: -30,
        resources: {
          online:  { title: "Плейлист «DAW с нуля: FL Studio и Ableton»", detail1: 'YouTube', detail2: '5 часов', link: 'https://www.youtube.com/results?search_query=daw+для+начинающих' },
          tool:    { title: 'Cakewalk by BandLab', detail1: 'Полноценная звуковая станция для записи, аранжировки и сведения на компьютере.', detail2: 'Бесплатно', link: 'https://www.bandlab.com/products/cakewalk' }
        }
      },
      {
        name: 'Синтез и сэмплирование',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок учится лепить собственные звуки на синтезаторе, крутить фильтры и огибающие, а также нарезать и превращать записанные сэмплы в новые инструменты.',
        dx: 10, dy: 35,
        resources: {
          online:  { title: "Курс «Синтез звука и сэмплинг»", detail1: 'Skillbox', detail2: '8 часов', link: 'https://skillbox.ru/courses/' },
          tool:    { title: 'Vital', detail1: 'Наглядный волновой синтезатор, где видно, как параметры меняют звук в реальном времени.', detail2: 'Freemium', link: 'https://vital.audio' }
        }
      },
      {
        name: 'Сведение и мастеринг',
        level: 'Высокий (Прогрессивный)',
        description: 'Подросток балансирует громкости, использует эквалайзер, компрессор и реверберацию, чтобы трек звучал чисто и одинаково хорошо в наушниках и на колонках.',
        dx: 70, dy: -45,
        resources: {
          online:  { title: "Курс «Сведение и мастеринг музыки»", detail1: 'Coursera', detail2: '12 часов', link: 'https://www.coursera.org/search?query=music%20production' },
          tool:    { title: 'Audacity', detail1: 'Бесплатный редактор для тонкой чистки, эквализации и обработки аудиодорожек.', detail2: 'Бесплатно', link: 'https://www.audacityteam.org' }
        }
      },
      {
        name: 'Написание саундтреков',
        level: 'Экспертный (Профи)',
        description: 'Ученик сочиняет музыку под видео и игры, подбирает настроение под сцену, работает с темпом и динамикой и синхронизирует звук с картинкой по таймингу.',
        dx: 125, dy: 30,
        resources: {
          online:  { title: "Курс «Создание музыки в FL Studio»", detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/129826' },
          tool:    { title: 'Soundtrap', detail1: 'Онлайн-студия с готовыми лупами и совместной работой для сочинения музыки к проектам.', detail2: 'Freemium', link: 'https://www.soundtrap.com' }
        }
      }
    ]
  },
  {
    key: 'media-content',
    name: 'Создание медиаконтента',
    icon: '🎬',
    accent: '#f97316',
    stroke: 'rgba(249,115,22,0.28)',
    descriptionForAi: 'Съёмка и монтаж: кадр, свет, видеомонтаж, сторителлинг, спецэффекты, продюсирование.',
    stars: [
      {
        name: 'Основы кадра и света',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок учится строить кадр по правилу третей, держать камеру или телефон ровно и снимать при разном освещении, чтобы картинка получалась чёткой и красивой.',
        dx: -118, dy: -70,
        resources: {
          online:  { title: "Курс «Основы фото- и видеосъёмки»", detail1: 'Stepik', detail2: '4 часа', link: 'https://stepik.org/catalog' },
          tool:    { title: 'Snapseed', detail1: 'Мобильный редактор для кадрирования, коррекции света и цвета на фотографиях.', detail2: 'Бесплатно', link: 'https://www.google.com/photos/about/' }
        }
      },
      {
        name: 'Базовый видеомонтаж',
        level: 'Допустимый (Базовый)',
        description: 'Ученик собирает ролик из отснятых фрагментов, обрезает лишнее, добавляет переходы, подписи и музыку, выстраивая понятный ритм повествования.',
        dx: -45, dy: -20,
        resources: {
          online:  { title: "Плейлист «Видеомонтаж для начинающих»", detail1: 'YouTube', detail2: '6 часов', link: 'https://www.youtube.com/results?search_query=видеомонтаж+для+начинающих' },
          tool:    { title: 'DaVinci Resolve', detail1: 'Профессиональный монтажный пакет с бесплатной версией для сборки и обработки видео.', detail2: 'Freemium', link: 'https://www.blackmagicdesign.com/products/davinciresolve' }
        }
      },
      {
        name: 'Сценаристика и сторителлинг',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок придумывает сюжет, пишет сценарий и раскадровку, учится удерживать внимание зрителя завязкой, развитием и финалом истории.',
        dx: 35, dy: -55,
        resources: {
          online:  { title: "Курс «Основы сторителлинга»", detail1: 'Skillbox', detail2: '7 часов', link: 'https://skillbox.ru/courses/' },
          tool:    { title: 'Twine', detail1: 'Бесплатный инструмент для создания нелинейных историй и раскадровок в виде схемы.', detail2: 'Бесплатно', link: 'https://twinery.org' }
        }
      },
      {
        name: 'Спецэффекты и цветокоррекция',
        level: 'Высокий (Прогрессивный)',
        description: 'Подросток добавляет визуальные эффекты, работает с зелёным фоном и выстраивает цвет ролика, задавая настроение сцене через оттенки и контраст.',
        dx: 30, dy: 65,
        resources: {
          online:  { title: "Курс «Цветокоррекция и VFX»", detail1: 'Coursera', detail2: '10 часов', link: 'https://www.coursera.org/search?query=visual%20effects' },
          tool:    { title: 'Blender', detail1: 'Бесплатный пакет для 3D-графики, композитинга и создания видеоэффектов.', detail2: 'Бесплатно', link: 'https://www.blender.org' }
        }
      },
      {
        name: 'Продюсирование канала',
        level: 'Экспертный (Профи)',
        description: 'Ученик планирует контент-план, оформляет канал, изучает аналитику и учится развивать аудиторию, соблюдая авторские права и безопасность в сети.',
        dx: 120, dy: 40,
        resources: {
          online:  { title: "Плейлист «Как развивать свой YouTube-канал»", detail1: 'YouTube', detail2: 'Бесплатно', link: 'https://www.youtube.com/results?search_query=как+развивать+youtube+канал+с+нуля' },
          tool:    { title: 'Canva', detail1: 'Онлайн-редактор для обложек, превью и оформления канала по готовым шаблонам.', detail2: 'Freemium', link: 'https://www.canva.com' }
        }
      }
    ]
  },
  {
    key: 'cybersecurity',
    name: 'Кибербезопасность',
    icon: '🛡️',
    accent: '#4ade80',
    stroke: 'rgba(74,222,128,0.28)',
    descriptionForAi: 'Защита в цифре: гигиена, сети, криптография, этичный хакинг, безопасные архитектуры.',
    stars: [
      {
        name: 'Цифровая гигиена',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок учится придумывать надёжные пароли, распознавать мошеннические письма и сайты и защищать личные данные в мессенджерах и соцсетях.',
        dx: 0, dy: -95,
        resources: {
          online:  { title: "Курс «Основы цифровой безопасности»", detail1: 'Stepik', detail2: '3 часа', link: 'https://stepik.org/catalog' },
          tool:    { title: 'Bitwarden', detail1: 'Бесплатный менеджер паролей, который хранит и генерирует сложные пароли.', detail2: 'Freemium', link: 'https://bitwarden.com' }
        }
      },
      {
        name: 'Устройство сетей',
        level: 'Допустимый (Базовый)',
        description: 'Ученик разбирается, как устроен интернет: что такое IP-адрес, порты и протоколы, как данные путешествуют между устройствами и где возникают уязвимости.',
        dx: -100, dy: -20,
        resources: {
          online:  { title: "Курс «Компьютерные сети с нуля»", detail1: 'Coursera', detail2: '9 часов', link: 'https://www.coursera.org/search?query=computer%20networking' },
          tool:    { title: 'Cisco Packet Tracer', detail1: 'Учебный симулятор, где можно собирать и настраивать компьютерные сети виртуально.', detail2: 'Бесплатно', link: 'https://www.netacad.com/courses/packet-tracer' }
        }
      },
      {
        name: 'Криптография',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок знакомится с шифрами и хешами, узнаёт, как сообщения прячут от посторонних, и сам зашифровывает и расшифровывает тексты простыми методами.',
        dx: 100, dy: -15,
        resources: {
          online:  { title: "Курс «Основы шифрования для школьников»", detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/126091' },
          tool:    { title: 'CrypTool-Online', detail1: 'Онлайн-лаборатория для наглядного изучения классических и современных шифров.', detail2: 'Бесплатно', link: 'https://www.cryptool.org/en/cto/' }
        }
      },
      {
        name: 'Этичный хакинг',
        level: 'Высокий (Прогрессивный)',
        description: 'Подросток учится искать уязвимости легально на учебных площадках, понимать логику атак и мыслить как защитник, соблюдая правила и закон.',
        dx: -60, dy: 90,
        resources: {
          online:  { title: "Курс «Кибербезопасность для подростков»", detail1: 'Skillbox', detail2: '15 часов', link: 'https://skillbox.ru/courses/' },
          tool:    { title: 'TryHackMe', detail1: 'Онлайн-платформа с безопасными учебными заданиями по кибербезопасности в браузере.', detail2: 'Freemium', link: 'https://tryhackme.com' }
        }
      },
      {
        name: 'Построение защищённых архитектур',
        level: 'Экспертный (Профи)',
        description: 'Ученик проектирует безопасные системы: продумывает разграничение доступа, шифрование данных и защиту сервисов, оценивая риски на уровне всей архитектуры.',
        dx: 70, dy: 85,
        resources: {
          online:  { title: "Курс «Проектирование защищённых систем»", detail1: 'Coursera', detail2: '18 часов', link: 'https://www.coursera.org/search?query=cybersecurity%20architecture' },
          tool:    { title: 'OWASP Threat Dragon', detail1: 'Бесплатный инструмент для моделирования угроз и построения схем защиты систем.', detail2: 'Бесплатно', link: 'https://owasp.org/www-project-threat-dragon/' }
        }
      }
    ]
  },
  {
    key: 'bioengineering',
    name: 'Биоинженерия',
    icon: '🧬',
    accent: '#22d3ee',
    stroke: 'rgba(34,211,238,0.28)',
    descriptionForAi: 'Живые системы: клетка, лабораторные методы, биоматериалы, биоинформатика, проектирование.',
    stars: [
      {
        name: 'Клетка и микромир',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок узнаёт, из чего состоит живая клетка, рассматривает микроорганизмы под микроскопом и понимает, чем живое отличается от неживого.',
        dx: -90, dy: -80,
        resources: {
          online:  { title: "Курс «Основы биологии клетки»", detail1: 'Stepik', detail2: '5 часов', link: 'https://stepik.org/catalog' },
          tool:    { title: 'BioDigital Human', detail1: 'Интерактивный 3D-атлас тела и клеток для изучения биологии наглядно.', detail2: 'Freemium', link: 'https://www.biodigital.com' }
        }
      },
      {
        name: 'Лабораторные методы',
        level: 'Допустимый (Базовый)',
        description: 'Ученик осваивает базовые приёмы лаборатории: как безопасно работать с реактивами, готовить растворы, проводить простые опыты и записывать результаты.',
        dx: 40, dy: -55,
        resources: {
          online:  { title: "Курс «Молекулярная биология и генетика»", detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/70' },
          tool:    { title: 'Labster', detail1: 'Виртуальные лабораторные работы, где опыты можно безопасно ставить на компьютере.', detail2: 'Пробная версия', link: 'https://www.labster.com' }
        }
      },
      {
        name: 'Биоматериалы',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок изучает материалы на основе живого — от биопластика до тканей, узнаёт, как их создают и где применяют в медицине и экологии.',
        dx: -45, dy: 10,
        resources: {
          online:  { title: "Курс «Введение в биоматериалы»", detail1: 'Coursera', detail2: '9 часов', link: 'https://www.coursera.org/search?query=biomaterials' },
          tool:    { title: 'PhET-симуляции', detail1: 'Бесплатные интерактивные модели по химии и биологии материалов от Колорадского университета.', detail2: 'Бесплатно', link: 'https://phet.colorado.edu' }
        }
      },
      {
        name: 'Биоинформатика',
        level: 'Высокий (Прогрессивный)',
        description: 'Подросток учится читать последовательности ДНК и белков, сравнивать гены и с помощью программ находить закономерности в биологических данных.',
        dx: 80, dy: 40,
        resources: {
          online:  { title: "Курс «Биоинформатика для школьников»", detail1: 'Stepik', detail2: '14 часов', link: 'https://stepik.org/catalog' },
          tool:    { title: 'NCBI BLAST', detail1: 'Бесплатный онлайн-сервис для сравнения последовательностей ДНК и белков.', detail2: 'Бесплатно', link: 'https://blast.ncbi.nlm.nih.gov/Blast.cgi' }
        }
      },
      {
        name: 'Проектирование биосистем',
        level: 'Экспертный (Профи)',
        description: 'Ученик проектирует собственные биологические системы: продумывает идею эксперимента, моделирует процессы и планирует, как проверить гипотезу в лаборатории.',
        dx: -30, dy: 100,
        resources: {
          online:  { title: "Курс «Синтетическая биология»", detail1: 'Coursera', detail2: '20 часов', link: 'https://www.coursera.org/search?query=synthetic%20biology' },
          tool:    { title: 'Benchling', detail1: 'Онлайн-платформа для проектирования генов и планирования биологических экспериментов.', detail2: 'Freemium', link: 'https://www.benchling.com' }
        }
      }
    ]
  },
  {
    key: 'esports-streaming',
    name: 'Киберспорт и стриминг',
    icon: '🕹️',
    accent: '#c084fc',
    stroke: 'rgba(192,132,252,0.28)',
    descriptionForAi: 'Игры и трансляции: режим, механика, тактика, настройка стрима, развитие канала.',
    stars: [
      {
        name: 'Культура игры и режим',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок учится играть с пользой: соблюдать режим и паузы, разминать глаза и руки, уважительно общаться в команде и держать баланс между игрой и учёбой.',
        dx: -70, dy: -60,
        resources: {
          online:  { title: "Курс «Осознанный гейминг для подростков»", detail1: 'Stepik', detail2: '2 часа', link: 'https://stepik.org/catalog' },
          tool:    { title: 'Stretchly', detail1: 'Бесплатное приложение с напоминаниями о перерывах и разминке во время игры за компьютером.', detail2: 'Бесплатно', link: 'https://hovancik.net/stretchly/' }
        }
      },
      {
        name: 'Механика и реакция',
        level: 'Допустимый (Базовый)',
        description: 'Ученик тренирует точность мыши, скорость реакции и мышечную память, разбирает базовые механики игры и учится анализировать свои ошибки в повторах.',
        dx: 20, dy: -85,
        resources: {
          online:  { title: "Плейлист «Тренировка аима и реакции»", detail1: 'YouTube', detail2: '4 часа', link: 'https://www.youtube.com/results?search_query=тренировка+аима' },
          tool:    { title: 'Aim Lab', detail1: 'Бесплатный тренажёр для отработки прицеливания и скорости реакции.', detail2: 'Бесплатно', link: 'https://aimlab.gg' }
        }
      },
      {
        name: 'Командная тактика',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок учится играть в команде: распределять роли, договариваться о плане, называть позиции противника и принимать общие решения в ходе матча.',
        dx: -30, dy: 25,
        resources: {
          online:  { title: "Курс «Основы командной тактики»", detail1: 'YouTube', detail2: '5 часов', link: 'https://www.youtube.com/results?search_query=командная+тактика+киберспорт' },
          tool:    { title: 'Discord', detail1: 'Платформа для голосового общения и координации команды во время матчей.', detail2: 'Freemium', link: 'https://discord.com' }
        }
      },
      {
        name: 'Настройка трансляции',
        level: 'Высокий (Прогрессивный)',
        description: 'Подросток настраивает захват экрана, звук, сцены и оверлеи, добивается стабильной картинки и учится вести прямой эфир без технических сбоев.',
        dx: 90, dy: -10,
        resources: {
          online:  { title: "Курс «Стриминг с нуля: настройка OBS»", detail1: 'Skillbox', detail2: '8 часов', link: 'https://skillbox.ru/courses/' },
          tool:    { title: 'OBS Studio', detail1: 'Бесплатная программа для записи экрана и прямых трансляций со сценами и источниками.', detail2: 'Бесплатно', link: 'https://obsproject.com' }
        }
      },
      {
        name: 'Развитие своего канала',
        level: 'Экспертный (Профи)',
        description: 'Ученик выстраивает расписание эфиров, работает с аудиторией и аналитикой, оформляет бренд канала и учится развивать сообщество безопасно и ответственно.',
        dx: 45, dy: 75,
        resources: {
          online:  { title: "Курс «Организация прямых трансляций»", detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/174815' },
          tool:    { title: 'Streamlabs', detail1: 'Набор инструментов для оформления трансляций, оповещений и аналитики канала.', detail2: 'Freemium', link: 'https://streamlabs.com' }
        }
      }
    ]
  },
  {
    key: '3d-printing',
    name: '3D-печать и мейкерство',
    icon: '🖨️',
    accent: '#facc15',
    stroke: 'rgba(250,204,21,0.28)',
    descriptionForAi: 'От идеи к изделию: основы печати, моделирование, слайсинг, постобработка, свой проект.',
    stars: [
      {
        name: 'Знакомство с 3D-печатью',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок узнаёт, как принтер послойно создаёт предметы, какие бывают материалы и что можно напечатать, и запускает свою первую готовую модель.',
        dx: -130, dy: 20,
        resources: {
          online:  { title: "Курс «3D-печать для начинающих»", detail1: 'Stepik', detail2: '3 часа', link: 'https://stepik.org/catalog' },
          tool:    { title: 'Thingiverse', detail1: 'Огромная библиотека бесплатных готовых моделей для печати и вдохновения.', detail2: 'Бесплатно', link: 'https://www.thingiverse.com' }
        }
      },
      {
        name: 'Моделирование под печать',
        level: 'Допустимый (Базовый)',
        description: 'Ученик создаёт собственные 3D-модели в простом редакторе, учитывает толщину стенок и опоры, чтобы деталь хорошо напечаталась и не сломалась.',
        dx: -45, dy: -40,
        resources: {
          online:  { title: "Курс «3D-моделирование в Tinkercad»", detail1: 'YouTube', detail2: '5 часов', link: 'https://www.youtube.com/results?search_query=tinkercad+для+начинающих' },
          tool:    { title: 'Tinkercad', detail1: 'Бесплатный онлайн-редактор для простого 3D-моделирования прямо в браузере.', detail2: 'Бесплатно', link: 'https://www.tinkercad.com' }
        }
      },
      {
        name: 'Слайсинг и настройка принтера',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок готовит модель к печати в слайсере: задаёт слои, заполнение, температуру и скорость, а также учится калибровать принтер и первый слой.',
        dx: 15, dy: 55,
        resources: {
          online:  { title: "Курс «Слайсинг и настройка 3D-принтера»", detail1: 'Skillbox', detail2: '7 часов', link: 'https://skillbox.ru/courses/' },
          tool:    { title: 'UltiMaker Cura', detail1: 'Бесплатный слайсер, превращающий 3D-модель в задание для принтера.', detail2: 'Бесплатно', link: 'https://ultimaker.com/software/ultimaker-cura' }
        }
      },
      {
        name: 'Постобработка изделий',
        level: 'Высокий (Прогрессивный)',
        description: 'Подросток доводит напечатанные детали до готового вида: убирает поддержки, шлифует, склеивает, грунтует и красит изделие, добиваясь аккуратности.',
        dx: 70, dy: -25,
        resources: {
          online:  { title: "Плейлист «Постобработка 3D-печати»", detail1: 'YouTube', detail2: '4 часа', link: 'https://www.youtube.com/results?search_query=постобработка+3d+печати' },
          tool:    { title: 'Meshmixer', detail1: 'Бесплатная программа для ремонта, сглаживания и подготовки моделей к отделке.', detail2: 'Бесплатно', link: 'https://meshmixer.com' }
        }
      },
      {
        name: 'Свой мейкер-проект',
        level: 'Экспертный (Профи)',
        description: 'Ученик доводит идею до готового изделия: проектирует деталь под задачу, печатает, дорабатывает и собирает работающий предмет или механизм своими руками.',
        dx: 130, dy: 45,
        resources: {
          online:  { title: "Курс «3D-моделирование в Blender и 3D-печать»", detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/52711' },
          tool:    { title: 'Autodesk Fusion', detail1: 'Профессиональный инженерный редактор для проектирования деталей и сборок; бесплатен для учёбы.', detail2: 'Пробная версия', link: 'https://www.autodesk.com/products/fusion-360/' }
        }
      }
    ]
  },
  {
    key: 'drone-piloting',
    name: 'Пилотирование дронов',
    icon: '🚁',
    accent: '#60a5fa',
    stroke: 'rgba(96,165,250,0.28)',
    descriptionForAi: 'Небо и техника: устройство квадрокоптера, пилотирование, правила, аэросъёмка, FPV-гонки.',
    stars: [
      {
        name: 'Устройство квадрокоптера',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок узнаёт, из каких частей состоит дрон, за что отвечают моторы, пропеллеры и аккумулятор, и как коптер держится и управляется в воздухе.',
        dx: -95, dy: -85,
        resources: {
          online:  { title: "Курс «Как устроен квадрокоптер»", detail1: 'Stepik', detail2: '3 часа', link: 'https://stepik.org/catalog' },
          tool:    { title: 'Tinkercad Circuits', detail1: 'Онлайн-конструктор электроники, чтобы наглядно понять моторы и схемы дрона.', detail2: 'Бесплатно', link: 'https://www.tinkercad.com/circuits' }
        }
      },
      {
        name: 'Основы пилотирования',
        level: 'Допустимый (Базовый)',
        description: 'Ученик осваивает базовые команды: взлёт, зависание, повороты и мягкую посадку, тренируясь сначала на симуляторе, а затем на учебном дроне.',
        dx: 95, dy: -80,
        resources: {
          online:  { title: "Плейлист «Учимся пилотировать дрон»", detail1: 'YouTube', detail2: '4 часа', link: 'https://www.youtube.com/results?search_query=пилотирование+дрона+для+начинающих' },
          tool:    { title: 'Liftoff', detail1: 'Реалистичный симулятор полётов на дроне для тренировки управления без риска.', detail2: 'Платно', link: 'https://liftoff-game.com' }
        }
      },
      {
        name: 'Безопасность и правила полётов',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок изучает, где можно и нельзя запускать дрон, как проверять аппарат перед полётом и вести себя рядом с людьми, соблюдая правила и закон.',
        dx: -90, dy: 75,
        resources: {
          online:  { title: "Курс «Правила и безопасность полётов дронов»", detail1: 'Coursera', detail2: '6 часов', link: 'https://www.coursera.org/search?query=drone%20safety' },
          tool:    { title: 'Flydrone', detail1: 'Сервис для планирования полётов и проверки разрешённых зон запуска дрона.', detail2: 'Бесплатно', link: 'https://flydrone.ru' }
        }
      },
      {
        name: 'Аэросъёмка',
        level: 'Высокий (Прогрессивный)',
        description: 'Подросток учится снимать с воздуха: строить плавные траектории, выбирать ракурсы и свет и получать красивые кадры и видео без тряски.',
        dx: 95, dy: 70,
        resources: {
          online:  { title: "Курс «Аэросъёмка на дрон»", detail1: 'Skillbox', detail2: '9 часов', link: 'https://skillbox.ru/courses/' },
          tool:    { title: 'DaVinci Resolve', detail1: 'Бесплатный редактор для монтажа и стабилизации отснятых с дрона видео.', detail2: 'Freemium', link: 'https://www.blackmagicdesign.com/products/davinciresolve' }
        }
      },
      {
        name: 'Гоночные дроны и FPV',
        level: 'Экспертный (Профи)',
        description: 'Ученик осваивает полёт от первого лица в FPV-очках, проходит трассы на скорость, настраивает гоночный дрон и отрабатывает сложные манёвры и виражи.',
        dx: 0, dy: -10,
        resources: {
          online:  { title: "Курс «Летающая робототехника: Клевер, Gazebo, Python»", detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/122089' },
          tool:    { title: 'Betaflight Configurator', detail1: 'Бесплатная программа для настройки полётного контроллера гоночного FPV-дрона.', detail2: 'Бесплатно', link: 'https://betaflight.com' }
        }
      }
    ]
  }
];
