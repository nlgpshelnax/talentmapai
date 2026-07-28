import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../lib/api';
import { Button, Field, Input, Alert, cx } from '../components/ui';

const DEMO_EMAIL = 'demo@talentmap.ai';
const DEMO_PASSWORD = 'demo123';
const ADMIN_EMAIL = 'admin@talentmap.ai';
const ADMIN_PASSWORD = 'admin12345';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from?.pathname;

  async function signIn(emailValue, passwordValue) {
    if (submitting) return;
    if (!emailValue.trim() || !passwordValue) {
      setError('Введите почту и пароль.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.post('/auth/login', {
        email: emailValue.trim(),
        password: passwordValue,
      });
      const { token, user } = res.data;
      login(token, user);
      const target = from || (user?.onboarded ? '/app' : '/onboarding');
      navigate(target, { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Не удалось войти. Проверьте данные и попробуйте ещё раз.'));
      setSubmitting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    signIn(email, password);
  }

  function handleDemo() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    signIn(DEMO_EMAIL, DEMO_PASSWORD);
  }

  function handleAdmin() {
    setEmail(ADMIN_EMAIL);
    setPassword(ADMIN_PASSWORD);
    signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
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
          <h1 className="mt-6 text-3xl font-extrabold text-white">С возвращением!</h1>
          <p className="mt-2 text-sm text-slate-400">
            Войдите, чтобы продолжить путешествие по карте таланта.
          </p>
        </div>

        <section className="glass-strong rounded-3xl p-6 sm:p-8" aria-label="Форма входа">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {error && <Alert tone="error">{error}</Alert>}

            <Field label="Электронная почта" htmlFor="login-email" required>
              <Input
                id="login-email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                required
              />
            </Field>

            <Field label="Пароль" htmlFor="login-password" required>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Ваш пароль"
                  className="pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
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
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              <LogIn size={18} aria-hidden="true" />
              Войти
            </Button>
          </form>

          <div
            className="mt-6 rounded-2xl border border-gold-400/20 bg-gold-400/5 p-4"
            aria-label="Демо-доступ"
          >
            <p className="text-sm font-semibold text-gold-300">Демо-доступ</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Хотите осмотреться без регистрации? Готовые аккаунты&nbsp;— ребёнок
              <span className="whitespace-nowrap"> {DEMO_EMAIL}</span> /{' '}
              <span className="whitespace-nowrap">{DEMO_PASSWORD}</span>.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDemo}
              disabled={submitting}
              className={cx('mt-3 w-full', submitting && 'pointer-events-none')}
            >
              <Sparkles size={16} aria-hidden="true" />
              Войти как ребёнок
            </Button>

            {/* Без этой кнопки в админ-панель было не попасть: аккаунт нигде
                не упоминался, а ссылка на неё пряталась в безымянной иконке. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAdmin}
              disabled={submitting}
              className={cx('mt-2 w-full', submitting && 'pointer-events-none')}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Войти как администратор
            </Button>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Аккаунт администратора — {ADMIN_EMAIL} / {ADMIN_PASSWORD}. После входа в меню появится пункт
              «Админ-панель».
            </p>
          </div>
        </section>

        <div className="mt-6 flex flex-col items-center gap-3 text-sm">
          <p className="text-slate-400">
            Ещё нет аккаунта?{' '}
            <Link to="/register" className="font-semibold text-gold-300 transition hover:text-gold-200">
              Создать карту таланта
            </Link>
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-slate-500 transition hover:text-slate-300"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            На главную
          </Link>
        </div>
      </div>
    </main>
  );
}
