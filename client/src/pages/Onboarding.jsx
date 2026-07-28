import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  ListChecks,
  Rocket,
  Sparkles,
  Trophy,
  User,
  Users,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { Button, cx } from '../components/ui';

/* ------------------------------------------------------------------ данные */

const ROLES = [
  {
    value: 'parent',
    title: 'Я родитель',
    description: 'Отвечаю на вопросы о своём ребёнке и помогаю выбрать направление.',
    icon: Users,
  },
  {
    value: 'child',
    title: 'Я подросток (12+)',
    description: 'Хочу сам пройти тест и узнать, в чём мои сильные стороны.',
    icon: User,
  },
];

const WELCOME_SLIDES = [
  {
    icon: ListChecks,
    title: 'Ответьте на 12 коротких вопросов',
    text: 'Это займёт около 3 минут — простые вопросы для родителя и для ребёнка.',
  },
  {
    icon: Sparkles,
    title: 'ИИ построит персональную карту',
    text: 'На основе ответов мы соберём карту созвездий компетенций именно для вас.',
  },
  {
    icon: Trophy,
    title: 'Отмечайте шаги и собирайте портфолио',
    text: 'Проходите звёзды маршрута, фиксируйте достижения и растите вместе.',
  },
];

const STEPS = ['role', 'welcome', 'ready'];
const STEP_LABELS = { role: 'Кто вы', welcome: 'Как это работает', ready: 'Старт' };

/* ------------------------------------------------------------- компоненты */

function StepProgress({ current }) {
  const index = STEPS.indexOf(current);
  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-3" aria-label="Прогресс подготовки">
      {STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={step} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  active && 'bg-gold-400 text-space-950 shadow-glow-gold',
                  done && 'bg-gold-400/20 text-gold-300 ring-1 ring-gold-400/40',
                  !active && !done && 'bg-white/10 text-slate-400'
                )}
              >
                {i + 1}
              </span>
              <span
                className={cx(
                  'hidden text-xs font-medium sm:inline',
                  active ? 'text-gold-300' : 'text-slate-500'
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={cx('h-px w-6 sm:w-10', i < index ? 'bg-gold-400/50' : 'bg-white/10')}
              />
            )}
          </li>
        );
      })}
      <li className="sr-only" aria-live="polite">
        Шаг {index + 1} из {STEPS.length}: {STEP_LABELS[current]}
      </li>
    </ol>
  );
}

/* -------------------------------------------------------------------- шаги */

