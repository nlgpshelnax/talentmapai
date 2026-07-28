import { useMemo, useRef, useState } from 'react';
import { ExternalLink, Link2, MapPin, Pencil, Plus, Save, Star as StarIcon, Trash2, Wrench } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea, cx } from '../ui';

/**
 * Editor for the selected star + its resources.
 *
 * Props:
 *   star      : the selected star object | null
 *   resources : [{id,starId,type,title,detail1,detail2,link,city}]  (all; filtered here)
 *   onChanged : () => Promise|void  — parent reload() after a mutation
 *   onDeleted : (starId) => void    — clear selection after the star is removed
 */

export const STAR_LEVELS = [
  'Низкий (Начальный)',
  'Допустимый (Базовый)',
  'Высокий (Прогрессивный)',
  'Экспертный (Профи)',
];

/**
 * Очных занятий среди ресурсов навыка больше нет: они переехали в каталог
 * площадок, который привязан к направлению и городу. Ресурс навыка — это
 * онлайн-курс или инструмент, то есть то, что одинаково для всех городов.
 */
const RESOURCE_TYPES = [
  { value: 'online', label: 'Онлайн', icon: Link2 },
  { value: 'tool', label: 'Инструмент', icon: Wrench },
];

const EMPTY_RESOURCE = { type: 'online', title: '', detail1: '', detail2: '', link: '', city: 'Все города' };

function formFromStar(star) {
  return {
    name: star.name || '',
    level: STAR_LEVELS.includes(star.level) ? star.level : STAR_LEVELS[0],
    description: star.description || '',
    x: Number.isFinite(star.x) ? star.x : 0,
    y: Number.isFinite(star.y) ? star.y : 0,
  };
}

