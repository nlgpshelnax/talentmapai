import { useCallback, useEffect, useRef, useState } from 'react';
import { ShoppingBag, Star, Check, Sparkles, RefreshCw } from 'lucide-react';

import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../lib/api';
import Avatar, { UserName } from '../components/Avatar';
import { Button, Alert, Badge, Spinner, EmptyState, cx } from '../components/ui';

const GROUPS = [
  { type: 'avatar', title: 'Аватары' },
  { type: 'frame', title: 'Рамки' },
  { type: 'title', title: 'Звания' },
];

const XP_PER_STAR = 50;

/**
 * Магазин: покупка и примерка косметики за XP. Живое превью аватара показывает
 * ребёнку эффект сразу — в прототипе покупка не меняла в интерфейсе ничего.
 */
export default function Store() {
  const { refresh } = useAppState();
  const { user, patchUser } = useAuth();

  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null); // id товара, по которому идёт операция

  const mounted = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Загрузка каталога. При вызове из эффекта используется silent (спиннер уже
  // показан начальным состоянием); из обработчиков — обычный режим со спиннером.
  const load = useCallback(async (signal, { silent } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setLoadError('');
      }
      const res = await api.get('/store', signal ? { signal } : undefined);
      if (mounted.current) {
        setStore(res.data);
        setLoadError('');
      }
    } catch (err) {
      if (mounted.current && err?.code !== 'ERR_CANCELED') {
        setLoadError(errorMessage(err, 'Не удалось загрузить магазин.'));
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Вызов в микротаске: в синхронном теле эффекта состояние не меняется.
    Promise.resolve().then(() => load(controller.signal, { silent: true }));
    return () => controller.abort();
  }, [load]);

  const runAction = useCallback(
    async (id, request) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusyId(id);
      setActionError('');
      try {
        const res = await request();
        if (res.data?.user) patchUser(res.data.user);
        await refresh(); // синхронизируем XP/экипировку во всём приложении
        await load(); // обновляем сам магазин (owned/affordable)
      } catch (err) {
        if (mounted.current) setActionError(errorMessage(err, 'Действие не удалось. Попробуйте ещё раз.'));
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusyId(null);
      }
    },
    [patchUser, refresh, load]
  );

  const buy = (item) => runAction(item.id, () => api.post('/store/buy', { itemId: item.id }));

  const equip = (item, equipped) =>
    runAction(item.id, () =>
      api.post('/store/equip', { itemId: equipped ? null : item.id, type: item.type })
    );

  if (loading && !store) {
    return <Spinner label="Загружаем магазин…" />;
  }

  if (loadError && !store) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{loadError}</Alert>
        <Button type="button" variant="secondary" onClick={() => load()}>
          <RefreshCw size={16} aria-hidden="true" />
          Повторить
        </Button>
      </div>
    );
  }

  const xp = store?.xp ?? user?.xp ?? 0;
  const equipped = store?.equipped || {};
  const items = store?.items || [];

  // Превью строим из текущего пользователя, но подменяем экипировку данными магазина,
  // чтобы отражать самое свежее состояние сразу после покупки/примерки.
  const previewUser = { ...(user || {}), equipped };

  return (
    <section aria-labelledby="store-heading" className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 id="store-heading" className="flex items-center gap-2.5 text-2xl font-extrabold text-white sm:text-3xl">
            <ShoppingBag className="text-gold-400" aria-hidden="true" />
            Магазин
          </h1>
          <p className="mt-1.5 max-w-lg text-sm text-slate-400">
            Трать опыт на аватары, рамки и звания. Каждый пройденный навык приносит{' '}
            <span className="font-semibold text-gold-300">{XP_PER_STAR} XP</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-2xl bg-space-800/70 px-4 py-2.5">
          <Star size={20} className="text-gold-300" aria-hidden="true" />
          <span className="font-display text-2xl font-extrabold text-white tabular-nums">{xp}</span>
          <span className="text-sm text-slate-400">XP</span>
        </div>
      </header>

      {/* Живое превью */}
      <div className="glass-strong flex flex-col items-center gap-4 rounded-3xl p-6 sm:flex-row sm:items-center">
        <Avatar user={previewUser} size="lg" />
        <div className="text-center sm:text-left">
          <p className="text-xs uppercase tracking-wide text-slate-500">Твой образ</p>
          <UserName user={previewUser} className="mt-0.5 block text-xl font-bold text-white" />
          <p className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400 sm:justify-start">
            <span>Аватар: {equipped.avatar || '—'}</span>
            <span aria-hidden="true">·</span>
            <span>Рамка: {equipped.frame ? frameLabel(equipped.frame) : '—'}</span>
            <span aria-hidden="true">·</span>
            <span>Звание: {equipped.title || '—'}</span>
          </p>
        </div>
      </div>

      {actionError && <Alert tone="error">{actionError}</Alert>}

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag aria-hidden="true" />}
          title="Магазин пуст"
          description="Товары скоро появятся. Продолжай проходить навыки и копить опыт."
        />
      ) : (
        GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.type === group.type);
          if (groupItems.length === 0) return null;
          return (
            <div key={group.type} className="space-y-3">
              <h2 className="text-lg font-bold text-white">{group.title}</h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groupItems.map((item) => (
                  <StoreCard
                    key={item.id}
                    item={item}
                    xp={xp}
                    equipped={isEquipped(item, equipped)}
                    busy={busyId === item.id}
                    anyBusy={busyId !== null}
                    onBuy={() => buy(item)}
                    onEquip={(eq) => equip(item, eq)}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}
    </section>
  );
}

/* --------------------------------------------------------------- StoreCard */

function StoreCard({ item, xp, equipped, busy, anyBusy, onBuy, onEquip }) {
  const missing = Math.max(0, item.price - xp);

  return (
    <li
      className={cx(
        'glass flex flex-col rounded-2xl p-5 transition',
        equipped ? 'border-gold-400/50 shadow-glow-soft' : 'hover:border-white/20'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-space-800 text-3xl" aria-hidden="true">
          {item.icon}
        </div>
        <div className="flex flex-col items-end gap-1">
          {item.owned && (
            <Badge tone="green">
              <Check size={12} aria-hidden="true" />
              Куплено
            </Badge>
          )}
          {equipped && (
            <Badge tone="gold">
              <Sparkles size={12} aria-hidden="true" />
              Надето
            </Badge>
          )}
        </div>
      </div>

      <h3 className="mt-3 font-semibold text-white">{item.title}</h3>
      <p className="mt-1 flex-1 text-sm text-slate-400">{item.description}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-300">
          <Star size={16} aria-hidden="true" />
          {item.price} XP
        </span>

        {item.owned ? (
          <Button
            type="button"
            size="sm"
            variant={equipped ? 'secondary' : 'primary'}
            onClick={() => onEquip(equipped)}
            loading={busy}
            disabled={anyBusy && !busy}
          >
            {equipped ? 'Снять' : 'Надеть'}
          </Button>
        ) : item.affordable ? (
          <Button type="button" size="sm" onClick={onBuy} loading={busy} disabled={anyBusy && !busy}>
            Купить
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled
            title={`Не хватает ${missing} XP`}
            aria-label={`Купить «${item.title}» — не хватает ${missing} XP`}
          >
            Ещё {missing} XP
          </Button>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ helpers */

const FRAME_LABELS = { gold: 'золотая', comet: 'кометная' };
function frameLabel(frame) {
  return FRAME_LABELS[frame] || frame;
}

/** Предмет надет, если экипированное значение совпадает с его payload. */
function isEquipped(item, equipped) {
  return Boolean(item.payload) && equipped?.[item.type] === item.payload;
}
