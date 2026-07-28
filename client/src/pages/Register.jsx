import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, ArrowLeft, Users, User, MapPin, Check } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../lib/api';
import { Button, Field, Input, Alert, cx, inputClass } from '../components/ui';

const ROLES = [
  { value: 'parent', label: 'Родитель', hint: 'ребёнку 6–14', Icon: Users },
  { value: 'child', label: 'Подросток', hint: '12–18 лет', Icon: User },
];

/** Live password strength: 0 too short, 1 ok, 2 good, 3 strong. */
function passwordScore(pw) {
  if (pw.length < 8) return 0;
  let score = 1;
  if (pw.length >= 12) score += 1;
  if (/[a-zа-яё]/i.test(pw) && /\d/.test(pw)) score += 1;
  return Math.min(score, 3);
}

const STRENGTH = [
  { label: 'Минимум 8 символов', tone: 'text-slate-500', bar: 'bg-slate-600' },
  { label: 'Нормальный пароль', tone: 'text-gold-300', bar: 'bg-gold-500' },
  { label: 'Хороший пароль', tone: 'text-gold-300', bar: 'bg-gold-400' },
  { label: 'Надёжный пароль', tone: 'text-emerald-300', bar: 'bg-emerald-400' },
];

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('parent');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // --- City autocomplete state ---
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const cityBoxRef = useRef(null);
  const suppressFetch = useRef(false);

  const score = passwordScore(password);

  // Debounced, cleanup-guarded city lookup. All state updates happen inside the
  // async timer callback — never synchronously in the effect body — so React
  // doesn't warn about cascading renders.
  useEffect(() => {
    const query = city.trim();
    let cancelled = false;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      // A suggestion was just chosen — swallow this one lookup, keep the list closed.
      if (suppressFetch.current) {
        suppressFetch.current = false;
        return;
      }
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

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e) {
      if (cityBoxRef.current && !cityBoxRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pickCity(value) {
    suppressFetch.current = true;
    setCity(value);
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
  }

  function onCityKeyDown(e) {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        pickCity(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  }

  function validate() {
    const next = {};
    if (name.trim().length < 2) next.name = 'Имя должно содержать минимум 2 символа.';
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Введите корректный адрес почты.';
    if (password.length < 8) next.password = 'Пароль должен содержать минимум 8 символов.';
    if (age !== '') {
      const n = Number(age);
      if (!Number.isInteger(n) || n < 3 || n > 18) {
        next.age = 'Возраст должен быть от 3 до 18 лет.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setFormError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      };
      if (age !== '') payload.age = Number(age);
      if (city.trim()) payload.city = city.trim();

      const res = await api.post('/auth/register', payload);
      const { token, user } = res.data;
      login(token, user);
      navigate(user?.onboarded ? '/app' : '/onboarding', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Не удалось создать аккаунт. Попробуйте ещё раз.'));
      setSubmitting(false);
    }
  }

  return (
    <main className="space-gradient flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xl font-display font-extrabold text-white transition hover:text-gold-300"
          >
            <Sparkles size={22} className="text-gold-400" aria-hidden="true" />
            TalentMap&nbsp;AI
          </Link>
          <h1 className="mt-6 text-3xl font-extrabold text-white text-balance">
            Постройте карту таланта
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Регистрация займёт минуту&nbsp;— и можно начинать диагностику.
          </p>
        </div>

        <section className="glass-strong rounded-3xl p-6 sm:p-8" aria-label="Форма регистрации">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {formError && <Alert tone="error">{formError}</Alert>}

            <Field label="Имя" htmlFor="reg-name" required error={errors.name}>
              <Input
                id="reg-name"
                type="text"
                name="name"
                autoComplete="name"
                placeholder="Как вас зовут?"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                aria-invalid={Boolean(errors.name)}
                required
              />
            </Field>

            <Field label="Электронная почта" htmlFor="reg-email" required error={errors.email}>
              <Input
                id="reg-email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                aria-invalid={Boolean(errors.email)}
                required
              />
            </Field>

            <Field label="Пароль" htmlFor="reg-password" required error={errors.password}>
              <div className="relative">
                <Input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  placeholder="Минимум 8 символов"
                  className="pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby="reg-password-strength"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-gold-300"
                >
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              {password.length > 0 && (
                <div id="reg-password-strength" className="mt-2">
                  <div className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={cx(
                          'h-1 flex-1 rounded-full transition-colors',
                          i < score ? STRENGTH[score].bar : 'bg-white/10'
                        )}
                      />
                    ))}
                  </div>
                  <p className={cx('mt-1.5 text-xs', STRENGTH[score].tone)}>{STRENGTH[score].label}</p>
                </div>
              )}
            </Field>

            <Field label="Кто вы?" required>
              <div
                role="radiogroup"
                aria-label="Роль"
                className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-space-800/50 p-1.5"
              >
                {ROLES.map(({ value, label, hint, Icon }) => {
                  const selected = role === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setRole(value)}
                      disabled={submitting}
                      className={cx(
                        'flex flex-col items-center gap-1 rounded-xl px-3 py-3 text-center transition',
                        selected
                          ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-space-950 shadow-lg shadow-gold-500/25'
                          : 'text-slate-300 hover:bg-white/5'
                      )}
                    >
                      <Icon size={20} aria-hidden="true" />
                      <span className="text-sm font-semibold">{label}</span>
                      <span className={cx('text-[11px]', selected ? 'text-space-900/80' : 'text-slate-500')}>
                        {hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Возраст" htmlFor="reg-age" hint="Необязательно" error={errors.age}>
                <Input
                  id="reg-age"
                  type="number"
                  name="age"
                  min={3}
                  max={18}
                  inputMode="numeric"
                  placeholder="напр. 12"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.age)}
                />
              </Field>

              <Field label="Город" htmlFor="reg-city" hint="Необязательно">
                <div className="relative" ref={cityBoxRef}>
                  <div className="relative">
                    <MapPin
                      size={16}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      id="reg-city"
                      type="text"
                      name="city"
                      autoComplete="address-level2"
                      placeholder="Начните вводить…"
                      className={cx(inputClass, 'pl-9')}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      onKeyDown={onCityKeyDown}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      disabled={submitting}
                      role="combobox"
                      aria-expanded={showSuggestions}
                      aria-controls="reg-city-list"
                      aria-autocomplete="list"
                      aria-activedescendant={
                        activeIndex >= 0 ? `reg-city-option-${activeIndex}` : undefined
                      }
                    />
                  </div>
                  {showSuggestions && suggestions.length > 0 && (
                    <ul
                      id="reg-city-list"
                      role="listbox"
                      aria-label="Города"
                      className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-white/12 bg-space-800 py-1 shadow-xl shadow-black/50"
                    >
                      {suggestions.map((item, i) => (
                        <li
                          key={item}
                          id={`reg-city-option-${i}`}
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

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              <Sparkles size={18} aria-hidden="true" />
              Создать карту таланта
            </Button>
          </form>
        </section>

        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <p className="text-slate-400">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="font-semibold text-gold-300 transition hover:text-gold-200">
              Войти
            </Link>
          </p>
          <Link to="/" className="inline-flex items-center gap-1.5 text-slate-500 transition hover:text-slate-300">
            <ArrowLeft size={15} aria-hidden="true" />
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
