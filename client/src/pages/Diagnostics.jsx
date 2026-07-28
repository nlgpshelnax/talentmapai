import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  MapPin,
  RotateCcw,
  Sparkles,
  Stars,
} from 'lucide-react';

import api, { errorMessage } from '../lib/api';
import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Field, Spinner, cx, inputClass } from '../components/ui';

const TOTAL = 12;
/**
 * Подписи блоков зависят от того, кто проходит тест. Подростку, который отвечает
 * сам, бессмысленно показывать «Вопросы для родителя» — и тем более спрашивать
 * у него «Сколько лет ребёнку?».
 */
const BLOCK_LABELS = {
  parent: { parent: 'Вопросы для родителя', child: 'Вопросы для ребёнка' },
  child: { parent: 'О тебе', child: 'Твои предпочтения' },
};

/** Текст вопроса в нужном лице: подростку — «ты», родителю — «ваш ребёнок». */
function questionText(question, role) {
  return role === 'child' && question.questionSelf ? question.questionSelf : question.question;
}

/* ------------------------------------------------------- город: автодополнение */

function CityAutocomplete({ question, value, onChange, role }) {
  const inputId = useId();
  const listboxId = `${inputId}-list`;
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef(null);

  // Дебаунс ~250 мс; запрос отменяется при размонтировании и при новом вводе.
  // Всё обновление состояния идёт из колбэка таймера/промиса, а не синхронно
  // в теле эффекта, поэтому лишних каскадных рендеров не возникает.
  useEffect(() => {
    const q = value.trim();
    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      if (!q) {
        setSuggestions([]);
        setHighlight(-1);
        return;
      }
      api
        .get('/diagnostics/cities', { params: { q }, signal: controller.signal })
        .then((res) => {
          if (cancelled) return;
          const cities = Array.isArray(res.data?.cities) ? res.data.cities : [];
          setSuggestions(cities);
          setHighlight(-1);
        })
        .catch(() => {
          // Тихо игнорируем отмену/сбой подсказок — ручной ввод по-прежнему доступен.
          if (!cancelled) setSuggestions([]);
        });
    }, q ? 250 : 0);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [value]);

  // Клик вне поля закрывает список подсказок.
  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const choose = (city) => {
    onChange(city);
    setOpen(false);
    setHighlight(-1);
  };

  const showList = open && value.trim().length > 0 && suggestions.length > 0;

  const onKeyDown = (e) => {
    if (!showList) {
      if (e.key === 'ArrowDown' && suggestions.length) setOpen(true);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        if (highlight >= 0) {
          e.preventDefault();
          choose(suggestions[highlight]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setHighlight(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Field label={questionText(question, role)} hint={question.hint} htmlFor={inputId}>
        <div ref={boxRef} className="relative">
          <MapPin
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gold-300"
          />
          <input
            id={inputId}
            type="text"
            autoComplete="off"
            className={cx(inputClass, 'pl-10')}
            placeholder={question.placeholder || 'Начните вводить название города'}
            value={value}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />

          {showList && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Города"
              className="glass-strong absolute z-20 mt-2 max-h-60 w-full overflow-auto rounded-xl py-1 no-scrollbar"
            >
              {suggestions.map((city, i) => (
                <li
                  key={city}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(city);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={cx(
                    'flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm text-slate-200',
                    i === highlight ? 'bg-gold-400/15 text-white' : 'hover:bg-white/5'
                  )}
                >
                  <MapPin size={14} className="text-gold-300/70" aria-hidden="true" />
                  {city}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
    </div>
  );
}

/* ---------------------------------------------------------- выбор из вариантов */

function ChoiceGrid({ question, value, onChange, role }) {
  const optionsRef = useRef([]);
  const options = question.options || [];

  const focusOption = (i) => {
    const total = options.length;
    if (!total) return;
    const next = (i + total) % total;
    optionsRef.current[next]?.focus();
  };

  const onKeyDown = (e, index) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusOption(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusOption(index - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onChange(options[index].value);
        break;
      default:
        break;
    }
  };

  // Индекс для roving tabindex: выбранный вариант, иначе первый.
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  );

  return (
    <div
      role="radiogroup"
      aria-label={questionText(question, role)}
      className="grid gap-3 sm:grid-cols-2"
    >
      {options.map((option, index) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            ref={(el) => {
              optionsRef.current[index] = el;
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={index === activeIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cx(
              'glass group flex items-center gap-4 rounded-2xl p-4 text-left transition-all duration-200',
              'hover:-translate-y-0.5 hover:border-gold-400/40',
              selected
                ? 'border-gold-400/70 bg-gold-400/10 ring-2 ring-gold-400/40'
                : 'border-white/10'
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl transition-colors',
                selected ? 'bg-gold-400/20' : 'bg-space-700 group-hover:bg-space-600'
              )}
            >
              {option.icon}
            </span>
            <span className="text-base font-medium text-slate-100">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------- межблоковая заставка (child) */

function ChildInterstitial({ onContinue, headingRef, role }) {
  const forSelf = role === 'child';
  return (
    <div className="text-center">
      <span
        aria-hidden="true"
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-nebula-400/15 text-nebula-400 animate-float"
      >
        <Baby size={40} />
      </span>
      <h2 ref={headingRef} tabIndex={-1} className="mt-6 text-2xl font-bold text-white outline-none sm:text-3xl">
        {forSelf ? 'Теперь — про твои вкусы' : 'Теперь вопросы для ребёнка'}
      </h2>
      <p className="mx-auto mt-4 max-w-md text-balance text-slate-300">
        {forSelf
          ? 'Осталось пять коротких вопросов о том, что тебе нравится. Правильных ответов здесь нет — выбирай то, что ближе.'
          : 'Дальше несколько простых вопросов — пусть на них ответит сам ребёнок. Здесь нет правильных или неправильных ответов, выбирай то, что нравится больше!'}
      </p>
      <div className="mt-8">
        <Button size="lg" onClick={onContinue} className="gap-2">
          Поехали
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- экран итога */

function ResultScreen({ result, onOpenMap, onRestart }) {
  const recommended = Array.isArray(result.recommended) ? result.recommended : [];
  return (
    <div>
      <div className="text-center">
        <span
          aria-hidden="true"
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gold-400/15 text-gold-300 animate-float"
        >
          <Stars size={42} />
        </span>
        <h1 className="mt-6 text-3xl font-bold text-white sm:text-4xl">Ваша карта готова!</h1>
        {result.profileText && (
          <p className="mx-auto mt-4 max-w-xl text-balance text-lg font-semibold text-gold-300">
            {result.profileText}
          </p>
        )}
        {result.summary && (
          <p className="mx-auto mt-3 max-w-xl text-balance text-slate-300">{result.summary}</p>
        )}
      </div>

      {recommended.length > 0 && (
        <div className="mt-9">
          <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
            Рекомендованные созвездия
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((item) => (
              <article
                key={item.id ?? item.key}
                className="glass flex flex-col gap-3 rounded-2xl p-5"
                style={item.accent ? { borderColor: `${item.accent}55` } : undefined}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-space-700 text-2xl"
                    style={item.accent ? { backgroundColor: `${item.accent}22` } : undefined}
                  >
                    {item.icon}
                  </span>
                  <h3 className="text-lg font-bold text-white">{item.name}</h3>
                </div>
                {item.reason && <p className="text-sm text-slate-300">{item.reason}</p>}
                {item.description && (
                  <p className="mt-auto text-xs text-slate-500">{item.description}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-col items-center gap-3">
        <Button size="lg" onClick={onOpenMap} className="w-full max-w-xs gap-2">
          <Sparkles size={18} aria-hidden="true" />
          Открыть мою карту
        </Button>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-400 underline-offset-4 transition hover:text-slate-200 hover:underline"
        >
          <RotateCcw size={14} aria-hidden="true" />
          Пройти заново
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ страница */

export default function Diagnostics() {
  const navigate = useNavigate();
  const { refresh } = useAppState();
  const { user, patchUser } = useAuth();

  // Кто проходит тест, выбирается на онбординге и сохраняется в профиле,
  // поэтому формулировки остаются корректными и после перезагрузки страницы.
  const role = user?.role === 'child' ? 'child' : 'parent';

  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showChildIntro, setShowChildIntro] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  const headingRef = useRef(null);

  // Загрузка 12 вопросов; запрос отменяется при размонтировании/повторной попытке.
  // `loading`/`loadError` выставляются вне тела эффекта (стартовое состояние —
  // loading:true, повтор — в обработчике кнопки), чтобы не дёргать setState синхронно.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    api
      .get('/diagnostics/questions', { signal: controller.signal })
      .then((res) => {
        if (cancelled) return;
        setQuestions(Array.isArray(res.data?.questions) ? res.data.questions : []);
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setLoadError(errorMessage(err, 'Не удалось загрузить вопросы'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reloadKey]);

  const retryLoad = useCallback(() => {
    setLoadError('');
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Первый вопрос детского блока — граница для заставки и бейджа.
  const firstChildIndex = useMemo(
    () => questions.findIndex((q) => q.block === 'child'),
    [questions]
  );

  const current = questions[index];
  const isLast = questions.length > 0 && index === questions.length - 1;
  const answer = current ? answers[current.id] : undefined;
  const answered = typeof answer === 'string' && answer.trim().length > 0;

  // Фокус на заголовок при смене вопроса / заставки / появлении итога.
  useEffect(() => {
    if (loading || result) return undefined;
    const timer = setTimeout(() => headingRef.current?.focus(), 40);
    return () => clearTimeout(timer);
  }, [index, showChildIntro, loading, result]);

  const setAnswer = useCallback(
    (questionId, value) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    },
    []
  );

  const goNext = useCallback(() => {
    setSubmitError('');
    const nextIndex = index + 1;
    // Заставку показываем ровно перед первым детским вопросом.
    if (nextIndex === firstChildIndex && firstChildIndex > 0) {
      setShowChildIntro(true);
      return;
    }
    setIndex(Math.min(nextIndex, questions.length - 1));
  }, [index, firstChildIndex, questions.length]);

  // «Поехали» на заставке: снимаем её и переходим к первому детскому вопросу,
  // минуя проверку в goNext (иначе заставка показалась бы снова).
  const continueFromChildIntro = useCallback(() => {
    setShowChildIntro(false);
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  }, [questions.length]);

  const goBack = useCallback(() => {
    setSubmitError('');
    if (showChildIntro) {
      setShowChildIntro(false);
      return;
    }
    setIndex((i) => Math.max(0, i - 1));
  }, [showChildIntro]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await api.post('/diagnostics/submit', { answers });
      setResult(res.data);
      if (res.data?.user) patchUser(res.data.user);
      await refresh();
    } catch (err) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }, [answers, patchUser, refresh]);

  const restart = useCallback(() => {
    setResult(null);
    setAnswers({});
    setIndex(0);
    setShowChildIntro(false);
    setSubmitError('');
  }, []);

  /* ----------------------------------------------------------- рендер */

  if (loading) {
    return (
      <main className="space-gradient flex min-h-screen items-center justify-center px-5">
        <Spinner label="Загружаем вопросы…" />
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="space-gradient flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-md space-y-4 text-center">
          <Alert tone="error">{loadError}</Alert>
          <Button onClick={retryLoad}>Попробовать снова</Button>
        </div>
      </main>
    );
  }

  if (result) {
    return (
      <main className="space-gradient min-h-screen px-5 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-4xl">
          <ResultScreen result={result} onOpenMap={() => navigate('/app')} onRestart={restart} />
        </div>
      </main>
    );
  }

  if (!current) {
    return (
      <main className="space-gradient flex min-h-screen items-center justify-center px-5">
        <Alert tone="error">Вопросы недоступны. Попробуйте обновить страницу.</Alert>
      </main>
    );
  }

  const progressPct = Math.round(((index + 1) / TOTAL) * 100);
  const blockLabel = BLOCK_LABELS[role]?.[current.block] || '';

  return (
    <main className="space-gradient flex min-h-screen flex-col items-center px-5 py-10 sm:py-14">
      <div className="w-full max-w-2xl">
        <header className="mb-6">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-300">
              Вопрос {index + 1} из {TOTAL}
            </span>
            <span
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                current.block === 'child'
                  ? 'bg-nebula-400/15 text-nebula-400'
                  : 'bg-gold-400/15 text-gold-300'
              )}
            >
              {current.block === 'child' && <Baby size={13} aria-hidden="true" />}
              {blockLabel}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label="Прогресс диагностики"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </header>

        <section className="glass-strong rounded-3xl p-6 sm:p-9">
          {showChildIntro ? (
            <ChildInterstitial onContinue={continueFromChildIntro} headingRef={headingRef} role={role} />
          ) : (
            <>
              {current.type === 'city' ? (
                <>
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="sr-only"
                  >
                    {questionText(current, role)}
                  </h1>
                  <CityAutocomplete
                    role={role}
                    question={current}
                    value={typeof answer === 'string' ? answer : ''}
                    onChange={(val) => setAnswer(current.id, val)}
                  />
                </>
              ) : (
                <>
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-2xl font-bold text-white outline-none sm:text-3xl"
                  >
                    {questionText(current, role)}
                  </h1>
                  {current.hint && <p className="mt-2 text-sm text-slate-400">{current.hint}</p>}
                  <div className="mt-6">
                    <ChoiceGrid
                      role={role}
                      question={current}
                      value={typeof answer === 'string' ? answer : ''}
                      onChange={(val) => setAnswer(current.id, val)}
                    />
                  </div>
                </>
              )}

              {submitError && (
                <div className="mt-6">
                  <Alert tone="error">{submitError}</Alert>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  onClick={goBack}
                  disabled={index === 0}
                  className="gap-1.5"
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Назад
                </Button>

                {isLast ? (
                  <Button
                    onClick={submit}
                    disabled={!answered || submitting}
                    loading={submitting}
                    className="gap-2"
                  >
                    <Sparkles size={16} aria-hidden="true" />
                    Построить карту
                  </Button>
                ) : (
                  <Button onClick={goNext} disabled={!answered} className="gap-1.5">
                    Далее
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
