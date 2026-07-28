import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Images,
  Plus,
  Upload,
  Filter,
  Trash2,
  Sparkles,
  ImageOff,
  X,
} from 'lucide-react';

import { useAppState } from '../context/AppStateContext';
import api, { errorMessage } from '../lib/api';
import {
  Button,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  Alert,
  EmptyState,
  Badge,
  Spinner,
  cx,
} from '../components/ui';

const MAX_BYTES = 5 * 1024 * 1024; // 5 МБ — зеркалит серверный лимит
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const ALL = '__all__';

/**
 * Портфолио: галерея работ ребёнка с фильтром по компетенции, загрузкой файла
 * (drag-and-drop + клик), детальным просмотром с отзывом ИИ и удалением.
 */
export default function Portfolio() {
  const { state, loading, error, refresh } = useAppState();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [filter, setFilter] = useState(ALL);

  if (!state) {
    // Пока данные грузятся — спиннер; если загрузка провалилась — ошибка.
    return loading ? <Spinner label="Загружаем портфолио…" /> : <Alert tone="error">{error}</Alert>;
  }

  const portfolio = state.portfolio || [];
  const stars = state.stars || [];
  const constellations = state.constellations || [];

  const starById = new Map(stars.map((s) => [s.id, s]));
  const constellationById = new Map(constellations.map((c) => [c.id, c]));

  const starName = (id) => starById.get(id)?.name || 'Без компетенции';
  const constellationOf = (starId) => {
    const star = starById.get(starId);
    return star ? constellationById.get(star.constellationId) : null;
  };

  // Опции фильтра строятся только из компетенций, по которым реально есть работы.
  const filterOptions = (() => {
    const seen = new Map();
    for (const item of portfolio) {
      const c = constellationOf(item.starId);
      const key = c ? `c-${c.id}` : 'none';
      if (!seen.has(key)) {
        seen.set(key, { value: key, label: c ? c.name : 'Без компетенции', icon: c?.icon });
      }
    }
    return [...seen.values()];
  })();

  const visibleWorks =
    filter === ALL
      ? portfolio
      : portfolio.filter((item) => {
          const c = constellationOf(item.starId);
          const key = c ? `c-${c.id}` : 'none';
          return key === filter;
        });

  const detailItem = detailId != null ? portfolio.find((p) => p.id === detailId) || null : null;

  return (
    <section aria-labelledby="portfolio-heading" className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 id="portfolio-heading" className="flex items-center gap-2.5 text-2xl font-extrabold text-white sm:text-3xl">
            <Images className="text-gold-400" aria-hidden="true" />
            Портфолио
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {portfolio.length > 0
              ? `Твоих работ: ${portfolio.length}. Каждую проверяет ИИ-наставник.`
              : 'Загружай свои работы — их увидит ИИ-наставник и оставит отзыв.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {filterOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="portfolio-filter" className="flex items-center gap-1.5 text-sm text-slate-400">
                <Filter size={16} aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Компетенция</span>
              </label>
              <Select
                id="portfolio-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="min-w-[12rem]"
              >
                <option value={ALL}>Все работы</option>
                {filterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon ? `${opt.icon} ${opt.label}` : opt.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <Button type="button" onClick={() => setUploadOpen(true)}>
            <Plus size={18} aria-hidden="true" />
            Загрузить работу
          </Button>
        </div>
      </header>

      {portfolio.length === 0 ? (
        <EmptyState
          icon={<Images aria-hidden="true" />}
          title="Здесь пока пусто"
          description="Загрузи первую работу — рисунок, поделку, проект. ИИ-наставник посмотрит и подскажет, что получилось здорово."
          action={
            <Button type="button" onClick={() => setUploadOpen(true)}>
              <Plus size={18} aria-hidden="true" />
              Загрузить работу
            </Button>
          }
        />
      ) : visibleWorks.length === 0 ? (
        <EmptyState
          icon={<Filter aria-hidden="true" />}
          title="Нет работ по этому фильтру"
          description="Попробуй выбрать другую компетенцию или показать все работы."
          action={
            <Button type="button" variant="secondary" onClick={() => setFilter(ALL)}>
              Показать все
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visibleWorks.map((item) => {
            const c = constellationOf(item.starId);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(item.id)}
                  className="group glass flex h-full w-full flex-col overflow-hidden rounded-2xl text-left transition hover:border-gold-400/40 hover:shadow-glow-soft"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-space-800">
                    <WorkImage src={item.image} alt={`Работа: ${item.title}`} />
                    {item.verifiedByAi && (
                      <span className="absolute right-2 top-2">
                        <Badge tone="green">
                          <Sparkles size={12} aria-hidden="true" />
                          Проверено ИИ
                        </Badge>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <h3 className="line-clamp-2 font-semibold text-white transition group-hover:text-gold-200">
                      {item.title}
                    </h3>
                    {c && (
                      <p className="text-xs text-slate-400">
                        {c.icon ? `${c.icon} ` : ''}
                        {c.name}
                      </p>
                    )}
                    {item.date && <p className="mt-auto pt-1 text-[11px] text-slate-500">{item.date}</p>}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* key завязан на open: модалка получает свежее состояние при каждом открытии. */}
      <UploadModal
        key={uploadOpen ? 'upload-open' : 'upload-closed'}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        constellations={constellations}
        stars={stars}
        onUploaded={refresh}
      />

      {/* key по id работы: состояние подтверждения сбрасывается при смене работы. */}
      <DetailModal
        key={detailId ?? 'detail-none'}
        item={detailItem}
        starName={detailItem ? starName(detailItem.starId) : ''}
        constellation={detailItem ? constellationOf(detailItem.starId) : null}
        onClose={() => setDetailId(null)}
        onDeleted={() => {
          setDetailId(null);
          refresh();
        }}
      />
    </section>
  );
}

/* ---------------------------------------------------------------- WorkImage */

/** Картинка работы с аккуратным запасным вариантом, если файл не загрузился. */
function WorkImage({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-slate-600" aria-hidden="true">
        <ImageOff size={40} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
    />
  );
}

/* --------------------------------------------------------------- UploadModal */

function UploadModal({ open, onClose, constellations, stars, onUploaded }) {
  // Файл и его object URL живут вместе: URL создаётся в обработчике, а не в эффекте.
  const [picked, setPicked] = useState(null); // { file, url } | null
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [starId, setStarId] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef(null);
  const submittingRef = useRef(false);

  const file = picked?.file || null;
  const previewUrl = picked?.url || '';

  // Кнопка отправки сообщает о своих требованиях заранее: нужен файл и название
  // не короче 2 символов. Так пользователь видит условие до клика, а не ошибку
  // после него.
  const canSubmit = Boolean(file) && title.trim().length >= 2;

  // Единственная задача эффекта — отозвать object URL при смене файла/размонтировании.
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const clearFile = useCallback(() => {
    setPicked(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const validateFile = useCallback((f) => {
    if (!f) return 'Прикрепите изображение работы.';
    if (!ALLOWED_MIME.includes(f.type)) return 'Можно загружать только изображения (JPEG, PNG, WEBP, GIF).';
    if (f.size > MAX_BYTES) return 'Файл слишком большой — максимум 5 МБ.';
    return '';
  }, []);

  const acceptFile = useCallback(
    (f) => {
      const err = validateFile(f);
      if (err) {
        setFileError(err);
        clearFile();
        return;
      }
      setFileError('');
      setPicked({ file: f, url: URL.createObjectURL(f) });
    },
    [validateFile, clearFile]
  );

  function onDrop(e) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) acceptFile(dropped);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return;

    setFormError('');
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      return;
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setFormError('Название работы должно быть от 2 до 120 символов.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('title', trimmedTitle);
      fd.append('comment', comment.trim());
      if (starId) fd.append('starId', starId);
      // Content-Type не задаём вручную — axios сам проставит boundary.
      await api.post('/portfolio', fd);
      await onUploaded();
      onClose();
    } catch (uploadErr) {
      setFormError(errorMessage(uploadErr, 'Не удалось загрузить работу. Попробуйте ещё раз.'));
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Загрузить работу"
      subtitle="Рисунок, поделка, проект или код — что угодно, чем гордишься"
      footer={
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" form="portfolio-upload-form" loading={submitting} disabled={!canSubmit}>
            <Upload size={18} aria-hidden="true" />
            Загрузить
          </Button>
        </div>
      }
    >
      <form id="portfolio-upload-form" onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && <Alert tone="error">{formError}</Alert>}

        <Field label="Изображение работы" required error={fileError} htmlFor="portfolio-file">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragActive(false);
            }}
            onDrop={onDrop}
            className={cx(
              'relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition',
              dragActive ? 'border-gold-400 bg-gold-400/10' : 'border-white/15 bg-space-800/50'
            )}
          >
            {previewUrl ? (
              <>
                <img
                  src={previewUrl}
                  alt="Предпросмотр выбранной работы"
                  className="max-h-56 w-auto rounded-xl object-contain"
                />
                <div className="flex items-center gap-3">
                  <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
                    Выбрать другой файл
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      clearFile();
                      setFileError('');
                    }}
                    aria-label="Убрать выбранное изображение"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                {file && <p className="text-xs text-slate-500">{file.name}</p>}
              </>
            ) : (
              <>
                <Upload size={32} className="text-gold-400" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-200">Перетащи файл сюда</p>
                  <p className="text-xs text-slate-500">или</p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()}>
                  Выбрать файл
                </Button>
                <p className="text-xs text-slate-500">JPEG, PNG, WEBP или GIF, до 5 МБ</p>
              </>
            )}

            <input
              ref={inputRef}
              id="portfolio-file"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) acceptFile(picked);
              }}
            />
          </div>
        </Field>

        <Field label="Название работы" required htmlFor="portfolio-title">
          <Input
            id="portfolio-title"
            type="text"
            value={title}
            maxLength={120}
            placeholder="Например: «Космический пейзаж»"
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </Field>

        <Field label="Компетенция" hint="К какому навыку относится работа" htmlFor="portfolio-star">
          <Select id="portfolio-star" value={starId} onChange={(e) => setStarId(e.target.value)}>
            <option value="">Без привязки к навыку</option>
            {constellations.map((c) => {
              const own = stars.filter((s) => s.constellationId === c.id);
              if (own.length === 0) return null;
              return (
                <optgroup key={c.id} label={c.icon ? `${c.icon} ${c.name}` : c.name}>
                  {own.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        </Field>

        <Field label="Комментарий" hint="Что делал, чему научился (необязательно)" htmlFor="portfolio-comment">
          <Textarea
            id="portfolio-comment"
            rows={3}
            maxLength={1000}
            value={comment}
            placeholder="Расскажи о своей работе…"
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

/* --------------------------------------------------------------- DetailModal */

function DetailModal({ item, starName, constellation, onClose, onDeleted }) {
  // Родитель монтирует компонент с key по id работы, поэтому состояние
  // подтверждения удаления начинается чистым при каждой смене работы.
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const deletingRef = useRef(false);

  if (!item) return null;

  async function handleDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/portfolio/${item.id}`);
      onDeleted();
    } catch (err) {
      setDeleteError(errorMessage(err, 'Не удалось удалить работу.'));
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <Modal
      open={Boolean(item)}
      onClose={deleting ? undefined : onClose}
      title={item.title}
      subtitle={constellation ? `${constellation.icon ? constellation.icon + ' ' : ''}${constellation.name}` : starName}
      size="lg"
    >
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl bg-space-800">
          <WorkImageLarge src={item.image} alt={`Работа: ${item.title}`} />
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Компетенция</dt>
            <dd className="mt-0.5 font-medium text-slate-100">{starName}</dd>
          </div>
          {item.date && (
            <div>
              <dt className="text-slate-500">Дата загрузки</dt>
              <dd className="mt-0.5 font-medium text-slate-100">{item.date}</dd>
            </div>
          )}
        </dl>

        {item.comment && (
          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-slate-300">Комментарий</h3>
            <p className="rounded-xl bg-space-800/60 px-4 py-3 text-sm text-slate-200">{item.comment}</p>
          </div>
        )}

        {item.aiFeedback && (
          <div className="rounded-2xl border border-gold-400/25 bg-gold-400/5 p-4">
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-gold-200">
              <Sparkles size={16} aria-hidden="true" />
              Отзыв ИИ-наставника
            </h3>
            <p className="text-sm leading-relaxed text-slate-200">{item.aiFeedback}</p>
          </div>
        )}

        {deleteError && <Alert tone="error">{deleteError}</Alert>}

        <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          {confirming ? (
            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-rose-200">Удалить эту работу навсегда?</p>
              <div className="flex gap-3">
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                  Отмена
                </Button>
                <Button type="button" variant="danger" onClick={handleDelete} loading={deleting}>
                  <Trash2 size={16} aria-hidden="true" />
                  Удалить
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={onClose}>
                Закрыть
              </Button>
              <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Удалить работу
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function WorkImageLarge({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex aspect-video w-full items-center justify-center text-slate-600" aria-hidden="true">
        <ImageOff size={48} />
      </div>
    );
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className="max-h-[60vh] w-full object-contain" />;
}