export default function StarPanel({ star, resources, onChanged, onDeleted }) {
  const [form, setForm] = useState(() => (star ? formFromStar(star) : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [confirmDeleteStar, setConfirmDeleteStar] = useState(false);
  const [deletingStar, setDeletingStar] = useState(false);

  const [resourceModal, setResourceModal] = useState(null); // {mode:'create'|'edit', data}
  const [confirmDeleteRes, setConfirmDeleteRes] = useState(null);

  // Re-seed the edit form only when a *different* star is selected. Adjusting
  // state during render (the React-recommended alternative to a reset effect)
  // means editing the same star's fields never gets clobbered by a background
  // reload, and switching stars replaces the form without a stale frame.
  const lastStarId = useRef(star?.id ?? null);
  const currentId = star?.id ?? null;
  if (currentId !== lastStarId.current) {
    lastStarId.current = currentId;
    setForm(star ? formFromStar(star) : null);
    setFieldErrors({});
    setError('');
  }

  const starResources = useMemo(
    () => (star ? resources.filter((r) => r.starId === star.id) : []),
    [resources, star]
  );

  if (!star || !form) {
    return (
      <section aria-label="Навык" className="glass flex h-full flex-col items-center justify-center rounded-2xl p-8 text-center">
        <StarIcon size={34} className="mb-3 text-slate-600" aria-hidden="true" />
        <h2 className="font-display text-base font-bold text-slate-300">Навык не выбран</h2>
        <p className="mt-1 max-w-xs text-sm text-slate-500">
          Выберите звезду на карте, чтобы отредактировать её и ресурсы, или добавьте новую.
        </p>
      </section>
    );
  }

  function validateStar() {
    const errs = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Название от 2 символов';
    if (!STAR_LEVELS.includes(form.level)) errs.level = 'Выберите уровень';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSaveStar(e) {
    e.preventDefault();
    if (saving) return;
    if (!validateStar()) return;

    setSaving(true);
    setError('');
    try {
      await api.put(`/admin/stars/${star.id}`, {
        name: form.name.trim(),
        level: form.level,
        description: form.description.trim(),
        x: Math.round(Number(form.x)) || 0,
        y: Math.round(Number(form.y)) || 0,
      });
      await onChanged?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить навык.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteStar() {
    if (deletingStar) return;
    setDeletingStar(true);
    setError('');
    try {
      await api.delete(`/admin/stars/${star.id}`);
      setConfirmDeleteStar(false);
      onDeleted?.(star.id);
      await onChanged?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить навык.'));
    } finally {
      setDeletingStar(false);
    }
  }

  async function handleDeleteResource() {
    if (!confirmDeleteRes) return;
    try {
      await api.delete(`/admin/resources/${confirmDeleteRes.id}`);
      setConfirmDeleteRes(null);
      await onChanged?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить ресурс.'));
      setConfirmDeleteRes(null);
    }
  }

  return (
    <section aria-label={`Навык: ${star.name}`} className="glass flex flex-col rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate font-display text-base font-bold text-white">Навык</h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirmDeleteStar(true)}
          className="text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
        >
          <Trash2 size={15} aria-hidden="true" />
          Удалить
        </Button>
      </div>

      {error && <Alert tone="error" className="mb-3">{error}</Alert>}

      <form onSubmit={handleSaveStar} noValidate className="space-y-3.5">
        <Field label="Название" htmlFor="star-name" required error={fieldErrors.name}>
          <Input
            id="star-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={120}
            required
          />
        </Field>

        <Field label="Уровень" htmlFor="star-level" required error={fieldErrors.level}>
          <Select
            id="star-level"
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
          >
            {STAR_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Описание" htmlFor="star-desc">
          <Textarea
            id="star-desc"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            maxLength={600}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Позиция X" htmlFor="star-x">
            <Input id="star-x" type="number" value={form.x} onChange={(e) => setForm((f) => ({ ...f, x: e.target.value }))} />
          </Field>
          <Field label="Позиция Y" htmlFor="star-y">
            <Input id="star-y" type="number" value={form.y} onChange={(e) => setForm((f) => ({ ...f, y: e.target.value }))} />
          </Field>
        </div>

        <Button type="submit" loading={saving} className="w-full">
          <Save size={16} aria-hidden="true" />
          Сохранить навык
        </Button>
      </form>

      {/* Resources */}
      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-200">
            Ресурсы <span className="text-slate-500">({starResources.length})</span>
          </h3>
          <Button size="sm" variant="secondary" onClick={() => setResourceModal({ mode: 'create', data: EMPTY_RESOURCE })}>
            <Plus size={14} aria-hidden="true" />
            Добавить
          </Button>
        </div>

        {starResources.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/12 px-3 py-5 text-center text-xs text-slate-400">
            У навыка нет ресурсов. Добавьте офлайн-занятия, онлайн-курсы и инструменты.
          </p>
        ) : (
          <ul className="space-y-2">
            {starResources.map((r) => {
              const meta = RESOURCE_TYPES.find((t) => t.value === r.type);
              const Icon = meta?.icon || Link2;
              return (
                <li key={r.id} className="rounded-xl border border-white/10 bg-space-800/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">
                          <Icon size={11} aria-hidden="true" />
                          {meta?.label || r.type}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-100">{r.title}</span>
                      </div>
                      {(r.detail1 || r.detail2 || r.city) && (
                        <p className="mt-1 text-xs text-slate-400">
                          {[r.detail1, r.detail2, r.city].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {r.link && (
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-gold-300 transition hover:text-gold-200"
                        >
                          <ExternalLink size={11} aria-hidden="true" />
                          Ссылка
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setResourceModal({ mode: 'edit', data: r })}
                        aria-label={`Редактировать ресурс «${r.title}»`}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                      >
                        <Pencil size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteRes(r)}
                        aria-label={`Удалить ресурс «${r.title}»`}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {resourceModal && (
        <ResourceModal
          starId={star.id}
          mode={resourceModal.mode}
          initial={resourceModal.data}
          onClose={() => setResourceModal(null)}
          onSaved={async () => {
            setResourceModal(null);
            await onChanged?.();
          }}
        />
      )}

      <Modal
        open={confirmDeleteStar}
        onClose={() => (deletingStar ? null : setConfirmDeleteStar(false))}
        title="Удалить навык?"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Навык «<span className="font-semibold text-white">{star.name}</span>» будет удалён вместе со всеми его
            связями и ресурсами. Это действие необратимо.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmDeleteStar(false)} disabled={deletingStar}>
              Отмена
            </Button>
            <Button type="button" variant="danger" onClick={handleDeleteStar} loading={deletingStar}>
              <Trash2 size={16} aria-hidden="true" />
              Удалить навык
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmDeleteRes)}
        onClose={() => setConfirmDeleteRes(null)}
        title="Удалить ресурс?"
        size="sm"
      >
        {confirmDeleteRes && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Ресурс «<span className="font-semibold text-white">{confirmDeleteRes.title}</span>» будет удалён.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDeleteRes(null)}>
                Отмена
              </Button>
              <Button type="button" variant="danger" onClick={handleDeleteResource}>
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

/* --------------------------------------------------------- resource sub-form */

function ResourceModal({ starId, mode, initial, onClose, onSaved }) {
  const [form, setForm] = useState({
    type: RESOURCE_TYPES.some((t) => t.value === initial.type) ? initial.type : 'online',
    title: initial.title || '',
    detail1: initial.detail1 || '',
    detail2: initial.detail2 || '',
    link: initial.link || '',
    city: initial.city || 'Все города',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  function validate() {
    const errs = {};
    if (!form.title.trim() || form.title.trim().length < 2) errs.title = 'Название от 2 символов';
    // Server enforces the same rule: link must be empty or an http(s) URL.
    if (form.link.trim() && !/^https?:\/\//i.test(form.link.trim())) {
      errs.link = 'Ссылка должна начинаться с http:// или https://';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    setError('');
    const payload = {
      type: form.type,
      title: form.title.trim(),
      detail1: form.detail1.trim(),
      detail2: form.detail2.trim(),
      link: form.link.trim(),
      city: form.city.trim() || 'Все города',
    };

    try {
      if (mode === 'edit') {
        await api.put(`/admin/resources/${initial.id}`, payload);
      } else {
        await api.post('/admin/resources', { starId, ...payload });
      }
      await onSaved?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить ресурс.'));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (saving ? null : onClose?.())}
      title={mode === 'edit' ? 'Редактировать ресурс' : 'Новый ресурс'}
      size="md"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Тип" htmlFor="res-type" required>
            <Select id="res-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {RESOURCE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Город" htmlFor="res-city" hint="Для офлайн-занятий.">
            <Input
              id="res-city"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="Все города"
              maxLength={80}
            />
          </Field>
        </div>

        <Field label="Название" htmlFor="res-title" required error={fieldErrors.title}>
          <Input
            id="res-title"
            data-autofocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            maxLength={160}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Деталь 1" htmlFor="res-d1" hint="Адрес, автор, цена…">
            <Input
              id="res-d1"
              value={form.detail1}
              onChange={(e) => setForm((f) => ({ ...f, detail1: e.target.value }))}
              maxLength={200}
            />
          </Field>
          <Field label="Деталь 2" htmlFor="res-d2">
            <Input
              id="res-d2"
              value={form.detail2}
              onChange={(e) => setForm((f) => ({ ...f, detail2: e.target.value }))}
              maxLength={200}
            />
          </Field>
        </div>

        <Field label="Ссылка" htmlFor="res-link" error={fieldErrors.link} hint="Необязательно. http:// или https://">
          <Input
            id="res-link"
            type="url"
            inputMode="url"
            value={form.link}
            onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
            placeholder="https://…"
            className={cx(fieldErrors.link && 'border-rose-400/60')}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" loading={saving}>
            <Save size={16} aria-hidden="true" />
            {mode === 'edit' ? 'Сохранить' : 'Добавить'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
