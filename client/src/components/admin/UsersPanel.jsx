import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  LogOut,
  Pencil,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner, cx } from '../ui';

/**
 * Управление пользователями (заменяет прежнюю read-only таблицу UsersTable).
 *
 * Возможности: поиск (имя/почта/город), фильтр по роли и правам, пагинация,
 * а по каждой строке — правка, сброс пароля, принудительный выход и удаление.
 *
 * Предохранители продублированы на клиенте, чтобы администратор ПОНИМАЛ
 * правило, а не натыкался на ошибку сервера: опасные кнопки заблокированы и
 * снабжены подсказкой (`title`). Сервер всё равно перепроверяет — клиентская
 * блокировка это лишь удобство, а не защита.
 *
 * Props: нет. Панель сама грузит данные (они не связаны с графом навыков).
 */

const SUBSCRIPTION = {
  pro: { tone: 'gold', label: 'PRO' },
  trial: { tone: 'neutral', label: 'Пробная' },
};

const ROLE_LABEL = { child: 'Ребёнок', parent: 'Родитель' };

const PAGE_SIZE = 50;

function initialOf(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

export default function UsersPanel() {
  const { user: me } = useAuth();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [adminFilter, setAdminFilter] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState({ users: [], total: 0, pages: 1 });
  const [adminCount, setAdminCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Модалки: правка, пароль, подтверждение удаления.
  const [editing, setEditing] = useState(null);
  const [password, setPassword] = useState(null); // { user, password }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [rowBusyId, setRowBusyId] = useState(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Дебаунс строки поиска.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, pageSize: PAGE_SIZE };
      if (debounced) params.q = debounced;
      if (roleFilter) params.role = roleFilter;
      if (adminFilter) params.admin = adminFilter;
      const res = await api.get('/admin/users', { params });
      if (!mounted.current) return;
      setData({
        users: Array.isArray(res.data.users) ? res.data.users : [],
        total: res.data.total ?? 0,
        pages: res.data.pages ?? 1,
      });
    } catch (err) {
      if (mounted.current) setError(errorMessage(err, 'Не удалось загрузить пользователей.'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [page, debounced, roleFilter, adminFilter]);

  // Отложенный вызов (как в CitiesPanel): setState не выполняется синхронно
  // в теле эффекта, что и требует правило react-hooks/set-state-in-effect.
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  /**
   * Число администраторов в системе — нужно, чтобы заблокировать разжалование и
   * удаление ПОСЛЕДНЕГО админа ещё до обращения к серверу. Считаем отдельным
   * лёгким запросом (фильтр admin=1 возвращает total), не завися от пагинации.
   */
  const refreshAdminCount = useCallback(async () => {
    try {
      const res = await api.get('/admin/users', { params: { admin: '1', pageSize: 1 } });
      if (mounted.current) setAdminCount(res.data.total ?? null);
    } catch {
      if (mounted.current) setAdminCount(null);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(refreshAdminCount);
  }, [refreshAdminCount]);

  /** После любой мутации перечитываем и список, и счётчик админов. */
  const reloadAll = useCallback(async () => {
    await Promise.all([load(), refreshAdminCount()]);
  }, [load, refreshAdminCount]);

  // Разбор «почему нельзя» для конкретного действия над строкой.
  const guardFor = useCallback(
    (u) => {
      const isSelf = u.id === me?.id;
      const isLastAdmin = u.isAdmin && adminCount != null && adminCount <= 1;
      return {
        isSelf,
        isLastAdmin,
        // Удалять нельзя себя и последнего админа.
        deleteBlockedReason: isSelf
          ? 'Нельзя удалить собственный аккаунт'
          : isLastAdmin
            ? 'Это последний администратор — сначала назначьте другого'
            : null,
        // Разжаловать (снять права) нельзя себя и последнего админа.
        demoteBlockedReason: isSelf
          ? 'Нельзя снять права с самого себя'
          : isLastAdmin
            ? 'Это последний администратор — сначала назначьте другого'
            : null,
      };
    },
    [me?.id, adminCount]
  );

  async function handleResetPassword(u) {
    setRowBusyId(u.id);
    setError('');
    try {
      const res = await api.post(`/admin/users/${u.id}/reset-password`);
      setPassword({ user: u, password: res.data.password });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сбросить пароль.'));
    } finally {
      if (mounted.current) setRowBusyId(null);
    }
  }

  async function handleRevokeSessions(u) {
    setRowBusyId(u.id);
    setError('');
    try {
      await api.post(`/admin/users/${u.id}/revoke-sessions`);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось завершить сессии.'));
    } finally {
      if (mounted.current) setRowBusyId(null);
    }
  }

  const startIndex = (page - 1) * PAGE_SIZE;

  return (
    <section aria-label="Управление пользователями" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Пользователи</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Всего в базе: <span className="font-semibold text-slate-200">{data.total}</span>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search
              size={17}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <label htmlFor="users-search" className="sr-only">
              Поиск по имени, почте или городу
            </label>
            <Input
              id="users-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск: имя, почта, город…"
              className="pl-10"
            />
          </div>
          <label htmlFor="users-role" className="sr-only">
            Фильтр по роли
          </label>
          <Select
            id="users-role"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-40"
          >
            <option value="">Все роли</option>
            <option value="parent">Родители</option>
            <option value="child">Дети</option>
          </Select>
          <label htmlFor="users-admin" className="sr-only">
            Фильтр по правам
          </label>
          <Select
            id="users-admin"
            value={adminFilter}
            onChange={(e) => {
              setAdminFilter(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-44"
          >
            <option value="">Все права</option>
            <option value="1">Администраторы</option>
            <option value="0">Обычные</option>
          </Select>
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Spinner label="Загружаем пользователей…" />
      ) : data.users.length === 0 ? (
        <EmptyState
          icon={<Users size={40} aria-hidden="true" />}
          title={debounced || roleFilter || adminFilter ? 'Ничего не найдено' : 'Пользователей пока нет'}
          description={
            debounced || roleFilter || adminFilter
              ? 'Измените запрос или фильтры — поиск идёт по имени, почте и городу.'
              : 'Как только появятся регистрации, они отобразятся здесь.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-space-900/60 text-xs uppercase tracking-wide text-slate-400">
                <th scope="col" className="px-4 py-3 font-semibold">Имя</th>
                <th scope="col" className="px-4 py-3 font-semibold">Почта</th>
                <th scope="col" className="px-4 py-3 font-semibold">Роль</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">XP</th>
                <th scope="col" className="px-4 py-3 font-semibold">Подписка</th>
                <th scope="col" className="px-4 py-3 font-semibold">Регистрация</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const sub = SUBSCRIPTION[u.subscription] || { tone: 'neutral', label: u.subscription || '—' };
                const guard = guardFor(u);
                const busy = rowBusyId === u.id;
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
                          {u.id === me?.id && <Badge tone="violet">это вы</Badge>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{u.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{ROLE_LABEL[u.role] || u.role || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-gold-300">{u.xp ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge tone={sub.tone}>{sub.label}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-400">{u.registered || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <IconAction
                          icon={Pencil}
                          label={`Редактировать «${u.name}»`}
                          onClick={() => setEditing(u)}
                          disabled={busy}
                        />
                        <IconAction
                          icon={KeyRound}
                          label={`Сбросить пароль «${u.name}»`}
                          onClick={() => handleResetPassword(u)}
                          disabled={busy}
                        />
                        <IconAction
                          icon={LogOut}
                          label={`Завершить все сессии «${u.name}»`}
                          onClick={() => handleRevokeSessions(u)}
                          disabled={busy}
                        />
                        <IconAction
                          icon={Trash2}
                          label={
                            guard.deleteBlockedReason
                              ? guard.deleteBlockedReason
                              : `Удалить «${u.name}»`
                          }
                          tone="danger"
                          onClick={() => setConfirmDelete(u)}
                          disabled={busy || Boolean(guard.deleteBlockedReason)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Пагинация */}
      {data.pages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
          <span>
            {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, data.total)} из {data.total}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Назад
            </Button>
            <span className="tabular-nums">
              {page} / {data.pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            >
              Вперёд
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <EditUserModal
          user={editing}
          guard={guardFor(editing)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reloadAll();
          }}
        />
      )}

      <PasswordModal key={password?.password || 'pw-closed'} data={password} onClose={() => setPassword(null)} />

      <DeleteUserModal
        key={confirmDelete?.id || 'del-closed'}
        user={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onDeleted={async () => {
          setConfirmDelete(null);
          await reloadAll();
        }}
      />
    </section>
  );
}

/* --------------------------------------------------------------- IconAction */

/** Кнопка-иконка с подсказкой. При blocked-подсказке остаётся доступной для
 *  наведения (`title`), но не активной. */
function IconAction({ icon: Icon, label, onClick, disabled, tone = 'default' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cx(
        'rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'danger'
          ? 'text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 disabled:hover:bg-transparent disabled:hover:text-slate-400'
          : 'text-slate-400 hover:bg-white/10 hover:text-white disabled:hover:bg-transparent'
      )}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

/* -------------------------------------------------------------- EditUserModal */

function EditUserModal({ user, guard, onClose, onSaved }) {
  const [form, setForm] = useState({
    role: user.role || 'parent',
    subscription_status: user.subscription || 'trial',
    is_admin: Boolean(user.isAdmin),
    xp_points: String(user.xp ?? 0),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    const payload = {
      role: form.role,
      subscription_status: form.subscription_status,
      is_admin: form.is_admin,
      xp_points: Math.max(0, Math.round(Number(form.xp_points) || 0)),
    };
    try {
      await api.patch(`/admin/users/${user.id}`, payload);
      await onSaved?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить изменения.'));
    } finally {
      setSaving(false);
    }
  }

  // Галочку «администратор» нельзя снять, если это разжалование запрещено
  // (сам себя / последний админ). Выдать права можно всегда.
  const demoteLocked = form.is_admin && Boolean(guard.demoteBlockedReason);

  return (
    <Modal
      open
      onClose={() => (saving ? null : onClose())}
      title="Изменить пользователя"
      subtitle={`${user.name} · ${user.email}`}
      size="md"
    >
      <form onSubmit={handleSave} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Роль" htmlFor="edit-role">
            <Select
              id="edit-role"
              data-autofocus
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              <option value="parent">Родитель</option>
              <option value="child">Ребёнок</option>
            </Select>
          </Field>
          <Field label="Подписка" htmlFor="edit-sub">
            <Select
              id="edit-sub"
              value={form.subscription_status}
              onChange={(e) => setForm((f) => ({ ...f, subscription_status: e.target.value }))}
            >
              <option value="trial">Пробная</option>
              <option value="pro">PRO</option>
            </Select>
          </Field>
        </div>

        <Field label="Опыт (XP)" htmlFor="edit-xp" hint="Изменение не влияет на уже совершённые покупки.">
          <Input
            id="edit-xp"
            type="number"
            min={0}
            value={form.xp_points}
            onChange={(e) => setForm((f) => ({ ...f, xp_points: e.target.value }))}
          />
        </Field>

        <div className="rounded-xl border border-white/10 bg-space-800/50 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.is_admin}
              disabled={demoteLocked}
              onChange={(e) => setForm((f) => ({ ...f, is_admin: e.target.checked }))}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-white/20 bg-space-800 accent-gold-500 disabled:opacity-40"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-medium text-slate-100">
                <ShieldCheck size={15} className="text-gold-400" aria-hidden="true" />
                Права администратора
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                Полный доступ к панели управления: контент, пользователи, магазин.
              </span>
              {demoteLocked && (
                <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-gold-300">
                  <ShieldAlert size={13} aria-hidden="true" />
                  {guard.demoteBlockedReason}.
                </span>
              )}
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" loading={saving}>
            <Check size={16} aria-hidden="true" />
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------------- PasswordModal */

/** Показывает сгенерированный пароль РОВНО ОДИН РАЗ, с копированием и
 *  предупреждением. После закрытия пароль восстановить нельзя. */
function PasswordModal({ data, onClose }) {
  // Компонент перемонтируется через key при новом пароле (см. место вызова),
  // поэтому `copied` начинается с false без эффекта-сброса.
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal
      open={Boolean(data)}
      onClose={onClose}
      title="Новый пароль создан"
      subtitle={data ? `${data.user.name} · ${data.user.email}` : undefined}
      size="sm"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Готово
          </Button>
        </div>
      }
    >
      {data && (
        <div className="space-y-4">
          <Alert tone="warning">
            Пароль показывается <span className="font-semibold">только сейчас</span>. Скопируйте его и передайте
            пользователю — восстановить его позже будет нельзя. Все прежние сессии пользователя уже завершены.
          </Alert>
          <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-space-800/70 p-2 pl-4">
            <code className="min-w-0 flex-1 truncate font-mono text-lg tracking-wide text-gold-200">
              {data.password}
            </code>
            <Button type="button" variant="secondary" size="sm" onClick={copy} className="shrink-0">
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? 'Скопировано' : 'Копировать'}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Попросите пользователя сменить этот пароль после первого входа в разделе «Настройки».
          </p>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------- DeleteUserModal */

function DeleteUserModal({ user, onClose, onDeleted }) {
  // Перемонтируется через key по user.id (см. место вызова) — ошибка сбрасывается
  // сама, без эффекта.
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (!user || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/admin/users/${user.id}`);
      await onDeleted?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить пользователя.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={Boolean(user)} onClose={() => (deleting ? null : onClose())} title="Удалить пользователя?" size="sm">
      {user && (
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <p className="text-sm text-slate-300">
            Аккаунт «<span className="font-semibold text-white">{user.name}</span>» ({user.email}) будет удалён вместе
            со <span className="font-semibold text-rose-300">всем прогрессом, портфолио, покупками, историей и
            загруженными файлами</span>. Это действие необратимо.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={deleting}>
              Отмена
            </Button>
            <Button type="button" variant="danger" onClick={handleDelete} loading={deleting}>
              <Trash2 size={16} aria-hidden="true" />
              Удалить навсегда
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
