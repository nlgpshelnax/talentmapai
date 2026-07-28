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
          offline: { title: 'Мастер-класс «Первые шаги в графике»', detail1: 'Студия «КосмоДетство», Ленинский пр-т, 45', detail2: 'Бесплатно', link: 'https://example-studio.ru/graphics-intro', city: 'Москва' },
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
          offline: { title: 'Курс «Слои и коллаж в Photoshop»', detail1: 'ЦДТ «Радуга», ул. Марата, 12', detail2: '1 200 ₽', link: 'https://example-cdt.ru/photoshop-layers', city: 'Санкт-Петербург' },
          online:  { title: 'Онлайн-курс «Adobe Photoshop: слои и маски»', detail1: 'Stepik', detail2: '4 часа', link: 'https://stepik.org/course/photoshop-layers' },
          tool:    { title: 'Adobe Photoshop', detail1: 'Профессиональный растровый редактор для монтажа, ретуши и работы со слоями.', detail2: 'Пробная версия', link: 'https://www.adobe.com/ru/products/photoshop.html' }
        }
      },
      {
        name: 'Векторная графика',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок рисует логотипы и иконки кривыми Безье — такие изображения можно увеличивать до любого размера без потери чёткости.',
        dx: 35, dy: -30,
        resources: {
          offline: { title: 'Мастер-класс «Векторные иллюстрации»', detail1: 'IT-куб, ул. Пушкина, 30', detail2: 'Бесплатно', link: 'https://example-itcube.ru/vector-art', city: 'Казань' },
          online:  { title: 'Курс «Векторная графика в Figma»', detail1: 'Skillbox', detail2: '6 часов', link: 'https://skillbox.ru/course/vector-figma' },
          tool:    { title: 'Inkscape', detail1: 'Свободный векторный редактор для создания иллюстраций, логотипов и иконок.', detail2: 'Бесплатно', link: 'https://inkscape.org' }
        }
      },
      {
        name: 'Текстурирование и материалы',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся создавать реалистичные поверхности — дерево, металл, ткань — с помощью текстур, узоров и карт, чтобы рисунок выглядел объёмным и живым.',
        dx: 95, dy: 55,
        resources: {
          offline: { title: 'Курс «Цифровые текстуры и паттерны»', detail1: 'Центр «Точка кипения», пр-т Ленина, 88', detail2: '1 800 ₽', link: 'https://example-tochka.ru/textures', city: 'Екатеринбург' },
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
          offline: { title: 'Профкурс «Цифровая живопись и ретушь»', detail1: 'Школа искусств «Палитра», ул. Свободы, 5', detail2: '2 500 ₽', link: 'https://example-palitra.ru/digital-painting', city: 'Новосибирск' },
          online:  { title: 'Курс «Цифровая иллюстрация для художников»', detail1: 'Coursera', detail2: '12 часов', link: 'https://www.coursera.org/learn/digital-painting' },
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
          offline: { title: 'Мастер-класс «Скетчинг для начинающих»', detail1: 'Арт-студия «Кисточка», ул. Баумана, 7', detail2: 'Бесплатно', link: 'https://example-artstudio.ru/sketching', city: 'Казань' },
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
          offline: { title: 'Курс «Концепт-дизайн предметов»', detail1: 'Кванториум, ул. Горького, 21', detail2: '1 400 ₽', link: 'https://example-kvantorium.ru/concept-art', city: 'Нижний Новгород' },
          online:  { title: 'Курс «Концепт-арт с нуля»', detail1: 'Skillbox', detail2: '8 часов', link: 'https://skillbox.ru/course/concept-art' },
          tool:    { title: 'Krita', detail1: 'Бесплатный графический редактор, удобный для концепт-артов и раскадровок.', detail2: 'Бесплатно', link: 'https://krita.org' }
        }
      },
      {
        name: 'Эргономика изделий',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок узнаёт, как делать вещи удобными для человека: подбирать размеры, форму ручек и кнопок так, чтобы предметом было приятно и безопасно пользоваться.',
        dx: 15, dy: -105,
        resources: {
          offline: { title: 'Мастер-класс «Удобные вещи: эргономика»', detail1: 'ЦМИТ «Идея», ул. Мира, 14', detail2: 'Бесплатно', link: 'https://example-cmit.ru/ergonomics', city: 'Екатеринбург' },
          online:  { title: 'Курс «Эргономика и дизайн среды»', detail1: '«Сириус.Курсы»', detail2: '5 часов', link: 'https://edu.sirius.online/courses/ergonomics' },
          tool:    { title: 'Figma', detail1: 'Онлайн-редактор для проектирования интерфейсов и схем взаимодействия человека с предметом.', detail2: 'Freemium', link: 'https://www.figma.com' }
        }
      },
      {
        name: 'Прототипирование из картона',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся превращать эскиз в настоящий объёмный макет из картона и подручных материалов, чтобы проверить идею руками до её изготовления.',
        dx: 95, dy: -45,
        resources: {
          offline: { title: 'Воркшоп «Быстрое прототипирование»', detail1: 'Мейкерспейс «Верстак», ул. Ленина, 60', detail2: '900 ₽', link: 'https://example-verstak.ru/cardboard-proto', city: 'Санкт-Петербург' },
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
          offline: { title: 'Тренинг «Защита проекта и питчинг»', detail1: 'Точка кипения, ул. Кремлёвская, 35', detail2: '1 600 ₽', link: 'https://example-tochka.ru/pitching', city: 'Казань' },
          online:  { title: 'Курс «Как презентовать свой проект»', detail1: 'Stepik', detail2: '4 часа', link: 'https://stepik.org/course/project-presentation' },
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
          offline: { title: 'Кружок «Основы черчения»', detail1: 'Дом техники, ул. Советская, 18', detail2: 'Бесплатно', link: 'https://example-domtehniki.ru/drawing-2d', city: 'Новосибирск' },
          online:  { title: 'Курс «Инженерное черчение для школьников»', detail1: '«Сириус.Курсы»', detail2: '6 часов', link: 'https://edu.sirius.online/courses/engineering-drawing' },
          tool:    { title: 'LibreCAD', detail1: 'Бесплатная программа для создания двумерных технических чертежей.', detail2: 'Бесплатно', link: 'https://librecad.org' }
        }
      },
      {
        name: '3D-моделирование деталей',
        level: 'Допустимый (Базовый)',
        description: 'Учимся строить объёмные модели деталей на компьютере: выдавливать, вращать и вырезать формы, превращая плоский эскиз в трёхмерный предмет.',
        dx: 10, dy: -95,
        resources: {
          offline: { title: 'Курс «3D-моделирование деталей»', detail1: 'Кванториум, пр-т Гагарина, 24', detail2: '1 500 ₽', link: 'https://example-kvantorium.ru/3d-parts', city: 'Нижний Новгород' },
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
          offline: { title: 'Мастер-класс «Сборочные единицы»', detail1: 'IT-куб, ул. Кирова, 41', detail2: '1 200 ₽', link: 'https://example-itcube.ru/assembly', city: 'Екатеринбург' },
          online:  { title: 'Курс «Сборочные чертежи в САПР»', detail1: 'Stepik', detail2: '7 часов', link: 'https://stepik.org/course/assembly-drawings' },
          tool:    { title: 'FreeCAD', detail1: 'Свободная система для параметрического 3D-моделирования и сборки узлов.', detail2: 'Бесплатно', link: 'https://www.freecad.org' }
        }
      },
      {
        name: 'Анимация механизмов',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся оживлять сборку: задаём движение шестерёнкам и рычагам, чтобы наглядно показать, как работает механизм, и найти ошибки до сборки.',
        dx: 45, dy: 70,
        resources: {
          offline: { title: 'Воркшоп «Кинематика и анимация»', detail1: 'Технопарк «Сфера», ул. Победы, 9', detail2: '1 900 ₽', link: 'https://example-sfera.ru/mechanism-animation', city: 'Санкт-Петербург' },
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
          offline: { title: 'Профкурс «Визуализация изделий»', detail1: 'Центр «Точка кипения», ул. Баумана, 52', detail2: '2 400 ₽', link: 'https://example-tochka.ru/cad-render', city: 'Казань' },
          online:  { title: 'Курс «Фотореалистичный рендер в KeyShot»', detail1: 'Coursera', detail2: '10 часов', link: 'https://www.coursera.org/learn/product-rendering' },
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
          offline: { title: 'Кружок «Алгоритмика для детей»', detail1: 'IT-куб, ул. Ленина, 33', detail2: 'Бесплатно', link: 'https://example-itcube.ru/algorithms', city: 'Москва' },
          online:  { title: 'Курс «Основы программирования на Scratch»', detail1: '«Сириус.Курсы»', detail2: '5 часов', link: 'https://edu.sirius.online/courses/scratch-basics' },
          tool:    { title: 'Scratch', detail1: 'Визуальная среда, где программы собираются из цветных блоков — идеальный старт для детей.', detail2: 'Бесплатно', link: 'https://scratch.mit.edu' }
        }
      },
      {
        name: 'Вёрстка (HTML/CSS)',
        level: 'Допустимый (Базовый)',
        description: 'Учимся создавать веб-страницы: размечать текст и картинки тегами HTML и оформлять их цветом, шрифтами и расположением с помощью CSS.',
        dx: -45, dy: -95,
        resources: {
          offline: { title: 'Курс «Создай свой первый сайт»', detail1: 'Школа «Кодабра», ул. Рубинштейна, 8', detail2: '1 300 ₽', link: 'https://example-kodabra.ru/html-css', city: 'Санкт-Петербург' },
          online:  { title: 'Курс «Вёрстка сайтов: HTML и CSS»', detail1: 'Stepik', detail2: '8 часов', link: 'https://stepik.org/course/html-css-basics' },
          tool:    { title: 'Visual Studio Code', detail1: 'Бесплатный редактор кода с подсказками и подсветкой синтаксиса для вёрстки.', detail2: 'Бесплатно', link: 'https://code.visualstudio.com' }
        }
      },
      {
        name: 'Интерактивность (JavaScript)',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок оживляет страницы с помощью JavaScript: делает кнопки рабочими, реагирует на клики и создаёт простые интерактивные игры прямо в браузере.',
        dx: 30, dy: -15,
        resources: {
          offline: { title: 'Курс «Первый код на JavaScript»', detail1: 'Кванториум, пр-т Мира, 19', detail2: '1 500 ₽', link: 'https://example-kvantorium.ru/javascript', city: 'Казань' },
          online:  { title: 'Курс «JavaScript для начинающих»', detail1: 'Skillbox', detail2: '10 часов', link: 'https://skillbox.ru/course/javascript-basics' },
          tool:    { title: 'CodePen', detail1: 'Онлайн-песочница, где можно писать HTML, CSS и JavaScript и сразу видеть результат.', detail2: 'Freemium', link: 'https://codepen.io' }
        }
      },
      {
        name: 'Создание веб-приложений',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся собирать полноценные приложения из компонентов, хранить данные и связывать интерфейс с логикой, чтобы сайт умел запоминать и обрабатывать информацию.',
        dx: -20, dy: 90,
        resources: {
          offline: { title: 'Курс «Веб-приложения на React»', detail1: 'Школа «Алгоритмика», ул. Свердлова, 27', detail2: '2 100 ₽', link: 'https://example-algoritmika.ru/web-apps', city: 'Новосибирск' },
          online:  { title: 'Курс «Разработка веб-приложений»', detail1: 'Coursera', detail2: '15 часов', link: 'https://www.coursera.org/learn/web-applications' },
          tool:    { title: 'React', detail1: 'Популярная библиотека для создания интерактивных пользовательских интерфейсов из компонентов.', detail2: 'Бесплатно', link: 'https://react.dev' }
        }
      },
      {
        name: 'Разработка мобильных интерфейсов',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок проектирует и программирует удобные приложения для смартфонов, учитывая жесты, разные экраны и правила мобильного дизайна.',
        dx: 110, dy: 45,
        resources: {
          offline: { title: 'Профкурс «Мобильные приложения»', detail1: 'IT-парк, ул. Петербургская, 52', detail2: '2 600 ₽', link: 'https://example-itpark.ru/mobile-dev', city: 'Казань' },
          online:  { title: 'Курс «Мобильная разработка на Flutter»', detail1: 'Stepik', detail2: '18 часов', link: 'https://stepik.org/course/flutter-mobile' },
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
          offline: { title: 'Кружок «Юный электронщик»', detail1: 'Станция юных техников, ул. Гагарина, 6', detail2: 'Бесплатно', link: 'https://example-syt.ru/electronics-intro', city: 'Нижний Новгород' },
          online:  { title: 'Курс «Основы электроники для детей»', detail1: '«Сириус.Курсы»', detail2: '4 часа', link: 'https://edu.sirius.online/courses/electronics-basics' },
          tool:    { title: 'Tinkercad Circuits', detail1: 'Онлайн-симулятор электронных схем, где можно собирать цепи без реальных деталей.', detail2: 'Бесплатно', link: 'https://www.tinkercad.com/circuits' }
        }
      },
      {
        name: 'Программирование Arduino',
        level: 'Допустимый (Базовый)',
        description: 'Учимся управлять платой Arduino: писать код, зажигать светодиоды по программе, считывать кнопки и заставлять электронику выполнять команды.',
        dx: 55, dy: -70,
        resources: {
          offline: { title: 'Курс «Arduino: первые проекты»', detail1: 'Кванториум, ул. Новая, 14', detail2: '1 400 ₽', link: 'https://example-kvantorium.ru/arduino', city: 'Екатеринбург' },
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
          offline: { title: 'Мастер-класс «Датчики и моторы»', detail1: 'ЦМИТ «Робик», ул. Лесная, 22', detail2: '1 600 ₽', link: 'https://example-cmit.ru/sensors', city: 'Казань' },
          online:  { title: 'Курс «Датчики в робототехнике»', detail1: 'Stepik', detail2: '7 часов', link: 'https://stepik.org/course/robotics-sensors' },
          tool:    { title: 'Fritzing', detail1: 'Программа для проектирования электронных схем и разводки плат с датчиками.', detail2: 'Пробная версия', link: 'https://fritzing.org' }
        }
      },
      {
        name: 'Автономные роботы',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся создавать роботов, которые действуют сами: объезжают препятствия, едут по линии и принимают решения на основе показаний датчиков.',
        dx: 40, dy: 45,
        resources: {
          offline: { title: 'Курс «Автономные роботы»', detail1: 'Технопарк «Сфера», пр-т Науки, 31', detail2: '2 200 ₽', link: 'https://example-sfera.ru/autonomous-robots', city: 'Санкт-Петербург' },
          online:  { title: 'Курс «Программирование автономных роботов»', detail1: 'Coursera', detail2: '12 часов', link: 'https://www.coursera.org/learn/autonomous-robots' },
          tool:    { title: 'Webots', detail1: 'Бесплатный симулятор для разработки и тестирования автономных роботов в 3D.', detail2: 'Бесплатно', link: 'https://cyberbotics.com' }
        }
      },
      {
        name: 'Проектирование сложных систем',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок объединяет несколько модулей и микроконтроллеров в единую систему, связывает их обменом данными и управляет всем комплексом.',
        dx: -25, dy: 120,
        resources: {
          offline: { title: 'Профкурс «Робототехнические комплексы»', detail1: 'IT-парк, ул. Спартака, 48', detail2: '2 800 ₽', link: 'https://example-itpark.ru/complex-systems', city: 'Новосибирск' },
          online:  { title: 'Курс «Инженерия сложных систем»', detail1: 'Stepik', detail2: '20 часов', link: 'https://stepik.org/course/complex-systems' },
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
          offline: { title: 'Мастер-класс «Придумай свою игру»', detail1: 'Школа «Кодабра», ул. Тверская, 15', detail2: 'Бесплатно', link: 'https://example-kodabra.ru/game-concept', city: 'Москва' },
          online:  { title: 'Курс «Основы геймдизайна для детей»', detail1: '«Сириус.Курсы»', detail2: '5 часов', link: 'https://edu.sirius.online/courses/gamedesign-basics' },
          tool:    { title: 'Twine', detail1: 'Бесплатный инструмент для создания интерактивных текстовых историй и сюжетов игр.', detail2: 'Бесплатно', link: 'https://twinery.org' }
        }
      },
      {
        name: 'Игровые движки (Unity/Godot)',
        level: 'Допустимый (Базовый)',
        description: 'Учимся работать в игровом движке: размещать объекты на сцене, добавлять физику и картинки и запускать свою первую играбельную сцену.',
        dx: -5, dy: -100,
        resources: {
          offline: { title: 'Курс «Первая игра на Godot»', detail1: 'IT-куб, ул. Пушкина, 40', detail2: '1 500 ₽', link: 'https://example-itcube.ru/godot-intro', city: 'Казань' },
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
          offline: { title: 'Курс «Скрипты и логика игр»', detail1: 'Кванториум, ул. Мира, 28', detail2: '1 700 ₽', link: 'https://example-kvantorium.ru/game-logic', city: 'Екатеринбург' },
          online:  { title: 'Курс «Программирование игровой логики»', detail1: 'Stepik', detail2: '10 часов', link: 'https://stepik.org/course/game-logic' },
          tool:    { title: 'Unity', detail1: 'Один из самых популярных движков для создания игр с богатым набором инструментов.', detail2: 'Freemium', link: 'https://unity.com' }
        }
      },
      {
        name: 'Левел-дизайн',
        level: 'Высокий (Прогрессивный)',
        description: 'Учимся проектировать уровни: расставлять препятствия, награды и врагов так, чтобы игра была интересной, честной и в меру сложной для игрока.',
        dx: 70, dy: 60,
        resources: {
          offline: { title: 'Воркшоп «Дизайн игровых уровней»', detail1: 'Технопарк «Сфера», пр-т Стачек, 47', detail2: '2 000 ₽', link: 'https://example-sfera.ru/level-design', city: 'Санкт-Петербург' },
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
          offline: { title: 'Профкурс «Выпуск и продвижение игры»', detail1: 'IT-парк, ул. Островского, 55', detail2: '2 500 ₽', link: 'https://example-itpark.ru/game-publishing', city: 'Казань' },
          online:  { title: 'Курс «Как выпустить свою игру»', detail1: 'Coursera', detail2: '9 часов', link: 'https://www.coursera.org/learn/game-publishing' },
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
          offline: { title: 'Лекторий «Что такое ИИ?»', detail1: 'Музей науки «Экспериментаниум», Ленинградский пр-т, 80', detail2: 'Бесплатно', link: 'https://example-museum.ru/ai-intro', city: 'Москва' },
          online:  { title: 'Курс «Введение в искусственный интеллект»', detail1: '«Сириус.Курсы»', detail2: '4 часа', link: 'https://edu.sirius.online/courses/ai-intro' },
          tool:    { title: 'Teachable Machine', detail1: 'Онлайн-сервис от Google, обучающий простую нейросеть распознавать образы прямо в браузере.', detail2: 'Бесплатно', link: 'https://teachablemachine.withgoogle.com' }
        }
      },
      {
        name: 'Промпт-инжиниринг',
        level: 'Допустимый (Базовый)',
        description: 'Учимся грамотно формулировать запросы к нейросетям, чтобы получать точные и полезные ответы, картинки и тексты для учёбы и творчества.',
        dx: -30, dy: -30,
        resources: {
          offline: { title: 'Мастер-класс «Общение с нейросетями»', detail1: 'IT-куб, ул. Профсоюзная, 11', detail2: '1 200 ₽', link: 'https://example-itcube.ru/prompting', city: 'Нижний Новгород' },
          online:  { title: 'Курс «Промпт-инжиниринг для начинающих»', detail1: 'Stepik', detail2: '5 часов', link: 'https://stepik.org/course/prompt-engineering' },
          tool:    { title: 'ChatGPT', detail1: 'Чат-бот на основе большой языковой модели для практики составления запросов.', detail2: 'Freemium', link: 'https://chat.openai.com' }
        }
      },
      {
        name: 'Обработка данных на Python',
        level: 'Допустимый (Базовый)',
        description: 'Ребёнок учится писать программы на Python, которые читают таблицы, считают и строят графики, превращая набор чисел в понятные выводы.',
        dx: 50, dy: -90,
        resources: {
          offline: { title: 'Курс «Python и анализ данных»', detail1: 'Кванториум, ул. Большая, 26', detail2: '1 800 ₽', link: 'https://example-kvantorium.ru/python-data', city: 'Казань' },
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
          offline: { title: 'Курс «Первые шаги в машинном обучении»', detail1: 'Технопарк «Сфера», ул. Химиков, 39', detail2: '2 300 ₽', link: 'https://example-sfera.ru/ml-intro', city: 'Санкт-Петербург' },
          online:  { title: 'Курс «Машинное обучение для школьников»', detail1: 'Stepik', detail2: '16 часов', link: 'https://stepik.org/course/machine-learning-kids' },
          tool:    { title: 'Google Colab', detail1: 'Бесплатная облачная среда для обучения моделей на Python без установки программ.', detail2: 'Бесплатно', link: 'https://colab.research.google.com' }
        }
      },
      {
        name: 'Создание ИИ-агентов',
        level: 'Экспертный (Профи)',
        description: 'Финальный уровень: ребёнок собирает умных ассистентов, которые сами выполняют цепочки задач, обращаются к инструментам и достигают поставленной цели.',
        dx: -15, dy: 110,
        resources: {
          offline: { title: 'Профкурс «Разработка ИИ-агентов»', detail1: 'IT-парк, ул. Технологическая, 63', detail2: '2 900 ₽', link: 'https://example-itpark.ru/ai-agents', city: 'Новосибирск' },
          online:  { title: 'Курс «Создание ИИ-агентов»', detail1: 'Coursera', detail2: '18 часов', link: 'https://www.coursera.org/learn/ai-agents' },
          tool:    { title: 'LangChain', detail1: 'Фреймворк для создания приложений и агентов на основе больших языковых моделей.', detail2: 'Бесплатно', link: 'https://www.langchain.com' }
        }
      }
    ]
  }
];
