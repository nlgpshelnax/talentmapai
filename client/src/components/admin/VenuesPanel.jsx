import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  ExternalLink,
  Info,
  MapPin,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { Alert, Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner, Textarea, cx } from '../ui';

/**
 * Каталог площадок (кружки, центры, школы) — раздел админ-панели.
 *
 * Прежде площадки редактировались только правкой data/venues.js и пересозданием
 * базы. Клиент не мог добавить центр в своём городе без разработчика. Этот раздел
 * закрывает пробел: список с фильтрами, добавление/редактирование в модальном окне,
 * удаление с подтверждением.
 *
 * Раздел самодостаточен (как CitiesPanel): сам грузит данные и справочники формы.
 *
 * Props:
 *   onChanged : () => void | Promise  — (необязательно) вызывается после любой
 *               мутации, чтобы родитель мог обновить сводную статистику (счётчик
 *               площадок в шапке). Если не передан — раздел просто перезагружает
 *               свой список сам.
 *
 * Дом-стиль и визуальный язык повторяют CitiesPanel / ConstellationPanel:
 * стеклянные карточки, золотой акцент, модалки из ui/, состояния загрузки/ошибки/
 * пустого списка. Порядок обновления состояния не нарушает правило react-hooks
 * `set-state-in-effect`: загрузка в эффектах уходит в микротаску (Promise.then),
 * а сброс формы делается при открытии модалки, а не в эффекте.
 */

const PAGE_SIZE = 20;

const KIND_LABELS = {
  state: 'Государственная',
  nonprofit: 'НКО',
  university: 'Вуз',
  commercial: 'Коммерческая',
};

const FORMAT_LABELS = {
  offline: 'Очно',
  hybrid: 'Смешанно',
  online: 'Онлайн',
};

const EMPTY_FORM = {
  code: '',
  network: '',
  name: '',
  org: '',
  city: '',
  address: '',
  url: '',
  kind: 'commercial',
  format: 'offline',
  priceNote: '',
  ageRange: '',
  summary: '',
  directions: [],
  verified: false,
};