function RoleStep({ role, onSelect, headingRef }) {
  const cardsRef = useRef([]);

  const focusCard = (i) => {
    const total = ROLES.length;
    const next = (i + total) % total;
    cardsRef.current[next]?.focus();
  };

  const onKeyDown = (e, index) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusCard(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusCard(index - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(ROLES[index].value);
        break;
      default:
        break;
    }
  };

  return (
    <div>
      <div className="text-center">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-white outline-none sm:text-4xl">
          Кто будет проходить тест?
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-balance text-slate-300">
          Мы подстроим вопросы и формулировки под вас. Выбор можно поменять в любой момент.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="Кто проходит тест">
        {ROLES.map((item, index) => {
          const Icon = item.icon;
          const selected = role === item.value;
          return (
            <button
              key={item.value}
              type="button"
              ref={(el) => {
                cardsRef.current[index] = el;
              }}
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (!role && index === 0) ? 0 : -1}
              onClick={() => onSelect(item.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cx(
                'glass group flex flex-col items-center gap-4 rounded-2xl p-7 text-center transition-all duration-200',
                'hover:-translate-y-0.5 hover:border-gold-400/40',
                selected
                  ? 'border-gold-400/70 bg-gold-400/10 ring-2 ring-gold-400/40'
                  : 'border-white/10'
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'flex h-16 w-16 items-center justify-center rounded-2xl transition-colors',
                  selected ? 'bg-gold-400 text-space-950' : 'bg-space-700 text-gold-300 group-hover:bg-space-600'
                )}
              >
                <Icon size={30} />
              </span>
              <span className="text-xl font-bold text-white">{item.title}</span>
              <span className="text-sm text-slate-400">{item.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WelcomeStep({ slide, setSlide, onBack, onNext, onSkip, headingRef }) {
  const active = WELCOME_SLIDES[slide];
  const Icon = active.icon;
  const isFirst = slide === 0;
  const isLast = slide === WELCOME_SLIDES.length - 1;

  return (
    <div>
      <div className="text-center">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-white outline-none sm:text-3xl">
          Как работает TalentMap AI
        </h1>
      </div>

      <div
        className="glass mt-8 flex min-h-[280px] flex-col items-center justify-center gap-5 rounded-2xl px-6 py-10 text-center"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gold-400/15 text-gold-300 animate-float"
        >
          <Icon size={38} />
        </span>
        <p className="text-sm font-semibold uppercase tracking-wide text-gold-400">
          Шаг {slide + 1} из {WELCOME_SLIDES.length}
        </p>
        <h2 className="max-w-md text-balance text-2xl font-bold text-white">{active.title}</h2>
        <p className="max-w-md text-balance text-slate-300">{active.text}</p>
      </div>

      <div className="mt-6 flex justify-center gap-2" role="tablist" aria-label="Слайды">
        {WELCOME_SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={i === slide}
            aria-label={`Слайд ${i + 1}: ${s.title}`}
            onClick={() => setSlide(i)}
            className={cx(
              'h-2.5 rounded-full transition-all duration-200',
              i === slide ? 'w-7 bg-gold-400' : 'w-2.5 bg-white/20 hover:bg-white/40'
            )}
          />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={isFirst ? onBack : () => setSlide(slide - 1)}
          className="gap-1.5"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Назад
        </Button>

        <button
          type="button"
          onClick={onSkip}
          className="rounded-lg px-2 py-1 text-sm text-slate-400 underline-offset-4 transition hover:text-slate-200 hover:underline"
        >
          Пропустить
        </button>

        <Button onClick={isLast ? onNext : () => setSlide(slide + 1)} className="gap-1.5">
          {isLast ? 'Готово' : 'Далее'}
          <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function ReadyStep({ role, onStart, onBack, headingRef }) {
  const roleLabel = role === 'child' ? 'подростка' : 'родителя';
  return (
    <div className="text-center">
      <span
        aria-hidden="true"
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold-400/15 text-gold-300 animate-float"
      >
        <Rocket size={40} />
      </span>
      <h1 ref={headingRef} tabIndex={-1} className="mt-6 text-3xl font-bold text-white outline-none sm:text-4xl">
        Всё готово к запуску!
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-balance text-slate-300">
        Дальше — 12 коротких вопросов в режиме {roleLabel}. Это займёт около 3 минут, а в конце вы
        получите персональную карту созвездий компетенций.
      </p>

      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm text-slate-300">
        <Compass size={16} className="text-gold-300" aria-hidden="true" />
        Готовьтесь отвечать честно — так карта получится точнее.
      </div>

      <div className="mt-9 flex flex-col items-center gap-3">
        <Button size="lg" onClick={onStart} className="w-full max-w-xs gap-2">
          <Sparkles size={18} aria-hidden="true" />
          Начать диагностику
        </Button>
        <Button variant="ghost" onClick={onBack}>
          Назад
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- страница */

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState('role');
  const [role, setRole] = useState(null);
  const [slide, setSlide] = useState(0);

  const headingRef = useRef(null);

  // Перемещаем фокус на заголовок при смене шага — важно для клавиатуры и скринридеров.
  useEffect(() => {
    const timer = setTimeout(() => headingRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [step]);

  const goToDiagnostics = useCallback(() => {
    navigate('/diagnostics', { state: { role: role || 'parent' } });
  }, [navigate, role]);

  const handleSelectRole = useCallback((value) => {
    setRole(value);
    setSlide(0);
    setStep('welcome');
  }, []);

  // Стрелки перелистывают карусель приветствия.
  useEffect(() => {
    if (step !== 'welcome') return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        setSlide((s) => Math.min(s + 1, WELCOME_SLIDES.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setSlide((s) => Math.max(s - 1, 0));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step]);

  return (
    <main className="space-gradient flex min-h-screen flex-col items-center px-5 py-10 sm:py-14">
      <div className="w-full max-w-2xl">
        <header className="mb-8 flex flex-col items-center gap-6">
          <div className="flex items-center gap-2 text-gold-300">
            <Sparkles size={22} aria-hidden="true" />
            <span className="font-display text-lg font-bold tracking-tight text-white">TalentMap AI</span>
          </div>
          <StepProgress current={step} />
        </header>

        <section className="glass-strong rounded-3xl p-6 sm:p-9">
          {step === 'role' && (
            <RoleStep role={role} onSelect={handleSelectRole} headingRef={headingRef} />
          )}
          {step === 'welcome' && (
            <WelcomeStep
              slide={slide}
              setSlide={setSlide}
              onBack={() => setStep('role')}
              onNext={() => setStep('ready')}
              onSkip={() => setStep('ready')}
              headingRef={headingRef}
            />
          )}
          {step === 'ready' && (
            <ReadyStep
              role={role}
              onStart={goToDiagnostics}
              onBack={() => setStep('welcome')}
              headingRef={headingRef}
            />
          )}
        </section>

        {user?.onboarded && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="rounded-lg px-2 py-1 text-sm text-slate-400 underline-offset-4 transition hover:text-slate-200 hover:underline"
            >
              Вернуться в приложение
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
