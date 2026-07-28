import { Link } from 'react-router-dom';
import {
  Sparkles,
  Compass,
  Map as MapIcon,
  Route,
  Trophy,
  Palette,
  FolderOpen,
  Gamepad2,
  Users,
  User,
  ChevronDown,
  ArrowRight,
  Rocket,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { Button, Badge } from '../components/ui';

/* ---------------------------------------------------------- decorative art */

/** A small constellation drawn inline; purely decorative, hidden from a11y tree. */
function Constellation() {
  const stars = [
    { cx: 40, cy: 60, r: 2.5, delay: '0s' },
    { cx: 120, cy: 40, r: 3.5, delay: '0.6s' },
    { cx: 210, cy: 90, r: 2, delay: '1.2s' },
    { cx: 290, cy: 50, r: 4, delay: '0.3s' },
    { cx: 250, cy: 160, r: 2.5, delay: '0.9s' },
    { cx: 150, cy: 150, r: 3, delay: '1.5s' },
    { cx: 70, cy: 180, r: 2, delay: '0.4s' },
    { cx: 330, cy: 130, r: 2.5, delay: '1.1s' },
  ];
  const lines = [
    [0, 1],
    [1, 3],
    [3, 7],
    [3, 4],
    [4, 5],
    [5, 6],
    [5, 2],
    [1, 2],
  ];

  return (
    <svg
      viewBox="0 0 380 220"
      className="h-full w-full"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="rgba(251, 191, 36, 0.35)" strokeWidth="1">
        {lines.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={stars[a].cx}
            y1={stars[a].cy}
            x2={stars[b].cx}
            y2={stars[b].cy}
          />
        ))}
      </g>
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill="#fcd34d"
          className="animate-twinkle"
          style={{ animationDelay: s.delay }}
        />
      ))}
    </svg>
  );
}

/* --------------------------------------------------------------- section data */

const STEPS = [
  {
    Icon: Compass,
    title: 'Диагностика',
    text: '12 вопросов, около 3 минут. Простые ситуации и интересы — без тестов на оценку.',
  },
  {
    Icon: MapIcon,
    title: 'Карта созвездий',
    text: 'По ответам строится персональная звёздная карта сильных сторон ребёнка.',
  },
  {
    Icon: Route,
    title: 'Рекомендации',
    text: 'Пошаговые шаги роста: кружки, онлайн-курсы и полезные ИТ-инструменты.',
  },
];

const BENEFITS = [
  { Icon: Sparkles, title: '14 направлений', text: 'От искусства и спорта до программирования и науки.' },
  { Icon: Trophy, title: '70 навыков', text: 'Каждое направление раскрывается в конкретные умения.' },
  { Icon: FolderOpen, title: 'Прогресс и портфолио', text: 'Отслеживайте рост и собирайте работы в одном месте.' },
  { Icon: Gamepad2, title: 'Геймификация', text: 'XP за шаги и магазин наград — учиться интересно.' },
];

const AUDIENCES = [
  {
    Icon: Users,
    badge: 'Родителям',
    title: 'Детям 6–14 лет',
    points: [
      'Понять, к чему у ребёнка склонность',
      'Подобрать кружки и занятия рядом',
      'Видеть прогресс без давления и оценок',
    ],
  },
  {
    Icon: User,
    badge: 'Подросткам',
    title: 'Подросткам 12–18 лет',
    points: [
      'Разобраться в своих сильных сторонах',
      'Найти курсы и инструменты для роста',
      'Собрать портфолио для будущего',
    ],
  },
];

const FAQ = [
  {
    q: 'Для какого возраста подходит?',
    a: 'Для детей и подростков 6–18 лет. Для младших диагностику удобно проходить вместе с родителем, подростки справляются сами.',
  },
  {
    q: 'Сколько это стоит?',
    a: 'Построить карту таланта и пройти диагностику можно бесплатно. Расширенные возможности подключаются по желанию.',
  },
  {
    q: 'Нужен ли компьютер?',
    a: 'Нет. Диагностика и карта открываются в браузере на телефоне, планшете или компьютере — как вам удобнее.',
  },
  {
    q: 'А есть офлайн-кружки в моём городе?',
    a: 'При регистрации можно указать город, и в рекомендациях появятся не только онлайн-курсы, но и подходящие офлайн-кружки поблизости.',
  },
  {
    q: 'Это тест с оценками?',
    a: 'Нет. Мы не выставляем баллы и не сравниваем детей между собой — мы помогаем увидеть сильные стороны и направления для развития.',
  },
];

/* ------------------------------------------------------------------ sub-parts */

