import { useState } from 'react';
import { Pencil, Plus, Sparkles, Star, Trash2 } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { skills } from '../../lib/plural';
import { Alert, Button, Field, Input, Modal, Textarea, cx } from '../ui';

/**
 * Constellation list + create/edit/delete.
 *
 * Props:
 *   constellations : [{id,name,description,icon,accent,x,y,...}]
 *   stars          : [{id,constellationId,...}]  (for per-constellation counts)
 *   selectedId     : number | null
 *   onSelect       : (id|null) => void
 *   onChanged      : () => Promise|void   — parent reload() after a mutation
 */

const EMPTY_FORM = { name: '', description: '', icon: '✨', accent: '#818cf8', x: 500, y: 300 };

export default function ConstellationPanel({ constellations, stars, selectedId, onSelect, onChanged }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // constellation being edited, or null for create
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const starCount = (id) => stars.filter((s) => s.constellationId === id).length;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({
      name: c.name || '',
      description: c.description || '',
      icon: c.icon || '✨',
      accent: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.accent || '') ? c.accent : '#818cf8',
      x: Number.isFinite(c.x) ? c.x : 500,
      y: Number.isFinite(c.y) ? c.y : 300,
    });
    setFieldErrors({});
    setError('');
    setModalOpen(true);
  }

  function validate() {
    const errs = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Название от 2 символов';
    if (form.icon && form.icon.length > 8) errs.icon = 'Не длиннее 8 символов';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      icon: form.icon.trim() || '✨',
      accent: form.accent,
      x: Math.round(Number(form.x)) || 0,
      y: Math.round(Number(form.y)) || 0,
    };

    try {
      if (editing) {
        await api.put(`/admin/constellations/${editing.id}`, payload);
      } else {
        const res = await api.post('/admin/constellations', payload);
        if (res.data?.id) onSelect?.(res.data.id);
      }
      await onChanged?.();
      setModalOpen(false);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить созвездие.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/admin/constellations/${confirmDelete.id}`);
      if (selectedId === confirmDelete.id) onSelect?.(null);
      await onChanged?.();
      setConfirmDelete(null);
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить созвездие.'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-label="Созвездия" className="glass flex flex-col rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-white">Созвездия</h2>
        <Button size="sm" variant="secondary" onClick={openCreate}>
          <Plus size={15} aria-hidden="true" />
          Создать
        </Button>
      </div>

      {error && !modalOpen && !confirmDelete && (
        <Alert tone="error" className="mb-3">
          {error}
        </Alert>
      )}

      {constellations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/12 px-4 py-8 text-center text-sm text-slate-400">
          Пока нет ни одного созвездия. Создайте первое, чтобы добавлять навыки.
        </p>
      ) : (
        <ul className="space-y-1.5" role="listbox" aria-label="Список созвездий">
          {constellations.map((c) => {
            const active = c.id === selectedId;
            return (
              <li key={c.id}>
                <div
                  className={cx(
                    'group flex items-center gap-2 rounded-xl border px-2.5 py-2 transition',
                    active
                      ? 'border-gold-400/40 bg-gold-400/10'
                      : 'border-transparent bg-space-800/40 hover:bg-space-700/50'
                  )}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onSelect?.(c.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg"
                      style={{ backgroundColor: `${hexToRgba(c.accent, 0.16)}` }}
                      aria-hidden="true"
                    >
                      {c.icon || '✨'}
                    </span>
                    <span className="min-w-0">
                      <span className={cx('block truncate text-sm font-semibold', active ? 'text-gold-200' : 'text-slate-100')}>
                        {c.name}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Star size={11} aria-hidden="true" />
                        {skills(starCount(c.id))}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-70 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      aria-label={`Редактировать созвездие «${c.name}»`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(c)}
                      aria-label={`Удалить созвездие «${c.name}»`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Create / edit form */}
      <Modal
        open={modalOpen}
        onClose={() => (saving ? null : setModalOpen(false))}
        title={editing ? 'Редактировать созвездие' : 'Новое созвездие'}
        subtitle={editing ? editing.name : 'Группа связанных навыков на карте'}
        size="md"
      >
        <form onSubmit={handleSave} noValidate className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}

          <Field label="Название" htmlFor="const-name" required error={fieldErrors.name}>
            <Input
              id="const-name"
              data-autofocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Например, «Компьютерная графика»"
              maxLength={80}
              required
            />
          </Field>

          <Field label="Описание" htmlFor="const-desc" hint="Используется ИИ-помощником при подборе.">
            <Textarea
              id="const-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Коротко о направлении…"
              maxLength={500}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Иконка (эмодзи)" htmlFor="const-icon" error={fieldErrors.icon}>
              <Input
                id="const-icon"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="🎨"
                maxLength={8}
              />
            </Field>
            <Field label="Цвет акцента" htmlFor="const-accent">
              <div className="flex items-center gap-2">
                <input
                  id="const-accent"
                  type="color"
                  value={form.accent}
                  onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))}
                  aria-label="Цвет акцента созвездия"
                  className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-white/12 bg-space-800/70 p-1"
                />
                <span className="font-mono text-sm text-slate-300">{form.accent}</span>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Позиция X" htmlFor="const-x">
              <Input
                id="const-x"
                type="number"
                value={form.x}
                onChange={(e) => setForm((f) => ({ ...f, x: e.target.value }))}
              />
            </Field>
            <Field label="Позиция Y" htmlFor="const-y">
              <Input
                id="const-y"
                type="number"
                value={form.y}
                onChange={(e) => setForm((f) => ({ ...f, y: e.target.value }))}
              />
            </Field>
          </div>

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

      {/* Delete confirmation */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => (deleting ? null : setConfirmDelete(null))}
        title="Удалить созвездие?"
        size="sm"
      >
        {confirmDelete && (
          <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <p className="text-sm text-slate-300">
              Созвездие «<span className="font-semibold text-white">{confirmDelete.name}</span>» будет удалено вместе
              со <span className="font-semibold text-rose-300">
                всеми его навыками ({starCount(confirmDelete.id)}), связями и ресурсами
              </span>. Это действие необратимо.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>
                Отмена
              </Button>
              <Button type="button" variant="danger" onClick={handleDelete} loading={deleting}>
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

/** Turn a #rrggbb / #rgb accent into an rgba() background tint. */
function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(129,140,248,${alpha})`;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const int = parseInt(h, 16);
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}
