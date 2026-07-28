import { useMemo, useRef, useState } from 'react';
import { MapPin, Cake, Star, Crown, History, Sparkles, TrendingUp, ChevronDown } from 'lucide-react';

import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../lib/api';
import { constellationProgress, progressIn } from '../lib/graph';
import { directions, skills, plural } from '../lib/plural';
import Avatar, { UserName } from '../components/Avatar';
import { Button, Alert, Badge, ProgressRing, Spinner, cx } from '../components/ui';

const ROLE_LABELS = { child: 'Ученик', parent: 'Родитель' };
const HISTORY_STEP = 6;

/**
 * Личный кабинет: карточка профиля, круговой прогресс по звёздам, XP,
 * разбивка по созвездиям, лента истории и рабочий блок подписки.
 */
export default function Profile() {
  const { state, loading, error, refresh } = useAppState();
  const { patchUser } = useAuth();

  const [historyLimit, setHistoryLimit] = useState(HISTORY_STEP);
  const [showRest, setShowRest] = useState(false);
  const [subError, setSubError] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  const busyRef = useRef(false);

  const progress = useMemo(
    () => constellationProgress(state?.constellations, state?.stars, state?.completedStars),
    [state?.constellations, state?.stars, state?.completedStars]
  );

  if (!state) {
    return loading ? <Spinner label="Загружаем профиль…" /> : <Alert tone="error">{error}</Alert>;
  }

  const user = state.user || {};

  /**
   * Прогресс считаем по программе ребёнка — направлениям, которые подобрала
   * диагностика. Раньше знаменателем был весь каталог, поэтому в шапке карты
   * висело 20%, а здесь 3%: два разных числа про один и тот же момент.
   */
  const programmeIds = user.recommendedGraphs?.length
    ? user.recommendedGraphs
    : (state.constellations || []).map((c) => c.id);
  const { done: completed, total: totalStars, percent } = progressIn(
    state.stars,
    state.completedStars,
    programmeIds
  );
  const catalogueTotal = state.totals?.stars ?? (state.stars?.length || 0);

  const isPro = user.subscription === 'pro';

  const logs = state.historyLogs || [];
  const visibleLogs = logs.slice(0, historyLimit);

  // Своя программа идёт первой и всегда видна; остальной каталог — под катом,
  // иначе список из четырнадцати нулевых полосок выглядит как провал.
  const programmeSet = new Set(programmeIds.map(Number));
  const withStars = progress.filter((c) => c.total > 0);
  const mine = withStars
    .filter((c) => programmeSet.has(Number(c.id)))
    .sort((a, b) => b.percent - a.percent || b.done - a.done);
  const rest = withStars
    .filter((c) => !programmeSet.has(Number(c.id)))
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name, 'ru'));

  async function handleSubscription(kind) {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubBusy(true);
    setSubError('');
    try {
      const path = kind === 'upgrade' ? '/users/subscription/upgrade' : '/users/subscription/cancel';
      const res = await api.post(path);
      if (res.data?.user) patchUser(res.data.user);
      await refresh();
    } catch (err) {
      setSubError(errorMessage(err, 'Не удалось изменить подписку. Попробуйте ещё раз.'));
    } finally {
      busyRef.current = false;
      setSubBusy(false);
    }
  }

  return (
    <section aria-labelledby="profile-heading" className="space-y-6">
      <h1 id="profile-heading" className="sr-only">
        Личный кабинет
      </h1>

      {/* Шапка профиля */}
      <div className="glass-strong flex flex-col items-center gap-5 rounded-3xl p-6 text-center sm:flex-row sm:items-center sm:text-left">
        <Avatar user={user} size="xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <UserName user={user} className="block text-2xl font-extrabold text-white" />
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-slate-400 sm:justify-start">
            {user.age != null && (
              <span className="inline-flex items-center gap-1.5">
                <Cake size={15} aria-hidden="true" />
                {plural(user.age, `${user.age} год`, `${user.age} года`, `${user.age} лет`)}
              </span>
            )}
            {user.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={15} aria-hidden="true" />
                {user.city}
              </span>
            )}
            <Badge tone="neutral">{ROLE_LABELS[user.role] || user.role}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            {isPro ? (
              <Badge tone="gold">
                <Crown size={13} aria-hidden="true" />
                PRO-подписка
              </Badge>
            ) : (
              <Badge tone="neutral">Пробный доступ</Badge>
            )}
            <Badge tone="violet">
              <Star size={13} aria-hidden="true" />
              {user.xp ?? 0} XP
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Круговой прогресс + XP */}
        <div className="glass flex flex-col items-center gap-4 rounded-3xl p-6">
          <h2 className="self-start text-lg font-bold text-white">Прогресс по программе</h2>
          <ProgressRing value={percent} sublabel="по твоим направлениям" />
          <p className="text-center text-sm text-slate-400">
            Пройдено <span className="font-semibold text-gold-300">{completed}</span> из{' '}
            <span className="font-semibold text-slate-200">{skills(totalStars)}</span>
            {catalogueTotal > totalStars && (
              <>
                <br />
                <span className="text-xs text-slate-500">
                  Всего в каталоге {skills(catalogueTotal)} — открой новые направления в разделе «Карта».
                </span>
              </>
            )}
          </p>
          <div className="grid w-full grid-cols-2 gap-3 pt-2">
            <div className="rounded-2xl bg-space-800/60 p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 text-gold-300">
                <Star size={18} aria-hidden="true" />
                <span className="font-display text-2xl font-extrabold">{user.xp ?? 0}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{plural(user.xp ?? 0, 'очко опыта', 'очка опыта', 'очков опыта')}</p>
            </div>
            <div className="rounded-2xl bg-space-800/60 p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 text-emerald-300">
                <TrendingUp size={18} aria-hidden="true" />
                <span className="font-display text-2xl font-extrabold">{completed}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{plural(completed, 'навык освоен', 'навыка освоено', 'навыков освоено')}</p>
            </div>
          </div>
        </div>

        {/* Разбивка по созвездиям */}
        <div className="glass rounded-3xl p-6">
          <h2 className="mb-4 text-lg font-bold text-white">Прогресс по направлениям</h2>
          {mine.length === 0 && rest.length === 0 ? (
            <p className="text-sm text-slate-400">Пока нет данных по направлениям.</p>
          ) : (
            <>
              {mine.length > 0 && (
                <ul className="space-y-4">
                  {mine.map((c) => (
                    <DirectionBar key={c.id} c={c} />
                  ))}
                </ul>
              )}

              {rest.length > 0 && (
                <div className={mine.length ? 'mt-5 border-t border-white/10 pt-5' : ''}>
                  <button
                    type="button"
                    onClick={() => setShowRest((v) => !v)}
                    aria-expanded={showRest}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left text-sm text-slate-400 transition hover:text-slate-200"
                  >
                    <span>Ещё {directions(rest.length)} в каталоге</span>
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={cx('shrink-0 transition-transform', showRest && 'rotate-180')}
                    />
                  </button>
                  {showRest && (
                    <ul className="mt-4 space-y-4">
                      {rest.map((c) => (
                        <DirectionBar key={c.id} c={c} muted />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Подписка */}
      <div className="glass rounded-3xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={cx('rounded-2xl p-3', isPro ? 'bg-gold-400/15 text-gold-300' : 'bg-white/10 text-slate-300')}>
              <Crown size={22} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{isPro ? 'Подписка PRO' : 'Пробный доступ'}</h2>
              <p className="mt-0.5 max-w-md text-sm text-slate-400">
                {isPro
                  ? 'Открыты все созвездия и полный доступ к материалам. Спасибо, что поддерживаешь развитие!'
                  : 'Оформи PRO, чтобы открыть все созвездия и расширенные материалы для развития.'}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            {isPro ? (
              <Button type="button" variant="secondary" onClick={() => handleSubscription('cancel')} loading={subBusy}>
                Отменить подписку
              </Button>
            ) : (
              <Button type="button" onClick={() => handleSubscription('upgrade')} loading={subBusy}>
                <Crown size={18} aria-hidden="true" />
                Оформить PRO
              </Button>
            )}
          </div>
        </div>
        {subError && (
          <div className="mt-4">
            <Alert tone="error">{subError}</Alert>
          </div>
        )}
      </div>

      {/* История действий */}
      <div className="glass rounded-3xl p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
          <History size={20} className="text-gold-400" aria-hidden="true" />
          История действий
        </h2>
        {logs.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-400">
            <Sparkles size={16} aria-hidden="true" />
            Здесь появятся твои достижения и загрузки.
          </p>
        ) : (
          <>
            <ol className="relative space-y-5 border-l border-white/10 pl-6">
              {visibleLogs.map((log) => (
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
            {logs.length > historyLimit && (
              <div className="mt-5 flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setHistoryLimit((n) => n + HISTORY_STEP)}
                >
                  Показать ещё
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- DirectionBar */

function DirectionBar({ c, muted = false }) {
  return (
    <li>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className={cx('flex min-w-0 items-center gap-2', muted ? 'text-slate-400' : 'text-slate-200')}>
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
          className={cx(
            'h-full rounded-full transition-all duration-700',
            muted ? 'bg-slate-500/70' : 'bg-gradient-to-r from-gold-400 to-gold-500'
          )}
          style={{ width: `${c.percent}%` }}
        />
      </div>
    </li>
  );
}
