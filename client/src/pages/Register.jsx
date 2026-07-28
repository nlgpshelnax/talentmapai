import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Sparkles, UserPlus } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import api, { errorMessage } from '../lib/api';
import { Alert, Button, Field, Input, cx } from '../components/ui';

/**
 * Registration asks the bare minimum: name, email, password.
 *
 * It deliberately does NOT ask for role, age or city. Those belong further
 * down the funnel — the role is chosen on the onboarding screen (ТЗ 3.1), and
 * age and city are two of the twelve diagnostic questions (ТЗ 3.2). Collecting
 * them here as well meant the app asked the same three things twice, which is
 * exactly the kind of friction that makes people abandon a sign-up.
 */

const MIN_PASSWORD = 8;

/** Live password strength: 1 weak, 2 fair, 3 strong. */
function passwordStrength(value) {
  if (!value) return { score: 0, label: '', tone: '' };
  if (value.length < MIN_PASSWORD) return { score: 1, label: 'Слишком короткий', tone: 'weak' };

  let score = 1;
  if (value.length >= 12) score += 1;
  if (/[^A-Za-zА-Яа-яЁё0-9]/.test(value) || (/[A-Za-zА-Яа-яЁё]/.test(value) && /\d/.test(value))) score += 1;

  if (score === 1) return { score: 1, label: 'Простой', tone: 'weak' };
  if (score === 2) return { score: 2, label: 'Неплохой', tone: 'mid' };
  return { score: 3, label: 'Надёжный', tone: 'strong' };
}

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState({});

  const strength = useMemo(() => passwordStrength(password), [password]);

  function validate() {
    const next = {};
    if (name.trim().length < 2) next.name = 'Имя должно быть не короче 2 символов.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Проверьте адрес почты.';
    if (password.length < MIN_PASSWORD) next.password = `Пароль должен быть не короче ${MIN_PASSWORD} символов.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting || !validate()) return;

    setSubmitting(true);
    setFormError('');
    try {
      const res = await api.post('/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password,
      });
      login(res.data.token, res.data.user);
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Не удалось создать аккаунт. Попробуйте ещё раз.'));
      setSubmitting(false);
    }
  }

  const strengthColour = { weak: 'bg-rose-500', mid: 'bg-gold-400', strong: 'bg-emerald-500' }[strength.tone];

  return (
    <main className="space-gradient flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 font-display text-xl font-extrabold text-white transition hover:text-gold-300"
          >
            <Sparkles size={22} className="text-gold-400" aria-hidden="true" />
            TalentMap&nbsp;AI
          </Link>
          <h1 className="mt-6 text-3xl font-extrabold text-white">Создайте карту таланта</h1>
          <p className="mt-2 text-sm text-slate-400">
            Три поля — и переходим к диагностике. Она займёт около трёх минут.
          </p>
        </div>

        <section className="glass-strong rounded-3xl p-6 sm:p-8" aria-label="Форма регистрации">
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {formError && <Alert tone="error">{formError}</Alert>}

            <Field label="Имя" htmlFor="reg-name" required error={errors.name}>
              <Input
                id="reg-name"
                name="name"
                autoComplete="name"
                placeholder="Как к вам обращаться"
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

            <Field
              label="Пароль"
              htmlFor="reg-password"
              required
              error={errors.password}
              hint={`Минимум ${MIN_PASSWORD} символов`}
            >
              <div className="relative">
                <Input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  placeholder="Придумайте пароль"
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

              {password && (
                <div id="reg-password-strength" className="mt-2 flex items-center gap-2">
                  <div className="flex flex-1 gap-1" aria-hidden="true">
                    {[1, 2, 3].map((level) => (
                      <span
                        key={level}
                        className={cx(
                          'h-1 flex-1 rounded-full transition-colors',
                          strength.score >= level ? strengthColour : 'bg-white/12'
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">{strength.label}</span>
                </div>
              )}
            </Field>

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              <UserPlus size={18} aria-hidden="true" />
              Продолжить
            </Button>

            <p className="text-center text-xs text-slate-500">
              О возрасте, городе и интересах спросим на следующем шаге — там это нужно для подбора направлений.
            </p>
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
