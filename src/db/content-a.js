'use strict';

/** Созвездия 1–7. Координаты звёзд задаются смещением от центра созвездия. */
module.exports = [
  {
    key: 'computer-graphics',
    name: 'Компьютерная графика',
    icon: '🎨',
    accent: '#818cf8',
    stroke: 'rgba(129,140,248,0.28)',
    descriptionForAi: 'Растровая и векторная графика, коллаж, текстуры, цифровой рисунок.',
    stars: [
      {
        name: 'Введение в графические редакторы',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок осваивает базовый интерфейс растрового редактора: кисть, ластик, выделение, заливку и цветовой круг — и делает первые простые рисунки.',
        dx: -120, dy: -60,
        resources: {
          online:  { title: 'Видеокурс «Графика с нуля для детей»', detail1: 'YouTube', detail2: '1,5 часа', link: 'https://www.youtube.com/results?search_query=графика+с+нуля+для+детей' },
          tool:    { title: 'Photopea', detail1: 'Бесплатный веб-редактор графики, работает прямо в браузере без установки.', detail2: 'Бесплатно', link: 'https://www.photopea.com' }
        }
      },
      {
        name: 'Работа со слоями в Photoshop',
        level: 'Допустимый (Базовый)',
        description: 'Учимся собирать картинку из отдельных слоёв, использовать маски и режимы наложения, чтобы легко исправлять детали и делать аккуратный коллаж.',
        dx: -40, dy: -105,
        resources: {
          online:  { title: 'Курс «Цифровая обработка изображений в Photoshop»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/70401' },
          tool:    { title: 'Adobe Photoshop', detail1: 'Профессиональный растровый редактор для монтажа, ретуши и работы со слоями.', detail2: 'Пробная версия', link: 'https://www.adobe.com/ru/products/photoshop.html' }
        }
      },
      {
        name: 'Векторная графика',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок рисует логотипы и иконки кривыми Безье — такие изображения можно увеличивать до любого размера без потери чёткости.',
        dx: 35, dy: -30,
        resources: {
          online:  { title: 'Курс «Figma с нуля: UI/UX-дизайн для новичков»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/250391' },
          tool:    { title: 'Inkscape', detail1: 'Свободный векторный редактор для создания иллюстраций, логотипов и иконок.', detail2: 'Бесплатно', link: 'https://inkscape.org' }
        }
      },
      {
        name: 'Текстурирование и материалы',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся создавать реалистичные поверхности — дерево, металл, ткань — с помощью текстур, узоров и карт, чтобы рисунок выглядел объёмным и живым.',
        dx: 95, dy: 55,
        resources: {
          online:  { title: 'Видеокурс «Создание текстур в Krita»', detail1: 'YouTube', detail2: '3 часа', link: 'https://www.youtube.com/results?search_query=создание+текстур+krita' },
          tool:    { title: 'Krita', detail1: 'Бесплатный редактор для цифрового рисунка с богатым набором кистей и текстур.', detail2: 'Бесплатно', link: 'https://krita.org' }
        }
      },
      {
        name: 'Цифровой рисунок и ретушь',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок рисует полноценные иллюстрации с нуля, работает со светом и тенью и профессионально ретуширует фотографии.',
        dx: 10, dy: 110,
        resources: {
          online:  { title: 'Курс «Adobe Photoshop: от основ до стилизации»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/209511' },
          tool:    { title: 'Procreate', detail1: 'Мощное приложение для цифрового рисунка на планшете с естественными кистями.', detail2: 'Пробная версия', link: 'https://procreate.com' }
        }
      }
    ]
  },
  {
    key: 'design-project',
    name: 'Дизайн-проектирование',
    icon: '✏️',
    accent: '#34d399',
    stroke: 'rgba(52,211,153,0.28)',
    descriptionForAi: 'Скетчинг, концепт-арт, эргономика, прототипирование и презентация изделий.',
    stars: [
      {
        name: 'Скетчинг и композиция',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок учится быстро зарисовывать идеи от руки, чувствовать пропорции и располагать объекты на листе так, чтобы рисунок был понятным и гармоничным.',
        dx: -125, dy: 20,
        resources: {
          online:  { title: 'Видеокурс «Основы скетчинга»', detail1: 'YouTube', detail2: '2 часа', link: 'https://www.youtube.com/results?search_query=основы+скетчинга+для+начинающих' },
          tool:    { title: 'Autodesk SketchBook', detail1: 'Приложение для быстрых набросков и скетчей с реалистичными карандашами и маркерами.', detail2: 'Бесплатно', link: 'https://www.sketchbook.com' }
        }
      },
      {
        name: 'Концепт-арт объектов',
        level: 'Допустимый (Базовый)',
        description: 'Учимся придумывать и прорисовывать внешний вид будущих предметов — от игрушки до транспорта — в нескольких вариантах формы, цвета и стиля.',
        dx: -70, dy: -75,
        resources: {
          online:  { title: 'Курс «Графический дизайн и цифровой рисунок»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/184176' },
          tool:    { title: 'Krita', detail1: 'Бесплатный графический редактор, удобный для концепт-артов и раскадровок.', detail2: 'Бесплатно', link: 'https://krita.org' }
        }
      },
      {
        name: 'Эргономика изделий',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок узнаёт, как делать вещи удобными для человека: подбирать размеры, форму ручек и кнопок так, чтобы предметом было приятно и безопасно пользоваться.',
        dx: 15, dy: -105,
        resources: {
          online:  { title: 'Курс «Основы промышленного дизайна»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/113643' },
          tool:    { title: 'Figma', detail1: 'Онлайн-редактор для проектирования интерфейсов и схем взаимодействия человека с предметом.', detail2: 'Freemium', link: 'https://www.figma.com' }
        }
      },
      {
        name: 'Прототипирование из картона',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся превращать эскиз в настоящий объёмный макет из картона и подручных материалов, чтобы проверить идею руками до её изготовления.',
        dx: 95, dy: -45,
        resources: {
          online:  { title: 'Видеокурс «Макетирование из картона»', detail1: 'YouTube', detail2: '2,5 часа', link: 'https://www.youtube.com/results?search_query=макетирование+из+картона' },
          tool:    { title: 'Tinkercad', detail1: 'Простой онлайн-редактор 3D-моделей для планирования макетов и деталей.', detail2: 'Бесплатно', link: 'https://www.tinkercad.com' }
        }
      },
      {
        name: 'Презентация проекта',
        level: 'Экспертный (Профи)',
        description: 'Финальный этап: ребёнок собирает проект в наглядную презентацию, учится рассказывать о своей идее уверенно и убедительно защищать её перед аудиторией.',
        dx: 120, dy: 60,
        resources: {
          online:  { title: 'Курс «Дизайн презентаций для начинающих»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/213565' },
          tool:    { title: 'Canva', detail1: 'Онлайн-сервис для создания красивых презентаций и постеров по готовым шаблонам.', detail2: 'Freemium', link: 'https://www.canva.com' }
        }
      }
    ]
  },
  {
    key: 'engineering-graphics',
    name: 'Инженерная графика',
    icon: '📐',
    accent: '#fbbf24',
    stroke: 'rgba(251,191,36,0.28)',
    descriptionForAi: 'Черчение, 3D-моделирование деталей, сборочные чертежи, анимация и рендер.',
    stars: [
      {
        name: 'Черчение 2D',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок учится читать и строить простые чертежи: линии, размеры, виды спереди и сбоку — язык, на котором инженеры описывают любую деталь.',
        dx: -90, dy: -80,
        resources: {
          online:  { title: 'Курс «Инженерная графика. Азбука инженера»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/52643' },
          tool:    { title: 'LibreCAD', detail1: 'Бесплатная программа для создания двумерных технических чертежей.', detail2: 'Бесплатно', link: 'https://librecad.org' }
        }
      },
      {
        name: '3D-моделирование деталей',
        level: 'Допустимый (Базовый)',
        description: 'Учимся строить объёмные модели деталей на компьютере: выдавливать, вращать и вырезать формы, превращая плоский эскиз в трёхмерный предмет.',
        dx: 10, dy: -95,
        resources: {
          online:  { title: 'Видеокурс «Fusion 360 для начинающих»', detail1: 'YouTube', detail2: '5 часов', link: 'https://www.youtube.com/results?search_query=fusion+360+для+начинающих' },
          tool:    { title: 'Autodesk Tinkercad', detail1: 'Онлайн-конструктор простых 3D-моделей, идеальный для первого знакомства с моделированием.', detail2: 'Бесплатно', link: 'https://www.tinkercad.com' }
        }
      },
      {
        name: 'Сборочные чертежи и узлы',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок собирает несколько деталей в один механизм, показывает, как они соединяются, и составляет спецификацию всех частей будущего изделия.',
        dx: 100, dy: -30,
        resources: {
          online:  { title: 'Курс «Моделирование и сборки в Компас-3D»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/51420' },
          tool:    { title: 'FreeCAD', detail1: 'Свободная система для параметрического 3D-моделирования и сборки узлов.', detail2: 'Бесплатно', link: 'https://www.freecad.org' }
        }
      },
      {
        name: 'Анимация механизмов',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся оживлять сборку: задаём движение шестерёнкам и рычагам, чтобы наглядно показать, как работает механизм, и найти ошибки до сборки.',
        dx: 45, dy: 70,
        resources: {
          online:  { title: 'Видеокурс «Анимация механизмов в CAD»', detail1: 'YouTube', detail2: '4 часа', link: 'https://www.youtube.com/results?search_query=анимация+механизмов+cad' },
          tool:    { title: 'Blender', detail1: 'Свободный пакет для 3D-моделирования и анимации, подходит и для показа работы механизмов.', detail2: 'Бесплатно', link: 'https://www.blender.org' }
        }
      },
      {
        name: 'Фотореалистичный CAD-рендер',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок настраивает материалы, свет и камеру, чтобы превратить 3D-модель в реалистичное изображение, неотличимое от фотографии.',
        dx: -70, dy: 60,
        resources: {
          online:  { title: 'Курс «3D-моделирование и рендер в Blender»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/72370' },
          tool:    { title: 'Blender', detail1: 'Мощный движок Cycles внутри Blender позволяет делать фотореалистичные рендеры деталей.', detail2: 'Бесплатно', link: 'https://www.blender.org' }
        }
      }
    ]
  },
  {
    key: 'programming-web',
    name: 'Программирование и Web-разработка',
    icon: '💻',
    accent: '#38bdf8',
    stroke: 'rgba(56,189,248,0.28)',
    descriptionForAi: 'Алгоритмы, вёрстка HTML/CSS, JavaScript, веб-приложения и мобильные интерфейсы.',
    stars: [
      {
        name: 'Основы логики и алгоритмов',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок учится мыслить как программист: разбивать задачу на шаги, строить последовательности, условия и циклы в наглядной блочной среде.',
        dx: -130, dy: -40,
        resources: {
          online:  { title: 'Курс «Программирование в Scratch для детей»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/68933' },
          tool:    { title: 'Scratch', detail1: 'Визуальная среда, где программы собираются из цветных блоков — идеальный старт для детей.', detail2: 'Бесплатно', link: 'https://scratch.mit.edu' }
        }
      },
      {
        name: 'Вёрстка (HTML/CSS)',
        level: 'Допустимый (Базовый)',
        description: 'Учимся создавать веб-страницы: размечать текст и картинки тегами HTML и оформлять их цветом, шрифтами и расположением с помощью CSS.',
        dx: -45, dy: -95,
        resources: {
          online:  { title: 'Курс «Основы HTML и CSS»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/52164' },
          tool:    { title: 'Visual Studio Code', detail1: 'Бесплатный редактор кода с подсказками и подсветкой синтаксиса для вёрстки.', detail2: 'Бесплатно', link: 'https://code.visualstudio.com' }
        }
      },
      {
        name: 'Интерактивность (JavaScript)',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок оживляет страницы с помощью JavaScript: делает кнопки рабочими, реагирует на клики и создаёт простые интерактивные игры прямо в браузере.',
        dx: 30, dy: -15,
        resources: {
          online:  { title: 'Курс «JavaScript для начинающих»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/2223' },
          tool:    { title: 'CodePen', detail1: 'Онлайн-песочница, где можно писать HTML, CSS и JavaScript и сразу видеть результат.', detail2: 'Freemium', link: 'https://codepen.io' }
        }
      },
      {
        name: 'Создание веб-приложений',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся собирать полноценные приложения из компонентов, хранить данные и связывать интерфейс с логикой, чтобы сайт умел запоминать и обрабатывать информацию.',
        dx: -20, dy: 90,
        resources: {
          online:  { title: 'Курс «Веб-приложение на HTML, CSS и JavaScript»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/193612' },
          tool:    { title: 'React', detail1: 'Популярная библиотека для создания интерактивных пользовательских интерфейсов из компонентов.', detail2: 'Бесплатно', link: 'https://react.dev' }
        }
      },
      {
        name: 'Разработка мобильных интерфейсов',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок проектирует и программирует удобные приложения для смартфонов, учитывая жесты, разные экраны и правила мобильного дизайна.',
        dx: 110, dy: 45,
        resources: {
          online:  { title: 'Курс «Разработка Android-приложений на Kotlin»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/4792' },
          tool:    { title: 'Figma', detail1: 'Онлайн-редактор для проектирования и прототипирования мобильных интерфейсов.', detail2: 'Freemium', link: 'https://www.figma.com' }
        }
      }
    ]
  },
  {
    key: 'robotics',
    name: 'Робототехника и схемотехника',
    icon: '🤖',
    accent: '#f472b6',
    stroke: 'rgba(244,114,182,0.28)',
    descriptionForAi: 'Электроника, программирование Arduino, датчики, автономные роботы и системы.',
    stars: [
      {
        name: 'Знакомство с электроникой',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок собирает первые простые схемы на макетной плате, узнаёт, что такое ток, светодиод и резистор, и заставляет лампочку загораться.',
        dx: -30, dy: -130,
        resources: {
          online:  { title: 'Курс «Основы программирования Arduino»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/55014' },
          tool:    { title: 'Tinkercad Circuits', detail1: 'Онлайн-симулятор электронных схем, где можно собирать цепи без реальных деталей.', detail2: 'Бесплатно', link: 'https://www.tinkercad.com/circuits' }
        }
      },
      {
        name: 'Программирование Arduino',
        level: 'Допустимый (Базовый)',
        description: 'Учимся управлять платой Arduino: писать код, зажигать светодиоды по программе, считывать кнопки и заставлять электронику выполнять команды.',
        dx: 55, dy: -70,
        resources: {
          online:  { title: 'Видеокурс «Arduino с нуля»', detail1: 'YouTube', detail2: '6 часов', link: 'https://www.youtube.com/results?search_query=arduino+с+нуля+для+начинающих' },
          tool:    { title: 'Arduino IDE', detail1: 'Официальная среда для написания и загрузки программ на платы Arduino.', detail2: 'Бесплатно', link: 'https://www.arduino.cc/en/software' }
        }
      },
      {
        name: 'Сборка механизмов и датчиков',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок подключает моторы, сервоприводы и датчики расстояния или света, собирая движущиеся конструкции, которые реагируют на окружающий мир.',
        dx: -55, dy: -25,
        resources: {
          online:  { title: 'Курс «Умные устройства и датчики на Arduino»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/102886' },
          tool:    { title: 'Fritzing', detail1: 'Программа для проектирования электронных схем и разводки плат с датчиками.', detail2: 'Пробная версия', link: 'https://fritzing.org' }
        }
      },
      {
        name: 'Автономные роботы',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся создавать роботов, которые действуют сами: объезжают препятствия, едут по линии и принимают решения на основе показаний датчиков.',
        dx: 40, dy: 45,
        resources: {
          online:  { title: 'Курс «Робототехника в среде TRIK Studio»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/92047' },
          tool:    { title: 'Webots', detail1: 'Бесплатный симулятор для разработки и тестирования автономных роботов в 3D.', detail2: 'Бесплатно', link: 'https://cyberbotics.com' }
        }
      },
      {
        name: 'Проектирование сложных систем',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок объединяет несколько модулей и микроконтроллеров в единую систему, связывает их обменом данными и управляет всем комплексом.',
        dx: -25, dy: 120,
        resources: {
          online:  { title: 'Курс «Введение в Интернет вещей»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/71759' },
          tool:    { title: 'Raspberry Pi', detail1: 'Одноплатный компьютер для управления сложными робототехническими системами.', detail2: 'Бесплатно', link: 'https://www.raspberrypi.com' }
        }
      }
    ]
  },
  {
    key: 'gamedev',
    name: 'Геймдизайн и разработка игр',
    icon: '🎮',
    accent: '#a78bfa',
    stroke: 'rgba(167,139,250,0.28)',
    descriptionForAi: 'Нарратив, игровые движки, игровая логика, левел-дизайн, паблишинг игр.',
    stars: [
      {
        name: 'Концепт и нарратив',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок придумывает мир, героев и историю будущей игры, формулирует её правила и цель, чтобы получилась цельная и увлекательная задумка.',
        dx: -95, dy: -55,
        resources: {
          online:  { title: 'Курс «Гейм-дизайн: придумываем свою игру»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/73028' },
          tool:    { title: 'Twine', detail1: 'Бесплатный инструмент для создания интерактивных текстовых историй и сюжетов игр.', detail2: 'Бесплатно', link: 'https://twinery.org' }
        }
      },
      {
        name: 'Игровые движки (Unity/Godot)',
        level: 'Допустимый (Базовый)',
        description: 'Учимся работать в игровом движке: размещать объекты на сцене, добавлять физику и картинки и запускать свою первую играбельную сцену.',
        dx: -5, dy: -100,
        resources: {
          online:  { title: 'Видеокурс «Godot для начинающих»', detail1: 'YouTube', detail2: '8 часов', link: 'https://www.youtube.com/results?search_query=godot+для+начинающих' },
          tool:    { title: 'Godot Engine', detail1: 'Свободный игровой движок для создания 2D- и 3D-игр без затрат на лицензию.', detail2: 'Бесплатно', link: 'https://godotengine.org' }
        }
      },
      {
        name: 'Игровая логика',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок программирует поведение игры: управление персонажем, подсчёт очков, обработку столкновений, а также правила, по которым игрок побеждает или проигрывает.',
        dx: 90, dy: -45,
        resources: {
          online:  { title: 'Курс «Введение в Unity»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/66472' },
          tool:    { title: 'Unity', detail1: 'Один из самых популярных движков для создания игр с богатым набором инструментов.', detail2: 'Freemium', link: 'https://unity.com' }
        }
      },
      {
        name: 'Левел-дизайн',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся проектировать уровни: расставлять препятствия, награды и врагов так, чтобы игра была интересной, честной и в меру сложной для игрока.',
        dx: 70, dy: 60,
        resources: {
          online:  { title: 'Курс «Левел-дизайн в играх»', detail1: 'Skillbox', detail2: '12 часов', link: 'https://skillbox.ru/course/level-design' },
          tool:    { title: 'Tiled', detail1: 'Бесплатный редактор карт и уровней для двумерных игр на основе тайлов.', detail2: 'Бесплатно', link: 'https://www.mapeditor.org' }
        }
      },
      {
        name: 'Паблишинг и полировка',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок доводит игру до ума — исправляет ошибки, добавляет звук и эффекты и публикует готовый проект, чтобы в него могли поиграть другие.',
        dx: -45, dy: 85,
        resources: {
          online:  { title: 'Плейлист «Как опубликовать свою игру на itch.io»', detail1: 'YouTube', detail2: 'Бесплатно', link: 'https://www.youtube.com/results?search_query=как+опубликовать+игру+на+itch.io' },
          tool:    { title: 'itch.io', detail1: 'Площадка для бесплатной публикации и распространения инди-игр по всему миру.', detail2: 'Бесплатно', link: 'https://itch.io' }
        }
      }
    ]
  },
  {
    key: 'ai-data',
    name: 'Искусственный интеллект и работа с данными',
    icon: '🧠',
    accent: '#2dd4bf',
    stroke: 'rgba(45,212,191,0.28)',
    descriptionForAi: 'Введение в ИИ, промпт-инжиниринг, обработка данных, обучение моделей, ИИ-агенты.',
    stars: [
      {
        name: 'Введение в ИИ',
        level: 'Низкий (Начальный)',
        description: 'Ребёнок узнаёт, что такое искусственный интеллект, где он встречается в жизни и чем машинное мышление отличается от человеческого, на понятных примерах.',
        dx: -115, dy: -70,
        resources: {
          online:  { title: 'Курс «Быстрый старт в искусственный интеллект»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/80782' },
          tool:    { title: 'Teachable Machine', detail1: 'Онлайн-сервис от Google, обучающий простую нейросеть распознавать образы прямо в браузере.', detail2: 'Бесплатно', link: 'https://teachablemachine.withgoogle.com' }
        }
      },
      {
        name: 'Промпт-инжиниринг',
        level: 'Допустимый (Базовый)',
        description: 'Учимся грамотно формулировать запросы к нейросетям, чтобы получать точные и полезные ответы, картинки и тексты для учёбы и творчества.',
        dx: -30, dy: -30,
        resources: {
          online:  { title: 'Курс «Промт-инжиниринг с нуля»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/243614' },
          tool:    { title: 'ChatGPT', detail1: 'Чат-бот на основе большой языковой модели для практики составления запросов.', detail2: 'Freemium', link: 'https://chat.openai.com' }
        }
      },
      {
        name: 'Обработка данных на Python',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок учится писать программы на Python, которые читают таблицы, считают и строят графики, превращая набор чисел в понятные выводы.',
        dx: 50, dy: -90,
        resources: {
          online:  { title: 'Курс «Анализ данных на Python»', detail1: 'Coursera', detail2: '14 часов', link: 'https://www.coursera.org/learn/python-data-analysis' },
          tool:    { title: 'Jupyter Notebook', detail1: 'Интерактивная среда, где код на Python, графики и заметки объединены в одном документе.', detail2: 'Бесплатно', link: 'https://jupyter.org' }
        }
      },
      {
        name: 'Обучение ML-моделей',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся создавать и обучать модели машинного обучения на примерах: показываем компьютеру данные, чтобы он научился делать предсказания сам.',
        dx: 80, dy: 50,
        resources: {
          online:  { title: 'Курс «Машинное обучение: начальный уровень»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/229868' },
          tool:    { title: 'Google Colab', detail1: 'Бесплатная облачная среда для обучения моделей на Python без установки программ.', detail2: 'Бесплатно', link: 'https://colab.research.google.com' }
        }
      },
      {
        name: 'Создание ИИ-агентов',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок собирает умных ассистентов, которые сами выполняют цепочки задач, обращаются к инструментам и достигают поставленной цели.',
        dx: -15, dy: 110,
        resources: {
          online:  { title: 'Курс «Введение в разработку ИИ-агентов»', detail1: 'Stepik', detail2: 'Бесплатно', link: 'https://stepik.org/course/272932' },
          tool:    { title: 'LangChain', detail1: 'Фреймворк для создания приложений и агентов на основе больших языковых моделей.', detail2: 'Бесплатно', link: 'https://www.langchain.com' }
        }
      }
    ]
  }
];
