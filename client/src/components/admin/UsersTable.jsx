import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Users } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { Alert, Badge, EmptyState, Input, Spinner, cx } from '../ui';

/**
 * Registered-users list required by the TZ — the prototype shipped a
 * «в разработке» placeholder here. Read-only: no row is editable, and the API
 * never returns password hashes.
 *
 * Props: none. Owns its own fetch because the data is unrelated to the graph.
 */

const SUBSCRIPTION = {
  pro: { tone: 'gold', label: 'PRO' },
  trial: { tone: 'neutral', label: 'Пробная' },
  free: { tone: 'neutral', label: 'Бесплатная' },
};

const ROLE_LABEL = {
  child: 'Ребёнок',
  parent: 'Родитель',
  teacher: 'Педагог',
  admin: 'Администратор',
};

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

export default function UsersTable() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const searchId = 'admin-users-search';

  // Debounce the search box so we hit ?q= at most a few times per second.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/admin/users', { params: debounced ? { q: debounced } : {} });
        if (!cancelled) setUsers(Array.isArray(res.data.users) ? res.data.users : []);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, 'Не удалось загрузить пользователей.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // Client-side sort so the header controls feel responsive without refetching.
  const [sort, setSort] = useState({ key: 'id', dir: 'desc' });
  const sortedUsers = useMemo(() => {
    const rows = [...users];
    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av ?? '').localeCompare(String(bv ?? ''), 'ru') * factor;
    });
    return rows;
  }, [users, sort]);

  const toggleSort = (key) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <section aria-label="Зарегистрированные пользователи" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Пользователи</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Всего в базе: <span className="font-semibold text-slate-200">{users.length}</span>
          </p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <label htmlFor={searchId} className="sr-only">
            Поиск по имени, почте или городу
          </label>
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: имя, почта, город…"
            className="pl-10"
          />
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Spinner label="Загружаем пользователей…" />
      ) : sortedUsers.length === 0 ? (
        <EmptyState
          icon={<Users size={40} aria-hidden="true" />}
          title={debounced ? 'Ничего не найдено' : 'Пользователей пока нет'}
          description={
            debounced
              ? 'Попробуйте изменить запрос — поиск идёт по имени, почте и городу.'
              : 'Как только появятся регистрации, они отобразятся здесь.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-space-900/60 text-xs uppercase tracking-wide text-slate-400">
                <SortableTh label="Имя" col="name" sort={sort} onSort={toggleSort} />
                <th scope="col" className="px-4 py-3 font-semibold">Почта</th>
                <SortableTh label="Возраст" col="age" sort={sort} onSort={toggleSort} align="right" />
                <th scope="col" className="px-4 py-3 font-semibold">Город</th>
                <th scope="col" className="px-4 py-3 font-semibold">Роль</th>
                <SortableTh label="XP" col="xp" sort={sort} onSort={toggleSort} align="right" />
                <th scope="col" className="px-4 py-3 font-semibold">Подписка</th>
                <SortableTh label="Навыков" col="completed" sort={sort} onSort={toggleSort} align="right" />
                <SortableTh label="Работ" col="works" sort={sort} onSort={toggleSort} align="right" />
                <th scope="col" className="px-4 py-3 font-semibold">Регистрация</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((u) => {
                const sub = SUBSCRIPTION[u.subscription] || { tone: 'neutral', label: u.subscription || '—' };
                return (
                  <tr key={u.id} className="border-b border-white/5 transition last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-space-600 to-space-800 font-display text-sm font-bold text-gold-300"
                          aria-hidden="true"
                        >
                          {initialOf(u.name)}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-slate-100">{u.name || '—'}</span>
                          {u.isAdmin && (
                            <Badge tone="gold">
                              <ShieldCheck size={12} aria-hidden="true" />
                              админ
                            </Badge>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{u.email || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{u.age ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{u.city || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{ROLE_LABEL[u.role] || u.role || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gold-300">{u.xp ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge tone={sub.tone}>{sub.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{u.completed ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{u.works ?? 0}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{u.registered || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SortableTh({ label, col, sort, onSort, align = 'left' }) {
  const active = sort.key === col;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '';
  return (
    <th scope="col" className={cx('px-4 py-3 font-semibold', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => onSort(col)}
        aria-label={`Сортировать по «${label}»`}
        className={cx(
          'inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-gold-300',
          active ? 'text-gold-300' : 'text-slate-400'
        )}
      >
        {label}
        {arrow && <span aria-hidden="true" className="text-[9px]">{arrow}</span>}
      </button>
    </th>
  );
}
