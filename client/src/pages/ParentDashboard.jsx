import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Star,
  Trophy,
  Images,
  Crown,
  History,
  RefreshCw,
  Info,
} from 'lucide-react';

import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../lib/api';
import { constellationProgress } from '../lib/graph';
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

  const progress = useMemo(
    () => constellationProgress(state?.constellations, state?.stars, state?.completedStars),
    [state?.constellations, state?.stars, state?.completedStars]
  );

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

  const user = state?.user || {};
  const isPro = user.subscription === 'pro';
  const logs = (state?.historyLogs || []).slice(0, 6);
  const withStars = progress.filter((c) => c.total > 0).sort((a, b) => b.percent - a.percent);

  const percent = summary?.percent ?? 0;
  const completed = summary?.completed ?? 0;
  const total = summary?.total ?? 0;
  const works = summary?.works ?? 0;
  const xp = summary?.xp ?? user.xp ?? 0;

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
          {/* Основные показатели */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="glass flex flex-col items-center gap-4 rounded-3xl p-6">
              <h2 className="self-start text-lg font-bold text-white">Общий прогресс</h2>
              <ProgressRing value={percent} sublabel="навыков" />
              <p className="text-sm text-slate-400">
                Освоено <span className="font-semibold text-gold-300">{completed}</span> из{' '}
                <span className="font-semibold text-slate-200">{total}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-1 lg:content-start">
              <StatTile icon={<Trophy size={20} aria-hidden="true" />} value={completed} label="навыков пройдено" />
              <StatTile icon={<Images size={20} aria-hidden="true" />} value={works} label="работ в портфолио" />
              <StatTile icon={<Star size={20} aria-hidden="true" />} value={`${xp} XP`} label="накоплено опыта" tone="gold" />
            </div>
          </div>

          {/* Разбивка по направлениям */}
          <div className="glass rounded-3xl p-6">
            <h2 className="mb-4 text-lg font-bold text-white">Прогресс по направлениям</h2>
            {withStars.length === 0 ? (
              <p className="text-sm text-slate-400">Пока нет данных по направлениям.</p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {withStars.map((c) => (
                  <li key={c.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-slate-200">
                        {c.icon && (
                          <span aria-hidden="true" className="text-base">
                            {c.icon}
                          </span>
                        )}
                        <span className="truncate font-medium">{c.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-400">
                        {c.done}/{c.total}
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-white/8"
                      role="progressbar"
                      aria-valuenow={c.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${c.name}: ${c.percent}%`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-700"
                        style={{ width: `${c.percent}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Подписка */}
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
                      : 'Оформите PRO, чтобы открыть все созвездия и расширенные материалы.'}
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

function StatTile({ icon, value, label, tone = 'default' }) {
  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-5">
      <div
        className={cx(
          'grid h-12 w-12 shrink-0 place-items-center rounded-2xl',
          tone === 'gold' ? 'bg-gold-400/15 text-gold-300' : 'bg-white/10 text-slate-200'
        )}
      >
        {icon}
      </div>
      <div>
        <div className="font-display text-2xl font-extrabold text-white tabular-nums">{value}</div>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}
