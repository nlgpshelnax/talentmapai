import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, Database, AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { Button, Field, Input, Alert, Spinner, Badge, cx } from '../ui';

/**
 * Резервные копии.
 *
 * Восстановление после сбоя важнее любой другой меры: от взлома страдает
 * репутация, от потери базы — весь продукт. Раньше сделать копию можно было
 * только через консоль сервера, то есть владелец без доступа к ней не мог
 * сохранить свою работу вообще.
 */

const LABELS = {
  constellations: 'Направления',
  stars: 'Навыки',
  edges: 'Связи между навыками',
  resources: 'Материалы к навыкам',
  venues: 'Очные площадки',
  venueCities: 'Городов с площадками',
  storeItems: 'Товары магазина',
  cities: 'Справочник городов',
  users: 'Пользователи',
  works: 'Работы в портфолио',
  completions: 'Отметок о выполнении',
};

/** Что относится к содержимому, а что к людям — разделение важно для копий. */
const CONTENT_KEYS = ['constellations', 'stars', 'edges', 'resources', 'venues', 'storeItems', 'cities'];
const PEOPLE_KEYS = ['users', 'works', 'completions'];

export default function BackupPanel() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);

  const [file, setFile] = useState(null);
  const [confirmWord, setConfirmWord] = useState('');
  const fileRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (signal) => {
    try {
      setError('');
      const res = await api.get('/admin/backup/summary', signal ? { signal } : undefined);
      if (mounted.current) setSummary(res.data);
    } catch (err) {
      if (mounted.current && err?.code !== 'ERR_CANCELED') {
        setError(errorMessage(err, 'Не удалось получить сводку по базе.'));
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Вызов в микротаске: в синхронном теле эффекта состояние не меняется.
    Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  /**
   * Скачивание идёт через blob, а не простой ссылкой: запрос требует заголовка
   * авторизации, а обычный переход по ссылке его не несёт.
   */
  async function download(includeUsers) {
    setBusy(includeUsers ? 'full' : 'content');
    setNotice(null);
    try {
      const res = await api.get('/admin/backup/export', {
        params: { includeUsers: String(includeUsers) },
        responseType: 'blob',
      });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const name = `talentmap-${includeUsers ? 'полная' : 'содержимое'}-${stamp}.json`;

      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setNotice({ tone: 'success', text: `Файл «${name}» сохранён.` });
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err, 'Не удалось выгрузить копию.') });
    } finally {
      if (mounted.current) setBusy('');
    }
  }

  async function restore(event) {
    event.preventDefault();
    if (!file) return;

    setBusy('import');
    setNotice(null);
    try {
      const text = await file.text();
      let dump;
      try {
        dump = JSON.parse(text);
      } catch {
        throw new Error('Файл не читается как JSON. Возможно, выбран не тот файл.');
      }

      const res = await api.post('/admin/backup/import', { confirm: confirmWord, dump });
      const restored = Object.entries(res.data.restored || {})
        .map(([k, n]) => `${LABELS[k] || k}: ${n}`)
        .join(' · ');

      setNotice({ tone: 'success', text: `Содержимое восстановлено. ${restored}` });
      setFile(null);
      setConfirmWord('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err) {
      setNotice({ tone: 'error', text: err?.response ? errorMessage(err, 'Не удалось восстановить.') : err.message });
    } finally {
      if (mounted.current) setBusy('');
    }
  }

  if (loading) return <Spinner label="Читаем состояние базы…" />;

  const canRestore = file && confirmWord === 'ВОССТАНОВИТЬ' && busy !== 'import';

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone={notice.tone === 'success' ? 'success' : 'error'}>{notice.text}</Alert>}

      {/* Что сейчас в базе */}
      <section className="glass rounded-2xl p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Database size={20} className="text-gold-400" aria-hidden="true" />
            Что сейчас в базе
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => load()}>
            <RefreshCw size={15} aria-hidden="true" />
            Обновить
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CONTENT_KEYS.map((key) => (
            <div key={key} className="rounded-xl bg-space-800/60 p-4">
              <div className="font-display text-2xl font-extrabold text-gold-300 tabular-nums">
                {summary?.[key] ?? 0}
              </div>
              <p className="mt-1 text-xs text-slate-400">{LABELS[key]}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
          {PEOPLE_KEYS.map((key) => (
            <div key={key} className="rounded-xl bg-space-800/40 p-3">
              <div className="font-display text-lg font-bold text-white tabular-nums">{summary?.[key] ?? 0}</div>
              <p className="text-xs text-slate-500">{LABELS[key]}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Выгрузка */}
      <section className="glass rounded-2xl p-6">
        <h2 className="mb-1.5 flex items-center gap-2 text-lg font-bold text-white">
          <Download size={20} className="text-gold-400" aria-hidden="true" />
          Сохранить копию
        </h2>
        <p className="mb-5 max-w-2xl text-sm text-slate-400">
          Делайте копию перед каждым большим изменением и раз в неделю просто так. Файл сохраняется на ваш
          компьютер — храните его отдельно от сервера, иначе от копии не будет толку в тот единственный
          момент, когда она понадобится.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 p-5">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="font-semibold text-white">Только содержимое</h3>
              <Badge tone="green">рекомендуется</Badge>
            </div>
            <p className="mb-4 text-sm text-slate-400">
              Направления, навыки, связи, материалы, площадки, магазин и города. Всё, что вы наполняли
              руками. Персональных данных в файле нет — его можно спокойно хранить и пересылать.
            </p>
            <Button type="button" onClick={() => download(false)} loading={busy === 'content'}>
              <Download size={16} aria-hidden="true" />
              Скачать
            </Button>
          </div>

          <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-5">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="font-semibold text-white">Вместе с людьми</h3>
              <Badge tone="neutral">осторожно</Badge>
            </div>
            <p className="mb-4 text-sm text-slate-400">
              Дополнительно аккаунты, прогресс, работы и история. Это персональные данные детей: файл
              нельзя выкладывать в общие папки и пересылать через мессенджеры.
            </p>
            <p className="mb-4 flex items-start gap-2 text-xs text-slate-500">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Пароли и PIN-коды в файл не попадают никогда — даже в зашифрованном виде.
            </p>
            <Button type="button" variant="secondary" onClick={() => download(true)} loading={busy === 'full'}>
              <Download size={16} aria-hidden="true" />
              Скачать полную
            </Button>
          </div>
        </div>
      </section>

      {/* Восстановление */}
      <section className="glass rounded-2xl border border-rose-400/20 p-6">
        <h2 className="mb-1.5 flex items-center gap-2 text-lg font-bold text-white">
          <Upload size={20} className="text-rose-300" aria-hidden="true" />
          Восстановить из копии
        </h2>

        <div className="mb-5 flex items-start gap-3 rounded-xl bg-rose-400/8 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" aria-hidden="true" />
          <div className="text-sm text-slate-300">
            <p className="font-semibold text-rose-200">Содержимое будет заменено целиком.</p>
            <p className="mt-1 text-slate-400">
              Все направления, навыки, материалы, площадки и товары из базы удаляются и заменяются тем, что
              в файле. Отменить это нельзя. Аккаунты, прогресс и работы не затрагиваются — они остаются
              как есть.
            </p>
            <p className="mt-1.5 text-slate-400">
              Перед восстановлением сохраните текущую копию: если файл окажется не тот, вернуться будет
              не к чему.
            </p>
          </div>
        </div>

        <form onSubmit={restore} className="space-y-4">
          <Field label="Файл копии" htmlFor="backup-file" hint="Файл .json, сохранённый выше">
            <input
              id="backup-file"
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0
                         file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold
                         file:text-white hover:file:bg-white/15"
            />
          </Field>

          <Field
            label="Подтверждение"
            htmlFor="backup-confirm"
            hint="Введите слово ВОССТАНОВИТЬ заглавными буквами — это защита от случайного нажатия"
          >
            <Input
              id="backup-confirm"
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              placeholder="ВОССТАНОВИТЬ"
              autoComplete="off"
              className={cx('max-w-xs', confirmWord && confirmWord !== 'ВОССТАНОВИТЬ' && 'border-rose-400/50')}
            />
          </Field>

          <Button type="submit" variant="danger" disabled={!canRestore} loading={busy === 'import'}>
            <Upload size={16} aria-hidden="true" />
            Восстановить содержимое
          </Button>
        </form>
      </section>
    </div>
  );
}
