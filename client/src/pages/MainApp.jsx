import { lazy, Suspense, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  LogOut,
  Image as ImageIcon,
  Settings as SettingsIcon,
  Share2,
  Shield,
  ShoppingBag,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useAppState } from '../context/AppStateContext';
import Avatar, { UserName } from '../components/Avatar';
import AITutor from '../components/AITutor';
import ShareModal from '../components/ShareModal';
import { Alert, Spinner, cx } from '../components/ui';

import MapPage from './Map';

const Portfolio = lazy(() => import('./Portfolio'));
const Profile = lazy(() => import('./Profile'));
const Settings = lazy(() => import('./Settings'));
const Store = lazy(() => import('./Store'));
const ParentDashboard = lazy(() => import('./ParentDashboard'));

const TABS = [
  { to: '/app', end: true, label: 'Карта', icon: LayoutGrid },
  { to: '/app/portfolio', label: 'Портфолио', icon: ImageIcon },
  { to: '/app/store', label: 'Магазин', icon: ShoppingBag },
  { to: '/app/parent', label: 'Родителям', icon: Shield },
  { to: '/app/profile', label: 'Профиль', icon: UserIcon },
];

export default function MainApp() {
  const { user, logout } = useAuth();
  const { state, loading, error } = useAppState();
  const navigate = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);

  const progress = useMemo(() => {
    if (!state) return { done: 0, total: 0, percent: 0 };
    const recommended = state.user?.recommendedGraphs ?? [];
    const scope = recommended.length ? new Set(recommended) : null;
    const stars = scope ? state.stars.filter((s) => scope.has(s.constellationId)) : state.stars;
    const completed = new Set((state.completedStars || []).map(Number));
    const done = stars.filter((s) => completed.has(s.id)).length;
    return { done, total: stars.length, percent: stars.length ? Math.round((done / stars.length) * 100) : 0 };
  }, [state]);

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col">
      {/* ------------------------------------------------------------ header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-space-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-3 sm:px-6">
          <NavLink to="/app" className="flex shrink-0 items-center gap-2" aria-label="TalentMap AI, на карту">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-600">
              <Sparkles size={18} className="text-space-950" aria-hidden="true" />
            </span>
            <span className="hidden font-display text-lg font-extrabold text-white sm:block">TalentMap</span>
          </NavLink>

          {/* Приветствие и прогресс */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-slate-400 sm:text-sm">
              Привет, <UserName user={user} className="font-semibold text-slate-200" />!
            </p>
            <div className="mt-1 flex items-center gap-2">
              <div
                className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Общий прогресс"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-500 transition-[width] duration-700"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <span className="shrink-0 text-xs font-bold text-gold-300">{progress.percent}%</span>
            </div>
          </div>

          {/* Действия */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <span
              className="hidden items-center gap-1.5 rounded-full bg-gold-400/12 px-3 py-1.5 text-sm font-bold text-gold-300 sm:flex"
              title="Опыт за пройденные навыки"
            >
              ⭐ {user?.xp ?? 0}
            </span>

            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="Поделиться прогрессом"
              className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Share2 size={19} aria-hidden="true" />
            </button>

            <NavLink
              to="/app/settings"
              aria-label="Настройки"
              className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <SettingsIcon size={19} aria-hidden="true" />
            </NavLink>

            {user?.isAdmin && (
              <NavLink
                to="/admin"
                aria-label="Админ-панель"
                className="rounded-xl p-2 text-nebula-400 transition hover:bg-white/10 hover:text-white"
              >
                <Shield size={19} aria-hidden="true" />
              </NavLink>
            )}

            <button
              type="button"
              onClick={handleLogout}
              aria-label="Выйти из аккаунта"
              className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-rose-300"
            >
              <LogOut size={19} aria-hidden="true" />
            </button>

            <Avatar user={user} size="sm" className="ml-1 hidden sm:grid" />
          </div>
        </div>

        {/* Навигация — десктоп */}
        <nav aria-label="Основная навигация" className="mx-auto hidden max-w-7xl gap-1 px-6 pb-2 md:flex">
          {TABS.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
                  isActive ? 'bg-white/10 text-gold-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                )
              }
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* -------------------------------------------------------------- main */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 pb-28 sm:px-6 md:pb-10">
        {error && !state && <Alert tone="error" className="mb-4">{error}</Alert>}
        {loading && !state ? (
          <Spinner label="Загружаем вашу карту…" />
        ) : (
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route index element={<MapPage />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="store" element={<Store />} />
              <Route path="parent" element={<ParentDashboard />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </Suspense>
        )}
      </main>

      {/* Навигация — мобильная */}
      <nav
        aria-label="Основная навигация"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-space-950/95 backdrop-blur-xl md:hidden"
      >
        <div className="flex items-stretch justify-around px-1 pt-1">
          {TABS.map(({ to, end, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-semibold transition',
                  isActive ? 'text-gold-300' : 'text-slate-500'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gold-400" />}
                  <Icon size={20} aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <AITutor />

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        user={user}
        done={progress.done}
        total={progress.total}
        percent={progress.percent}
      />
    </div>
  );
}
