import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Plus, ShoppingBag, Sparkles, Trash2, Users } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from '../ui';

/**
 * Управление товарами магазина.
 *
 * До сих пор 7 наград были «зашиты» в сидер и не имели интерфейса. Здесь —
 * сетка карточек с превью иконки, добавление/правка через модалку и удаление
 * с подтверждением, где показано число владельцев.
 *
 * Важные правила предметной области отражены в подсказках интерфейса:
 *  - изменение цены не затрагивает уже совершённые покупки;
 *  - купленный товар удалить нельзя (иначе осиротеют покупки и сломается
 *    надетый предмет) — кнопка удаления у таких товаров заблокирована с
 *    объяснением.
 *
 * Props: нет. Панель сама грузит каталог.
 */

const TYPE_LABEL = { avatar: 'Аватар', frame: 'Рамка', title: 'Титул' };
const TYPE_TONE = { avatar: 'violet', frame: 'gold', title: 'green' };

const EMPTY_FORM = {
  code: '',
  title: '',
  description: '',
  price: '100',
  type: 'avatar',
  icon: '✨',
  payload: '',
  sort_order: '',
};

export default function StorePanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/store');
      if (mounted.current) setItems(Array.isArray(res.data.items) ? res.data.items : []);
    } catch (err) {
      if (mounted.current) setError(errorMessage(err, 'Не удалось загрузить товары.'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // Отложенный вызов (как в CitiesPanel): setState не идёт синхронно в теле
  // эффекта — этого требует правило react-hooks/set-state-in-effect.
  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      code: item.code || '',
      title: item.title || '',
      description: item.description || '',
      price: String(item.price ?? 0),
      type: item.type || 'avatar',
      icon: item.icon || '✨',
      payload: item.payload || '',
      sort_order: String(item.sortOrder ?? ''),
    });
    setFieldErrors({});
    setFormError('');
    setModalOpen(true);
  }

  function validate() {
    const errs = {};
    if (!form.code.trim() || form.code.trim().length < 2) errs.code = 'Код от 2 символов';
    else if (!/^[a-z0-9_]+$/i.test(form.code.trim())) errs.code = 'Только латиница, цифры и подчёркивание';
    if (!form.title.trim() || form.title.trim().length < 2) errs.title = 'Название от 2 символов';
    if (!form.payload.trim()) errs.payload = 'Укажите содержимое (эмодзи, ключ рамки или текст титула)';
    if (!form.icon.trim()) errs.icon = 'Укажите иконку';
    if (Number(form.price) < 0 || Number.isNaN(Number(form.price))) errs.price = 'Цена — неотрицательное число';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    setFormError('');

    const payload = {
      code: form.code.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      price: Math.max(0, Math.round(Number(form.price) || 0)),
      type: form.type,
      icon: form.icon.trim() || '✨',
      payload: form.payload.trim(),
    };
    if (form.sort_order !== '' && !Number.isNaN(Number(form.sort_order))) {
      payload.sort_order = Math.max(0, Math.round(Number(form.sort_order)));
    }

    try {
      if (editing) await api.put(`/admin/store/${editing.id}`, payload);
      else await api.post('/admin/store', payload);
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, 'Не удалось сохранить товар.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    setFormError('');
    try {
      await api.delete(`/admin/store/${confirmDelete.id}`);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      // Сервер вернёт 409 с числом владельцев, если товар куплен.
      setError(errorMessage(err, 'Не удалось удалить товар.'));
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-label="Товары магазина" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-white">
            <ShoppingBag className="text-gold-400" size={20} aria-hidden="true" />
            Магазин наград
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Аватары, рамки и титулы, которые дети покупают за опыт (XP).
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus size={16} aria-hidden="true" />
          Добавить товар
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <Spinner label="Загружаем товары…" />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🛍️"
          title="Товаров пока нет"
          description="Добавьте первую награду — она появится в магазине у детей."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <article
              key={item.id}
              className="glass group flex flex-col gap-3 rounded-2xl border border-white/10 p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-space-800/70 text-3xl"
                  aria-hidden="true"
                >
                  {item.icon || '✨'}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-slate-100">{item.title}</h3>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={TYPE_TONE[item.type] || 'neutral'}>{TYPE_LABEL[item.type] || item.type}</Badge>
                    <span className="font-mono text-xs text-slate-500">{item.code}</span>
                  </p>
                </div>
              </div>

              {item.description && (
                <p className="line-clamp-2 text-sm text-slate-400">{item.description}</p>
              )}

              <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-3">
                <span className="flex items-center gap-3 text-sm">
                  <span className="font-semibold tabular-nums text-gold-300">{item.price} XP</span>
                  <span className="flex items-center gap-1 text-xs text-slate-500" title="Сколько пользователей владеют">
                    <Users size={13} aria-hidden="true" />
                    {item.owners}
                  </span>
                </span>
                <div className="flex items-center gap-0.5 opacity-80 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    title={`Редактировать «${item.title}»`}
                    aria-label={`Редактировать «${item.title}»`}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(item)}
                    disabled={item.owners > 0}
                    title={
                      item.owners > 0
                        ? `Нельзя удалить: товар куплен (${item.owners})`
                        : `Удалить «${item.title}»`
                    }
                    aria-label={
                      item.owners > 0
                        ? `Нельзя удалить «${item.title}»: товар уже куплен`
                        : `Удалить «${item.title}»`
                    }
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Создание / правка */}
      <Modal
        open={modalOpen}
        onClose={() => (saving ? null : setModalOpen(false))}
        title={editing ? 'Редактировать товар' : 'Новый товар'}
        subtitle={editing ? editing.title : 'Награда для магазина'}
        size="md"
      >
        <form onSubmit={handleSave} noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Код (латиницей)" htmlFor="store-code" required error={fieldErrors.code} hint="Например, avatar_cat">
              <Input
                id="store-code"
                data-autofocus
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="avatar_cat"
                maxLength={60}
              />
            </Field>
            <Field label="Тип" htmlFor="store-type" required>
              <Select
                id="store-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="avatar">Аватар</option>
                <option value="frame">Рамка</option>
                <option value="title">Титул</option>
              </Select>
            </Field>
          </div>

          <Field label="Название" htmlFor="store-title" required error={fieldErrors.title}>
            <Input
              id="store-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Например, Аватар «Котёнок»"
              maxLength={80}
            />
          </Field>

          <Field label="Описание" htmlFor="store-desc">
            <Textarea
              id="store-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Коротко о награде…"
              maxLength={240}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Иконка (эмодзи)" htmlFor="store-icon" required error={fieldErrors.icon}>
              <Input
                id="store-icon"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="🐱"
                maxLength={16}
              />
            </Field>
            <Field label="Цена (XP)" htmlFor="store-price" required error={fieldErrors.price}>
              <Input
                id="store-price"
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </Field>
            <Field label="Порядок" htmlFor="store-sort" hint="Необязательно">
              <Input
                id="store-sort"
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                placeholder="авто"
              />
            </Field>
          </div>

          <Field
            label="Содержимое (payload)"
            htmlFor="store-payload"
            required
            error={fieldErrors.payload}
            hint="Что надевается: эмодзи для аватара, ключ рамки (gold/comet) или текст титула."
          >
            <Input
              id="store-payload"
              value={form.payload}
              onChange={(e) => setForm((f) => ({ ...f, payload: e.target.value }))}
              placeholder="🐱  или  gold  или  Звёздный Лорд"
              maxLength={120}
            />
          </Field>

          {editing && editing.owners > 0 && (
            <Alert tone="info">
              Этим товаром уже владеют {editing.owners} польз. Изменение цены не затронет их — списанный ранее опыт
              не вернётся и не доначислится.
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" loading={saving}>
              <Sparkles size={16} aria-hidden="true" />
              {editing ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Подтверждение удаления */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => (deleting ? null : setConfirmDelete(null))}
        title="Удалить товар?"
        size="sm"
      >
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Товар «<span className="font-semibold text-white">{confirmDelete.title}</span>» будет удалён из магазина.
              {' '}
              {confirmDelete.owners > 0 ? (
                <span className="font-semibold text-rose-300">
                  Им уже владеют {confirmDelete.owners} польз. — удаление невозможно.
                </span>
              ) : (
                <span className="text-slate-400">Этим товаром пока никто не владеет — удаление безопасно.</span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Отмена
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
                loading={deleting}
                disabled={confirmDelete.owners > 0}
              >
                <Trash2 size={16} aria-hidden="true" />
                Удалить
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
