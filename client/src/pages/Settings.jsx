import { useCallback, useEffect, useRef, useState } from 'react';
import { UserCog, MapPin, Check, Lock, KeyRound, ShieldCheck, Save, Trash2 } from 'lucide-react';

import { useAppState } from '../context/AppStateContext';
import { useAuth } from '../context/AuthContext';
import api, { errorMessage, setToken } from '../lib/api';
import { Button, Field, Input, Select, Alert, Spinner, cx, inputClass } from '../components/ui';

const WEEKLY_HOURS = ['1-2 часа', '3-5 часов', '6-8 часов', 'больше 8 часов'];

/** Настройки: профиль, смена пароля и родительский PIN — три независимые карточки. */
export default function Settings() {
  const { state, loading, error } = useAppState();

  if (!state) {
    return loading ? <Spinner label="Загружаем настройки…" /> : <Alert tone="error">{error}</Alert>;
  }

  return (
    <section aria-labelledby="settings-heading" className="space-y-6">
      <header>
        <h1 id="settings-heading" className="flex items-center gap-2.5 text-2xl font-extrabold text-white sm:text-3xl">
          <UserCog className="text-gold-400" aria-hidden="true" />
          Настройки
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">Профиль, безопасность и родительский контроль.</p>
      </header>

      <ProfileCard />
      <PasswordCard />
      <PinCard hasPin={Boolean(state.user?.hasPin)} />
    </section>
  );
}

/* -------------------------------------------------------------- ProfileCard */

function ProfileCard() {
  const { state } = useAppState();
  const user = state?.user;

  // Сообщения об успехе/ошибке живут здесь, а не во внутренней форме: форма
  // пересоздаётся по key при изменении данных сервера (в т.ч. после сохранения),
  // поэтому её собственное состояние сбрасывается — а уведомление должно
  // остаться видимым.
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  // key завязан на значимые поля пользователя: начальное состояние формы всегда
  // синхронно с сервером, без эффекта-инициализации (баг устаревших полей).
  const sig = user ? `${user.id}|${user.name}|${user.age}|${user.city}|${user.weeklyHours}` : 'none';

  return (
    <Card
      icon={<UserCog size={20} aria-hidden="true" />}
      title="Профиль"
      description="Основные данные, которые видит приложение."
    >
      {okMsg && (
        <div className="mb-5">
          <Alert tone="success">{okMsg}</Alert>
        </div>
      )}
      {errMsg && (
        <div className="mb-5">
          <Alert tone="error">{errMsg}</Alert>
        </div>
      )}
      <ProfileForm
        key={sig}
        user={user}
        onSaved={() => {
          setErrMsg('');
          setOkMsg('Профиль сохранён.');
        }}
        onError={(msg) => {
          setOkMsg('');
          setErrMsg(msg);
        }}
        onDirty={() => {
          setOkMsg('');
          setErrMsg('');
        }}
      />
    </Card>
  );
}

