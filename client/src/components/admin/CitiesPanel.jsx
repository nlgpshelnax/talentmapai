import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { Alert, Button, EmptyState, Field, Input, Modal, Spinner } from '../ui';

/**
 * City registry (TZ 3.7: «Список городов — добавить/удалить»).
 *
 * The list drives the onboarding autocomplete and the city field on offline
 * resources. Removing a city only takes it out of the suggestions — existing
 * workshops keep their value, so a deletion can never orphan content.
 */
export default function CitiesPanel() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (signal) => {
    try {
      const res = await api.get('/admin/cities', { signal });
      if (!mounted.current) return;
      setCities(res.data.cities || []);
      setError(null);
    } catch (err) {
      if (err.name === 'CanceledError' || !mounted.current) return;
      setError(errorMessage(err, 'Не удалось загрузить список городов'));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load]);

  const add = async (event) => {
    event.preventDefault();
    const value = name.trim();
    if (value.length < 2) {
      setError('Название города должно быть не короче 2 символов');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/admin/cities', { name: value });
      setName('');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось добавить город'));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setSaving(true);
    try {
      await api.delete(`/admin/cities/${confirm.id}`);
      setConfirm(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Не удалось удалить город'));
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <section aria-labelledby="cities-heading" className="space-y-5">
      <div className="flex flex-col gap-1">
        <h2 id="cities-heading" className="flex items-center gap-2 text-xl font-bold text-white">
          <MapPin className="text-gold-400" size={20} aria-hidden="true" />
          Города
        </h2>
        <p className="text-sm text-slate-400">
          Список подсказывается при регистрации и диагностике, а также используется в офлайн-ресурсах.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <form onSubmit={add} className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Новый город" htmlFor="new-city">
            <Input
              id="new-city"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Владимир"
              maxLength={80}
            />
          </Field>
        </div>
        <Button type="submit" loading={saving} className="shrink-0">
          <Plus size={16} aria-hidden="true" />
          Добавить
        </Button>
      </form>

      {loading ? (
        <Spinner label="Загружаем города…" />
      ) : cities.length === 0 ? (
        <EmptyState icon="🗺️" title="Список пуст" description="Добавьте первый город — он появится в подсказках." />
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <ul className="divide-y divide-white/8">
            {cities.map((city) => (
              <li key={city.id} className="flex items-center gap-3 px-4 py-3">
                <MapPin size={15} className="shrink-0 text-slate-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-100">{city.name}</span>
                <span className="hidden shrink-0 text-xs text-slate-500 sm:block">
                  ресурсов: {city.resources} · пользователей: {city.users}
                </span>
                <button
                  type="button"
                  onClick={() => setConfirm(city)}
                  aria-label={`Удалить город ${city.name}`}
                  className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="Удалить город?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Отмена
            </Button>
            <Button variant="danger" loading={saving} onClick={remove} data-autofocus>
              Удалить
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-300">
          Город «{confirm?.name}» исчезнет из подсказок. Уже добавленные мастер-классы и профили пользователей
          сохранят своё значение.
        </p>
      </Modal>
    </section>
  );
}
