import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Star,
  Images,
  Crown,
  History,
  RefreshCw,
  Info,
  Activity,
  CalendarClock,
  Target,
  MapPin,
  ExternalLink,
} from 'lucide-react';

import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../lib/api';
import { progressIn } from '../lib/graph';
import { skills, points, directions, plural } from '../lib/plural';
import { Button, Field, Input, Alert, Spinner, Badge, ProgressRing, cx } from '../components/ui';

/**
 * Раздел для родителей: аналитика по ребёнку под защитой PIN-кода.
 * Флаг разблокировки живёт только в состоянии компонента — сбрасывается при
 * перезагрузке, и это намеренно.
 */
export default function ParentDashboard() {
  const { state, loading, error } = useAppState();
  const [unlocked, setUnlocked] = useState(false);

  if (!state) {
    return loading ? <Spinner label="Загружаем раздел…" /> : <Alert tone="error">{error}</Alert>;
  }

  const hasPin = Boolean(state.user?.hasPin);
  const gated = hasPin && !unlocked;

  return (
    <section aria-labelledby="parent-heading" className="space-y-6">
      <header>
        <h1 id="parent-heading" className="flex items-center gap-2.5 text-2xl font-extrabold text-white sm:text-3xl">
          <ShieldCheck className="text-gold-400" aria-hidden="true" />
          Кабинет родителя
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">Прогресс и активность ребёнка в одном месте.</p>
      </header>

      {gated ? (
        <PinGate onUnlock={() => setUnlocked(true)} />
      ) : (
        <DashboardContent hasPin={hasPin} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ PinGate */

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const busyRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busyRef.current) return;
    setErrMsg('');
    if (!/^\d{4}$/.test(pin)) {
      setErrMsg('Введите 4 цифры PIN-кода.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await api.post('/users/pin/verify', { pin });
      if (mounted.current) onUnlock();
    } catch (err) {
      if (mounted.current) {
        setErrMsg(errorMessage(err, 'Неверный PIN-код.'));
        setPin('');
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="glass-strong rounded-3xl p-6 sm:p-8">
        <div className="mb-5 flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-gold-400/15 p-3 text-gold-300">
            <Lock size={24} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Введите родительский PIN</h2>
            <p className="mt-1 text-sm text-slate-400">Раздел с аналитикой защищён от ребёнка.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {errMsg && <Alert tone="error">{errMsg}</Alert>}
          <Field label="PIN-код" htmlFor="parent-pin" hint="4 цифры" required>
            <Input
              id="parent-pin"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              pattern="\d{4}"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              disabled={busy}
              className="mx-auto max-w-[12rem] text-center text-2xl tracking-[0.6em]"
              data-autofocus
              required
            />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>
            <ShieldCheck size={18} aria-hidden="true" />
            Разблокировать
          </Button>
        </form>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- DashboardContent */

function DashboardContent({ hasPin }) {
  const { state, refresh } = useAppState();
  const { patchUser } = useAuth();

  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState('');

  const mounted = useRef(true);
  const subBusyRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Загрузка сводки. При вызове из эффекта используется silent (спиннер уже
  // показан начальным состоянием); из обработчиков — обычный режим со спиннером.
  const loadSummary = useCallback(async (signal, { silent } = {}) => {
    try {
      if (!silent) {
        setLoadingSummary(true);
        setLoadError('');
      }
      const res = await api.get('/app-state/summary', signal ? { signal } : undefined);
      if (mounted.current) {
        setSummary(res.data);
        setLoadError('');
      }
    } catch (err) {
      if (mounted.current && err?.code !== 'ERR_CANCELED') {
        setLoadError(errorMessage(err, 'Не удалось загрузить сводку.'));
      }
    } finally {
      if (mounted.current) setLoadingSummary(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Вызов в микротаске: в синхронном теле эффекта состояние не меняется.
    Promise.resolve().then(() => loadSummary(controller.signal, { silent: true }));
    return () => controller.abort();
  }, [loadSummary]);

  const user = state?.user || {};

  /**
   * Программа ребёнка — направления, подобранные диагностикой. Прогресс во всём
   * приложении считается по ней, поэтому в шапке карты, в профиле и здесь
   * стоит одно и то же число.
   */
  const programmeIds = useMemo(
    () => (user.recommendedGraphs?.length ? user.recommendedGraphs : (state?.constellations || []).map((c) => c.id)),
    [user.recommendedGraphs, state?.constellations]
  );

  const programme = useMemo(
    () => (state?.constellations || []).filter((c) => programmeIds.map(Number).includes(Number(c.id))),
    [state?.constellations, programmeIds]
  );

  /** Что ребёнок проходит прямо сейчас — и куда с этим можно сходить в его городе. */
  const nowLearning = useMemo(() => {
    const star = (state?.stars || []).find((s) => s.id === state?.currentStarId);
    if (!star) return null;
    const constellation = (state?.constellations || []).find((c) => c.id === star.constellationId);
    const city = user.city;
    const forStar = (state?.resources || []).filter((r) => r.starId === star.id);
    const allOffline = forStar.filter((r) => r.type === 'offline');
    const here = (r) => !city || !r.city || r.city === 'Все города' || r.city === city;

    // Очное занятие в другом городе всё равно показываем — просто честно
    // подписываем город. Прятать его совсем значило скрывать от родителя
    // единственную офлайн-возможность по текущему шагу.
    const offline = allOffline.filter(here);
    const elsewhere = allOffline.filter((r) => !here(r));
    const online = forStar.filter((r) => r.type !== 'offline');
    return { star, constellation, offline, elsewhere, online };
  }, [state?.stars, state?.currentStarId, state?.constellations, state?.resources, user.city]);

  async function handleUpgrade() {
    if (subBusyRef.current) return;
    subBusyRef.current = true;
    setSubBusy(true);
    setSubError('');
    try {
      const res = await api.post('/users/subscription/upgrade');
      if (res.data?.user) patchUser(res.data.user);
      await refresh();
    } catch (err) {
      if (mounted.current) setSubError(errorMessage(err, 'Не удалось оформить подписку.'));
    } finally {
      subBusyRef.current = false;
      if (mounted.current) setSubBusy(false);
    }
  }

  const isPro = user.subscription === 'pro';
  const logs = (state?.historyLogs || []).slice(0, 6);

  // Сводка приходит с сервера, но пока она летит — считаем локально по тем же
  // правилам, чтобы блок не мигал нулями.
  const local = progressIn(state?.stars, state?.completedStars, programmeIds);
  const percent = summary?.percent ?? local.percent;
  const completed = summary?.completed ?? local.done;
  const total = summary?.total ?? local.total;
  const workCount = summary?.works ?? (state?.portfolio?.length || 0);
  // Заработано за всё время, а не остаток на счету: потратив опыт в магазине,
  // ребёнок обнулял баланс и в отчёте выглядел бездельником.
  const xpEarned = summary?.xpEarned ?? completed * 50;


  // Темп приходит с сервера: обращаться к часам во время рендера нельзя.
  const perMonth = summary?.pace?.month ?? 0;
  const perWeek = summary?.pace?.week ?? 0;
  const daysSince = summary?.daysSinceActivity ?? null;
  const sinceLabel =
    daysSince == null
      ? 'нет данных'
      : daysSince === 0
        ? 'сегодня'
        : daysSince === 1
          ? 'вчера'
          : `${plural(daysSince, `${daysSince} день`, `${daysSince} дня`, `${daysSince} дней`)} назад`;
  const paceTone = perWeek > 0 ? 'good' : perMonth > 0 ? 'warn' : 'idle';

  return (
    <div className="space-y-6">
      {!hasPin && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2">
            <Info size={16} aria-hidden="true" />
            PIN-код не установлен. Задайте его в разделе «Настройки», чтобы закрыть аналитику от ребёнка.
          </span>
        </Alert>
      )}

      {loadingSummary && !summary ? (
        <Spinner label="Загружаем сводку…" />
      ) : loadError && !summary ? (
        <div className="space-y-4">
          <Alert tone="error">{loadError}</Alert>
          <Button type="button" variant="secondary" onClick={() => loadSummary()}>
            <RefreshCw size={16} aria-hidden="true" />
            Повторить
          </Button>
        </div>
      ) : (
        <>
          {/* Чей отчёт: родитель смотрит на ребёнка, а не на «свой» профиль */}
          <div className="glass-strong rounded-3xl p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-slate-500">Отчёт по ребёнку</p>
                <h2 className="mt-1 truncate font-display text-2xl font-extrabold text-white">{user.name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-400">
                  {user.age != null && (
                    <span>{plural(user.age, `${user.age} год`, `${user.age} года`, `${user.age} лет`)}</span>
                  )}
                  {user.city && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={14} aria-hidden="true" />
                      {user.city}
                    </span>
                  )}
                  {user.weeklyHours && <span>план: {user.weeklyHours} в неделю</span>}
                </div>
              </div>
              <div className="shrink-0">
                {isPro ? <Badge tone="gold">PRO</Badge> : <Badge tone="neutral">Пробный доступ</Badge>}
              </div>
            </div>

            {programme.length > 0 && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="mb-2 text-xs text-slate-500">
                  Программа — {directions(programme.length)} по итогам диагностики
                </p>
                <div className="flex flex-wrap gap-2">
                  {programme.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 text-sm text-slate-200"
                    >
                      {c.icon && <span aria-hidden="true">{c.icon}</span>}
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Занимается ли ребёнок сейчас — главный вопрос родителя */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="glass flex flex-col items-center gap-4 rounded-3xl p-6">
              <h2 className="self-start text-lg font-bold text-white">Прогресс по программе</h2>
              <ProgressRing value={percent} sublabel="по открытым направлениям" />
              <p className="text-center text-sm text-slate-400">
                Освоено <span className="font-semibold text-gold-300">{completed}</span> из{' '}
                <span className="font-semibold text-slate-200">{skills(total)}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:content-start">
              <StatTile
                icon={<Activity size={20} aria-hidden="true" />}
                value={perMonth}
                label={`${plural(perMonth, 'навык', 'навыка', 'навыков')} за 30 дней`}
                tone={paceTone === 'good' ? 'good' : paceTone === 'warn' ? 'warn' : 'default'}
              />
              <StatTile
                icon={<CalendarClock size={20} aria-hidden="true" />}
                value={sinceLabel}
                label="последнее занятие"
                small
                tone={daysSince != null && daysSince > 14 ? 'warn' : 'default'}
              />
              <StatTile icon={<Images size={20} aria-hidden="true" />} value={workCount} label={`${plural(workCount, 'работа', 'работы', 'работ')} в портфолио`} />
              <StatTile
                icon={<Star size={20} aria-hidden="true" />}
                value={`${xpEarned} XP`}
                label="заработано за всё время"
                tone="gold"
              />
            </div>
          </div>

          {/* Чем ребёнок занят прямо сейчас и куда с этим пойти */}
          {nowLearning && (
            <div className="glass rounded-3xl p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
                <Target size={20} className="text-gold-400" aria-hidden="true" />
                Сейчас в работе
              </h2>
              <div className="rounded-2xl bg-space-800/60 p-4">
                {nowLearning.constellation && (
                  <p className="text-xs text-slate-500">
                    {nowLearning.constellation.icon} {nowLearning.constellation.name}
                  </p>
                )}
                <p className="mt-1 font-semibold text-white">{nowLearning.star.name}</p>
                {nowLearning.star.description && (
                  <p className="mt-1.5 text-sm text-slate-400">{nowLearning.star.description}</p>
                )}
              </div>

              {nowLearning.offline.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2.5 text-sm font-medium text-slate-300">
                    Куда сходить{user.city ? ` в городе ${user.city}` : ''}
                  </p>
                  <ul className="space-y-2.5">
                    {nowLearning.offline.map((r) => (
                      <ResourceRow key={r.id} r={r} />
                    ))}
                  </ul>
                </div>
              )}

              {nowLearning.offline.length === 0 && nowLearning.elsewhere.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2.5 text-sm font-medium text-slate-300">
                    Очных занятий{user.city ? ` в городе ${user.city}` : ''} по этому шагу нет. Ближайшее — в другом
                    городе:
                  </p>
                  <ul className="space-y-2.5">
                    {nowLearning.elsewhere.map((r) => (
                      <ResourceRow key={r.id} r={r} city={r.city} />
                    ))}
                  </ul>
                </div>
              )}

              {nowLearning.offline.length === 0 && nowLearning.elsewhere.length === 0 && nowLearning.online.length > 0 && (
                <p className="mt-4 text-sm text-slate-400">
                  Очных занятий по этому шагу пока нет — ребёнок проходит его онлайн, материалы открыты на карте.
                </p>
              )}
            </div>
          )}

          {/* Подписка — платит родитель, поэтому блок остаётся здесь */}
          <div className="glass rounded-3xl p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className={cx('rounded-2xl p-3', isPro ? 'bg-gold-400/15 text-gold-300' : 'bg-white/10 text-slate-300')}>
                  <Crown size={22} aria-hidden="true" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">Подписка</h2>
                    {isPro ? <Badge tone="gold">PRO</Badge> : <Badge tone="neutral">Пробная</Badge>}
                  </div>
                  <p className="mt-0.5 max-w-md text-sm text-slate-400">
                    {isPro
                      ? 'Активна PRO-подписка — открыты все созвездия и материалы.'
                      : `На пробном плане открыто ${directions(programme.length)} и первые шаги в них. PRO открывает весь каталог и награды дороже ${points(150)}.`}
                  </p>
                </div>
              </div>
              {!isPro && (
                <div className="shrink-0">
                  <Button type="button" onClick={handleUpgrade} loading={subBusy}>
                    <Crown size={18} aria-hidden="true" />
                    Оформить PRO
                  </Button>
                </div>
              )}
            </div>
            {subError && (
              <div className="mt-4">
                <Alert tone="error">{subError}</Alert>
              </div>
            )}
          </div>

          {/* Недавняя активность */}
          <div className="glass rounded-3xl p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
              <History size={20} className="text-gold-400" aria-hidden="true" />
              Недавняя активность
            </h2>
            {logs.length === 0 ? (
              <p className="text-sm text-slate-400">Пока нет активности.</p>
            ) : (
              <ol className="relative space-y-5 border-l border-white/10 pl-6">
                {logs.map((log) => (
                  <li key={log.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-space-900 bg-gold-400"
                    />
                    <p className="text-sm text-slate-100">{log.text}</p>
                    {log.date && <p className="mt-0.5 text-xs text-slate-500">{log.date}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- StatTile */

/* --------------------------------------------------------------- Resource */

function ResourceRow({ r, city }) {
  return (
    <li className="rounded-2xl border border-white/10 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-slate-100">{r.title}</p>
        {city && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-xs text-slate-300">
            <MapPin size={11} aria-hidden="true" />
            {city}
          </span>
        )}
      </div>
      {(r.detail1 || r.detail2) && (
        <p className="mt-0.5 text-xs text-slate-400">{[r.detail1, r.detail2].filter(Boolean).join(' · ')}</p>
      )}
      {r.link && (
        <a
          href={r.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gold-300 hover:text-gold-200"
        >
          Подробнее
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

const TILE_TONES = {
  default: 'bg-white/10 text-slate-200',
  gold: 'bg-gold-400/15 text-gold-300',
  good: 'bg-emerald-400/15 text-emerald-300',
  warn: 'bg-amber-400/15 text-amber-300',
};

function StatTile({ icon, value, label, tone = 'default', small = false }) {
  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-5">
      <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', TILE_TONES[tone] || TILE_TONES.default)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div
          className={cx(
            'font-display font-extrabold text-white tabular-nums',
            small ? 'text-lg' : 'text-2xl'
          )}
        >
          {value}
        </div>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}