function ProfileForm({ user, onSaved, onError, onDirty }) {
  const { refresh } = useAppState();
  const { patchUser } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [age, setAge] = useState(user?.age != null ? String(user.age) : '');
  const [city, setCity] = useState(user?.city || '');
  const [weeklyHours, setWeeklyHours] = useState(
    WEEKLY_HOURS.includes(user?.weeklyHours) ? user.weeklyHours : WEEKLY_HOURS[1]
  );

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // City autocomplete
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const cityBoxRef = useRef(null);
  const suppressFetch = useRef(false);

  // Дебаунс-автокомплит городов. Все setState происходят только внутри
  // асинхронного колбэка таймера — в теле эффекта состояние не меняется.
  useEffect(() => {
    const query = city.trim();
    if (suppressFetch.current) {
      suppressFetch.current = false;
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (query.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      api
        .get('/diagnostics/cities', { params: { q: query }, signal: controller.signal })
        .then((res) => {
          if (cancelled) return;
          const list = Array.isArray(res.data?.cities) ? res.data.cities : [];
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [city]);

  useEffect(() => {
    function onDocClick(e) {
      if (cityBoxRef.current && !cityBoxRef.current.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pickCity = useCallback((value) => {
    suppressFetch.current = true;
    setCity(value);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  }, []);

  function onCityKeyDown(e) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pickCity(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (savingRef.current) return;
    onDirty();

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      onError('Имя должно быть не короче 2 символов.');
      return;
    }
    const trimmedCity = city.trim();
    let ageNum;
    if (age !== '') {
      ageNum = Number(age);
      if (!Number.isInteger(ageNum) || ageNum < 3 || ageNum > 18) {
        onError('Возраст должен быть от 3 до 18 лет.');
        return;
      }
    }

    // Отправляем только заполненные поля; идентичность сервер берёт из токена.
    const body = { name: trimmedName, weeklyHours };
    if (ageNum !== undefined) body.age = ageNum;
    if (trimmedCity) body.city = trimmedCity;

    savingRef.current = true;
    setSaving(true);
    try {
      const res = await api.patch('/users/profile', body);
      // Успех: patchUser + refresh обновят state.user → родитель сменит key и
      // пересоздаст форму со свежими значениями. Сообщение живёт у родителя.
      if (res.data?.user) patchUser(res.data.user);
      onSaved();
      await refresh();
    } catch (err) {
      onError(errorMessage(err, 'Не удалось сохранить профиль.'));
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field label="Имя" htmlFor="set-name" required>
          <Input
            id="set-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              onDirty();
              setName(e.target.value);
            }}
            disabled={saving}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Возраст" htmlFor="set-age" hint="От 3 до 18 лет">
            <Input
              id="set-age"
              type="number"
              min={3}
              max={18}
              inputMode="numeric"
              value={age}
              onChange={(e) => {
                onDirty();
                setAge(e.target.value);
              }}
              disabled={saving}
            />
          </Field>

          <Field label="Город" htmlFor="set-city">
            <div className="relative" ref={cityBoxRef}>
              <div className="relative">
                <MapPin
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  id="set-city"
                  type="text"
                  autoComplete="address-level2"
                  placeholder="Начните вводить…"
                  className={cx(inputClass, 'pl-9')}
                  value={city}
                  onChange={(e) => {
                    onDirty();
                    setCity(e.target.value);
                  }}
                  onKeyDown={onCityKeyDown}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  disabled={saving}
                  role="combobox"
                  aria-expanded={showSuggestions}
                  aria-controls="set-city-list"
                  aria-autocomplete="list"
                  aria-activedescendant={activeIndex >= 0 ? `set-city-option-${activeIndex}` : undefined}
                />
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <ul
                  id="set-city-list"
                  role="listbox"
                  aria-label="Города"
                  className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-white/12 bg-space-800 py-1 shadow-xl shadow-black/50"
                >
                  {suggestions.map((item, i) => (
                    <li
                      key={item}
                      id={`set-city-option-${i}`}
                      role="option"
                      aria-selected={i === activeIndex}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickCity(item);
                      }}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cx(
                        'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition',
                        i === activeIndex ? 'bg-gold-400/15 text-gold-200' : 'text-slate-200 hover:bg-white/5'
                      )}
                    >
                      <MapPin size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
                      <span className="truncate">{item}</span>
                      {i === activeIndex && (
                        <Check size={14} aria-hidden="true" className="ml-auto shrink-0 text-gold-300" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        </div>

        <Field label="Время на занятия в неделю" htmlFor="set-hours">
          <Select
            id="set-hours"
            value={weeklyHours}
            onChange={(e) => {
              onDirty();
              setWeeklyHours(e.target.value);
            }}
            disabled={saving}
          >
            {WEEKLY_HOURS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            <Save size={18} aria-hidden="true" />
            Сохранить
          </Button>
        </div>
    </form>
  );
}

/* ------------------------------------------------------------- PasswordCard */

function PasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const savingRef = useRef(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (savingRef.current) return;
    setOkMsg('');
    setErrMsg('');

    if (next.length < 8) {
      setErrMsg('Новый пароль должен быть не короче 8 символов.');
      return;
    }
    if (next !== repeat) {
      setErrMsg('Пароли не совпадают.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      // Сервер выдаёт свежий токен после смены пароля — сохраняем его.
      if (res.data?.token) setToken(res.data.token);
      setOkMsg('Пароль изменён.');
      setCurrent('');
      setNext('');
      setRepeat('');
    } catch (err) {
      setErrMsg(errorMessage(err, 'Не удалось изменить пароль.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Card icon={<Lock size={20} aria-hidden="true" />} title="Смена пароля" description="Обнови пароль для входа в аккаунт.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {okMsg && <Alert tone="success">{okMsg}</Alert>}
        {errMsg && <Alert tone="error">{errMsg}</Alert>}

        <Field label="Текущий пароль" htmlFor="pw-current" required>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={saving}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Новый пароль" htmlFor="pw-new" hint="Минимум 8 символов" required>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={saving}
              required
            />
          </Field>

          <Field
            label="Повтор пароля"
            htmlFor="pw-repeat"
            required
            error={repeat.length > 0 && next !== repeat ? 'Пароли не совпадают' : undefined}
          >
            <Input
              id="pw-repeat"
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              disabled={saving}
              aria-invalid={repeat.length > 0 && next !== repeat}
              required
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            <KeyRound size={18} aria-hidden="true" />
            Сменить пароль
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ PinCard */

function PinCard({ hasPin }) {
  const { refresh } = useAppState();

  const [mode, setMode] = useState(null); // null | 'set' | 'change'
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const busyRef = useRef(false);

  const editing = mode !== null;

  function startEditing(nextMode) {
    setMode(nextMode);
    setPin('');
    setOkMsg('');
    setErrMsg('');
  }

  function cancelEditing() {
    setMode(null);
    setPin('');
    setErrMsg('');
  }

  async function savePin(e) {
    e.preventDefault();
    if (busyRef.current) return;
    setOkMsg('');
    setErrMsg('');
    if (!/^\d{4}$/.test(pin)) {
      setErrMsg('PIN-код должен состоять из 4 цифр.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await api.post('/users/pin', { pin });
      await refresh();
      setMode(null);
      setPin('');
      setOkMsg('PIN-код сохранён.');
    } catch (err) {
      setErrMsg(errorMessage(err, 'Не удалось сохранить PIN-код.'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function removePin() {
    if (busyRef.current) return;
    setOkMsg('');
    setErrMsg('');
    busyRef.current = true;
    setBusy(true);
    try {
      await api.delete('/users/pin');
      await refresh();
      setOkMsg('PIN-код удалён.');
    } catch (err) {
      setErrMsg(errorMessage(err, 'Не удалось удалить PIN-код.'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Card
      icon={<ShieldCheck size={20} aria-hidden="true" />}
      title="Родительский PIN"
      description="PIN защищает раздел с аналитикой для родителей от ребёнка."
    >
      <div className="space-y-5">
        {okMsg && <Alert tone="success">{okMsg}</Alert>}
        {errMsg && <Alert tone="error">{errMsg}</Alert>}

        {!editing ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-300">
              {hasPin ? 'PIN-код установлен.' : 'PIN-код ещё не установлен.'}
            </p>
            <div className="flex gap-3">
              {hasPin ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => startEditing('change')} disabled={busy}>
                    Изменить PIN
                  </Button>
                  <Button type="button" variant="danger" onClick={removePin} loading={busy}>
                    <Trash2 size={16} aria-hidden="true" />
                    Удалить PIN
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={() => startEditing('set')} disabled={busy}>
                  <ShieldCheck size={18} aria-hidden="true" />
                  Установить PIN
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={savePin} noValidate className="space-y-4">
            <Field label={mode === 'change' ? 'Новый PIN-код' : 'PIN-код'} htmlFor="pin-input" hint="4 цифры" required>
              <Input
                id="pin-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                pattern="\d{4}"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={busy}
                className="max-w-[10rem] tracking-[0.5em]"
                data-autofocus
                required
              />
            </Field>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={cancelEditing} disabled={busy}>
                Отмена
              </Button>
              <Button type="submit" loading={busy}>
                <Save size={18} aria-hidden="true" />
                Сохранить
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------- Card */

function Card({ icon, title, description, children }) {
  return (
    <div className="glass rounded-3xl p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-xl bg-gold-400/15 p-2.5 text-gold-300">{icon}</div>
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-400">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