export default function VenuesPanel({ onChanged }) {
  const [venues, setVenues] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);

  const [meta, setMeta] = useState({ directions: [], cities: [], kinds: [], formats: [] });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Фильтры. `q` вводится в поле, `qApplied` — то, что реально ушло в запрос
  // (с задержкой), чтобы не дёргать сервер на каждой букве.
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [city, setCity] = useState('');
  const [direction, setDirection] = useState('');
  const [verified, setVerified] = useState('');

  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', data }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Человеческое имя направления по ключу — для показа в таблице.
  const directionName = useCallback(
    (key) => meta.directions.find((d) => d.key === key)?.name || key,
    [meta.directions]
  );

  const loadMeta = useCallback(async (signal) => {
    try {
      const res = await api.get('/admin/venues/meta', { signal });
      if (mounted.current) setMeta(res.data || { directions: [], cities: [], kinds: [], formats: [] });
    } catch (err) {
      if (err.name === 'CanceledError') return;
      // Метаданные не критичны для отображения списка — молча продолжаем,
      // селекты просто будут беднее.
    }
  }, []);

  const load = useCallback(
    async (signal) => {
      setLoading(true);
      try {
        const params = { page, pageSize: PAGE_SIZE };
        if (qApplied) params.q = qApplied;
        if (city) params.city = city;
        if (direction) params.direction = direction;
        if (verified) params.verified = verified;

        const res = await api.get('/admin/venues', { params, signal });
        if (!mounted.current) return;
        setVenues(res.data.venues || []);
        setTotal(res.data.total || 0);
        setPages(res.data.pages || 1);
        setError('');
      } catch (err) {
        if (err.name === 'CanceledError' || !mounted.current) return;
        setError(errorMessage(err, 'Не удалось загрузить каталог площадок'));
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [page, qApplied, city, direction, verified]
  );

  // Справочники формы — один раз при монтировании. Загрузка в микротаске, чтобы
  // не менять состояние синхронно внутри эффекта.
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => loadMeta(controller.signal));
    return () => controller.abort();
  }, [loadMeta]);

  // Список — при первом рендере и при любой смене фильтров/страницы.
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  // Задержка ввода поиска: применяем `q` через 300 мс тишины.
  useEffect(() => {
    const t = setTimeout(() => {
      setQApplied(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Смена любого фильтра-селекта возвращает на первую страницу.
  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  const refreshAfterMutation = useCallback(async () => {
    const controller = new AbortController();
    await load(controller.signal);
    await onChanged?.();
  }, [load, onChanged]);

  function openCreate() {
    setModal({ mode: 'create', data: EMPTY_FORM });
  }

  function openEdit(v) {
    setModal({
      mode: 'edit',
      data: {
        code: v.code || '',
        network: v.network || '',
        name: v.name || '',
        org: v.org || '',
        city: v.city || '',
        address: v.address || '',
        url: v.url || '',
        kind: KIND_LABELS[v.kind] ? v.kind : 'commercial',
        format: FORMAT_LABELS[v.format] ? v.format : 'offline',
        priceNote: v.priceNote || '',
        ageRange: v.ageRange || '',
        summary: v.summary || '',
        directions: Array.isArray(v.directions) ? v.directions : [],
        verified: Boolean(v.verified),
      },
      id: v.id,
    });
  }

  async function handleDelete() {
    if (!confirmDelete || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/admin/venues/${confirmDelete.id}`);
      setConfirmDelete(null);
      // Если удалили последнюю строку на странице — шагнём назад.
      if (venues.length === 1 && page > 1) setPage((p) => p - 1);
      else await refreshAfterMutation();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить площадку'));
    } finally {
      if (mounted.current) setDeleting(false);
    }
  }

  const hasActiveFilters = Boolean(qApplied || city || direction || verified);

  return (
    <section aria-labelledby="venues-heading" className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="venues-heading" className="flex items-center gap-2 text-xl font-bold text-white">
            <Building2 className="text-gold-400" size={20} aria-hidden="true" />
            Площадки
          </h2>
          <p className="text-sm text-slate-400">
            Реальные кружки, центры и школы, куда ребёнок может пойти учиться очно. Привязаны к городу и направлениям.
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus size={16} aria-hidden="true" />
          Добавить площадку
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {/* Фильтры */}
      <div className="glass grid grid-cols-1 gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Поиск" htmlFor="venue-search">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            />
            <Input
              id="venue-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название, организация, адрес…"
              className="pl-9"
              maxLength={120}
            />
          </div>
        </Field>

        <Field label="Город" htmlFor="venue-city-filter">
          <Select id="venue-city-filter" value={city} onChange={onFilterChange(setCity)}>
            <option value="">Все города</option>
            {meta.cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Направление" htmlFor="venue-direction-filter">
          <Select id="venue-direction-filter" value={direction} onChange={onFilterChange(setDirection)}>
            <option value="">Все направления</option>
            {meta.directions.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Проверка" htmlFor="venue-verified-filter">
          <Select id="venue-verified-filter" value={verified} onChange={onFilterChange(setVerified)}>
            <option value="">Любой статус</option>
            <option value="1">Только проверенные</option>
            <option value="0">Только непроверенные</option>
          </Select>
        </Field>
      </div>

      {/* Список */}
      {loading ? (
        <Spinner label="Загружаем площадки…" />
      ) : venues.length === 0 ? (
        <EmptyState
          icon="🏫"
          title={hasActiveFilters ? 'Ничего не найдено' : 'Каталог пуст'}
          description={
            hasActiveFilters
              ? 'Под эти фильтры площадок нет. Измените условия поиска.'
              : 'Добавьте первую площадку — она появится у детей в разделе «Где заниматься».'
          }
          action={
            !hasActiveFilters && (
              <Button onClick={openCreate}>
                <Plus size={16} aria-hidden="true" />
                Добавить площадку
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="text-sm text-slate-400">
            Найдено площадок: <span className="font-semibold text-slate-200">{total}</span>
          </p>

          <div className="glass overflow-hidden rounded-2xl">
            <ul className="divide-y divide-white/8">
              {venues.map((v) => (
                <li key={v.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-300">
                        <MapPin size={11} aria-hidden="true" />
                        {v.city}
                      </span>
                      <span className="truncate font-semibold text-slate-100">{v.name}</span>
                      {v.verified ? (
                        <Badge tone="green">
                          <BadgeCheck size={12} aria-hidden="true" />
                          Проверено
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Не проверено</Badge>
                      )}
                    </div>

                    {v.org && <p className="mt-0.5 truncate text-xs text-slate-500">{v.org}</p>}

                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {v.directions.length === 0 ? (
                        <span className="text-xs font-medium text-rose-300">Без направлений</span>
                      ) : (
                        v.directions.map((key) => (
                          <span
                            key={key}
                            className="rounded-full bg-nebula-400/10 px-2 py-0.5 text-[11px] font-medium text-nebula-400"
                          >
                            {directionName(key)}
                          </span>
                        ))
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      {v.priceNote && <span>{v.priceNote}</span>}
                      <span>{FORMAT_LABELS[v.format] || v.format}</span>
                      {v.url && (
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-gold-300 transition hover:text-gold-200"
                        >
                          <ExternalLink size={11} aria-hidden="true" />
                          Сайт
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => openEdit(v)}
                      aria-label={`Редактировать площадку «${v.name}»`}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(v)}
                      aria-label={`Удалить площадку «${v.name}»`}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Назад
              </Button>
              <span className="text-sm text-slate-400">
                Страница <span className="font-semibold text-slate-200">{page}</span> из {pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                Вперёд
              </Button>
            </div>
          )}
        </>
      )}

      {/* Форма создания / редактирования */}
      {modal && (
        <VenueFormModal
          mode={modal.mode}
          initial={modal.data}
          venueId={modal.id}
          directions={meta.directions}
          cities={meta.cities}
          kinds={meta.kinds}
          formats={meta.formats}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refreshAfterMutation();
          }}
        />
      )}

      {/* Подтверждение удаления */}
      <Modal
        open={Boolean(confirmDelete)}
        onClose={() => (deleting ? null : setConfirmDelete(null))}
        title="Удалить площадку?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Отмена
            </Button>
            <Button variant="danger" loading={deleting} onClick={handleDelete} data-autofocus>
              <Trash2 size={16} aria-hidden="true" />
              Удалить
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-300">
          Площадка «<span className="font-semibold text-white">{confirmDelete?.name}</span>»
          {confirmDelete?.city ? ` (${confirmDelete.city})` : ''} будет удалена из каталога. Дети перестанут видеть её
          в разделе «Где заниматься». Это действие необратимо.
        </p>
      </Modal>
    </section>
  );
}

/* --------------------------------------------------------- форма площадки */

function VenueFormModal({ mode, initial, venueId, directions, kinds, formats, cities, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const kindOptions = kinds.length ? kinds : ['state', 'nonprofit', 'university', 'commercial'];
  const formatOptions = formats.length ? formats : ['offline', 'hybrid', 'online'];

  const selectedSet = useMemo(() => new Set(form.directions), [form.directions]);

  function toggleDirection(key) {
    setForm((f) => {
      const has = f.directions.includes(key);
      return { ...f, directions: has ? f.directions.filter((k) => k !== key) : [...f.directions, key] };
    });
  }

  function validate() {
    const errs = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Название от 2 символов';
    if (!form.city.trim() || form.city.trim().length < 2) errs.city = 'Укажите город';
    if (form.directions.length === 0) errs.directions = 'Выберите хотя бы одно направление';
    // Тот же контракт, что и на сервере: ссылка обязательна для площадки и должна
    // быть http(s). Пустую ссылку сервер бы принял, но каталог без ссылки бесполезен.
    if (!form.url.trim()) errs.url = 'Укажите ссылку на сайт площадки';
    else if (!/^https?:\/\//i.test(form.url.trim())) errs.url = 'Ссылка должна начинаться с http:// или https://';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!validate()) return;

    setSaving(true);
    setError('');

    // Пустые необязательные поля не отправляем: сервер сам проставит NULL, а
    // пустой адрес честнее выдуманного.
    const payload = {
      network: form.network.trim(),
      name: form.name.trim(),
      city: form.city.trim(),
      url: form.url.trim(),
      kind: form.kind,
      format: form.format,
      directions: form.directions,
      verified: form.verified,
    };
    if (form.org.trim()) payload.org = form.org.trim();
    if (form.address.trim()) payload.address = form.address.trim();
    if (form.priceNote.trim()) payload.priceNote = form.priceNote.trim();
    if (form.ageRange.trim()) payload.ageRange = form.ageRange.trim();
    if (form.summary.trim()) payload.summary = form.summary.trim();
    if (mode === 'create' && form.code.trim()) payload.code = form.code.trim();

    try {
      if (mode === 'edit') {
        await api.put(`/admin/venues/${venueId}`, payload);
      } else {
        await api.post('/admin/venues', payload);
      }
      await onSaved?.();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось сохранить площадку.'));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (saving ? null : onClose?.())}
      title={mode === 'edit' ? 'Редактировать площадку' : 'Новая площадка'}
      subtitle={mode === 'edit' ? initial.name : 'Кружок, центр или школа для очных занятий'}
      size="lg"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <Field label="Название" htmlFor="venue-name" required error={fieldErrors.name}>
          <Input
            id="venue-name"
            data-autofocus
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Например, «Кванториум»"
            maxLength={200}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Город" htmlFor="venue-city" required error={fieldErrors.city}>
            <Input
              id="venue-city"
              list="venue-city-list"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="Например, Казань"
              maxLength={80}
              required
            />
            <datalist id="venue-city-list">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Сеть" htmlFor="venue-network" hint="Название сети, если площадка входит в неё.">
            <Input
              id="venue-network"
              value={form.network}
              onChange={(e) => setForm((f) => ({ ...f, network: e.target.value }))}
              placeholder="Например, Кванториум"
              maxLength={120}
            />
          </Field>
        </div>

        <Field label="Организация" htmlFor="venue-org" hint="Полное юридическое название — необязательно.">
          <Input
            id="venue-org"
            value={form.org}
            onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))}
            maxLength={300}
          />
        </Field>

        <Field
          label="Адрес"
          htmlFor="venue-address"
          hint="Необязательно. Оставьте пустым, если адрес не подтверждён: пустой адрес честнее правдоподобного вымысла — не придумывайте его."
        >
          <Input
            id="venue-address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Улица, дом — только если подтверждено"
            maxLength={300}
          />
        </Field>

        <Field
          label="Ссылка на сайт"
          htmlFor="venue-url"
          required
          error={fieldErrors.url}
          hint="Официальный сайт площадки. http:// или https://"
        >
          <Input
            id="venue-url"
            type="url"
            inputMode="url"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://…"
            className={cx(fieldErrors.url && 'border-rose-400/60')}
            maxLength={500}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Тип" htmlFor="venue-kind">
            <Select
              id="venue-kind"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k] || k}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Формат" htmlFor="venue-format">
            <Select
              id="venue-format"
              value={form.format}
              onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
            >
              {formatOptions.map((fmt) => (
                <option key={fmt} value={fmt}>
                  {FORMAT_LABELS[fmt] || fmt}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Цена" htmlFor="venue-price" hint="Например, «Бесплатно» или «от 3000 ₽/мес».">
            <Input
              id="venue-price"
              value={form.priceNote}
              onChange={(e) => setForm((f) => ({ ...f, priceNote: e.target.value }))}
              maxLength={160}
            />
          </Field>

          <Field label="Возраст" htmlFor="venue-age" hint="Например, «7–14 лет».">
            <Input
              id="venue-age"
              value={form.ageRange}
              onChange={(e) => setForm((f) => ({ ...f, ageRange: e.target.value }))}
              maxLength={80}
            />
          </Field>
        </div>

        {/* Направления — мультивыбор человеческих названий, не ключей */}
        <Field
          label="Направления"
          required
          error={fieldErrors.directions}
          hint="Что здесь осваивают. Выберите одно или несколько."
        >
          {directions.length === 0 ? (
            <p className="text-sm text-slate-500">Список направлений не загружен.</p>
          ) : (
            <div className="flex flex-wrap gap-2 rounded-xl border border-white/12 bg-space-800/50 p-3">
              {directions.map((d) => {
                const active = selectedSet.has(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleDirection(d.key)}
                    className={cx(
                      'rounded-full border px-3 py-1 text-sm font-medium transition',
                      active
                        ? 'border-gold-400/50 bg-gold-400/15 text-gold-200'
                        : 'border-white/12 bg-space-800/60 text-slate-300 hover:border-white/25 hover:text-white'
                    )}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          )}
        </Field>

        <Field label="Описание" htmlFor="venue-summary" hint="Коротко о площадке — необязательно.">
          <Textarea
            id="venue-summary"
            rows={3}
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            placeholder="Чем занимаются, для кого, особенности…"
            maxLength={1000}
          />
        </Field>

        {/* «Проверено» — явный чекбокс, который ставит человек. Не выставляется
            автоматически: галочка означает, что страницу открыли и прочитали. */}
        <div className="rounded-xl border border-white/12 bg-space-800/40 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.verified}
              onChange={(e) => setForm((f) => ({ ...f, verified: e.target.checked }))}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-white/20 bg-space-800 accent-gold-400"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
                <BadgeCheck size={15} className="text-emerald-400" aria-hidden="true" />
                Проверено
              </span>
              <span className="mt-0.5 flex items-start gap-1.5 text-xs text-slate-400">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                Ставьте галочку, только если сами открыли сайт и прочитали страницу площадки. Это не проставляется
                автоматически — отметка означает, что данные проверил человек.
              </span>
            </span>
          </label>
        </div>

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