function SectionHeading({ id, eyebrow, title, subtitle }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      {eyebrow && (
        <span className="text-sm font-semibold uppercase tracking-wider text-gold-400">{eyebrow}</span>
      )}
      <h2 id={id} className="mt-2 text-3xl font-extrabold text-white text-balance sm:text-4xl">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-base text-slate-400">{subtitle}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ the page */

export default function PublicLanding() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="space-gradient min-h-screen">
      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-space-950/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-lg font-display font-extrabold text-white transition hover:text-gold-300"
          >
            <Sparkles size={22} className="text-gold-400" aria-hidden="true" />
            TalentMap&nbsp;AI
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Основная навигация">
            {isAuthenticated ? (
              <Button as={Link} to="/app" size="sm">
                Перейти в приложение
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            ) : (
              <>
                <Button as={Link} to="/login" variant="ghost" size="sm">
                  Войти
                </Button>
                <Button as={Link} to="/register" size="sm">
                  Начать
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* --------------------------------------------------------- hero */}
        <section className="relative overflow-hidden px-4 pt-16 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div className="text-center lg:text-left">
              <Badge tone="gold" className="mb-5">
                <Sparkles size={13} aria-hidden="true" />
                Диагностика за 3 минуты
              </Badge>
              <h1 className="text-4xl font-extrabold leading-tight text-white text-balance sm:text-5xl lg:text-6xl">
                Постройте карту таланта вашего ребёнка
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg text-slate-300 text-balance lg:mx-0">
                Пройдите короткую диагностику из 12 вопросов и получите персональную карту
                созвездий сильных сторон — с понятными шагами, куда расти дальше.
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start">
                {isAuthenticated ? (
                  <Button as={Link} to="/app" size="lg">
                    <Rocket size={18} aria-hidden="true" />
                    Перейти в приложение
                  </Button>
                ) : (
                  <>
                    <Button as={Link} to="/register" size="lg">
                      <Rocket size={18} aria-hidden="true" />
                      Построить карту таланта
                    </Button>
                    <Button as={Link} to="/login" variant="secondary" size="lg">
                      Войти
                    </Button>
                  </>
                )}
              </div>
              <p className="mt-4 text-sm text-slate-500">
                Бесплатно · Без оценок и сравнений · Для детей 6–18 лет
              </p>
            </div>

            {/* Decorative constellation */}
            <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
              <div className="glass animate-float rounded-3xl p-6 sm:p-8">
                <div className="aspect-[380/220] w-full">
                  <Constellation />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- how it works */}
        <section className="px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="how-heading">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              id="how-heading"
              eyebrow="Как это работает"
              title="Три шага к карте таланта"
            />
            <ol className="grid gap-6 sm:grid-cols-3">
              {STEPS.map(({ Icon, title, text }, i) => (
                <li key={title} className="glass relative rounded-2xl p-6">
                  <span
                    className="absolute right-5 top-5 font-display text-5xl font-extrabold text-white/5"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
                    <Icon size={24} aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* --------------------------------------------------- what you get */}
        <section className="px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="benefits-heading">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              id="benefits-heading"
              eyebrow="Что получает ребёнок"
              title="Больше, чем просто тест"
              subtitle="Целостная система развития — от первой диагностики до собранного портфолио работ."
            />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {BENEFITS.map(({ Icon, title, text }) => (
                <div key={title} className="glass rounded-2xl p-6 text-center sm:text-left">
                  <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-nebula-400/15 text-nebula-400 sm:mx-0">
                    <Icon size={24} aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- for whom */}
        <section className="px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="audience-heading">
          <div className="mx-auto max-w-5xl">
            <SectionHeading id="audience-heading" eyebrow="Для кого" title="Родителям и подросткам" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {AUDIENCES.map(({ Icon, badge, title, points }) => (
                <div key={title} className="glass-strong rounded-3xl p-7">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gold-400/15 text-gold-300">
                      <Icon size={24} aria-hidden="true" />
                    </div>
                    <Badge tone="gold">{badge}</Badge>
                  </div>
                  <h3 className="text-xl font-bold text-white">{title}</h3>
                  <ul className="mt-4 space-y-2.5">
                    {points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-sm text-slate-300">
                        <Sparkles size={16} className="mt-0.5 shrink-0 text-gold-400" aria-hidden="true" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- faq */}
        <section className="px-4 py-16 sm:px-6 sm:py-20" aria-labelledby="faq-heading">
          <div className="mx-auto max-w-3xl">
            <SectionHeading id="faq-heading" eyebrow="Вопросы и ответы" title="Частые вопросы" />
            <div className="space-y-3">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="glass group rounded-2xl px-5 py-4 [&_summary]:list-none">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold text-white">
                    <span>{q}</span>
                    <ChevronDown
                      size={20}
                      aria-hidden="true"
                      className="shrink-0 text-gold-400 transition-transform duration-200 group-open:rotate-180"
                    />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- final cta */}
        <section className="px-4 pb-8 sm:px-6" aria-labelledby="cta-heading">
          <div className="mx-auto max-w-5xl">
            <div className="glass-strong relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-12 sm:py-16">
              <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
                <Constellation />
              </div>
              <div className="relative">
                <h2 id="cta-heading" className="text-3xl font-extrabold text-white text-balance sm:text-4xl">
                  Откройте таланты вашего ребёнка уже сегодня
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-base text-slate-300">
                  Три минуты на диагностику — и персональная карта созвездий готова.
                </p>
                <div className="mt-8 flex justify-center">
                  {isAuthenticated ? (
                    <Button as={Link} to="/app" size="lg">
                      <Rocket size={18} aria-hidden="true" />
                      Перейти в приложение
                    </Button>
                  ) : (
                    <Button as={Link} to="/register" size="lg">
                      <Rocket size={18} aria-hidden="true" />
                      Построить карту таланта
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------------- footer */}
      <footer className="border-t border-white/5 px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="inline-flex items-center gap-2 font-display font-extrabold text-white">
            <Sparkles size={20} className="text-gold-400" aria-hidden="true" />
            TalentMap&nbsp;AI
          </div>
          <nav className="flex items-center gap-5 text-sm text-slate-400" aria-label="Ссылки в подвале">
            <Link to="/register" className="transition hover:text-gold-300">
              Регистрация
            </Link>
            <Link to="/login" className="transition hover:text-gold-300">
              Вход
            </Link>
          </nav>
          <p className="text-sm text-slate-500">Карта таланта для детей 6–18 лет</p>
        </div>
      </footer>
    </div>
  );
}
