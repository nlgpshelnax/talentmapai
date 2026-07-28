import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { AppStateProvider } from './context/AppStateContext';
import { Spinner } from './components/ui';
import DemoBanner from './components/DemoBanner';

import PublicLanding from './pages/PublicLanding';
import Login from './pages/Login';
import Register from './pages/Register';

// Split the authenticated area out of the landing bundle — a first-time
// visitor should not download the admin graph editor to read the pitch.
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Diagnostics = lazy(() => import('./pages/Diagnostics'));
const MainApp = lazy(() => import('./pages/MainApp'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));

function FullScreenLoader({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label={label} />
    </div>
  );
}

/** Requires a valid session; remembers where the user was headed. */
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader label="Проверяем сессию…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

/**
 * Admin gate.
 *
 * In the prototype /admin was wrapped in a token-only check and reachable by
 * clicking the logo five times — any signed-in child could open the curriculum
 * editor. The flag now comes from the server on every session check, and the
 * API enforces it independently.
 */
function RequireAdmin({ children }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) return <FullScreenLoader label="Проверяем права доступа…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.isAdmin) return <Navigate to="/app" replace />;
  return children;
}

/** Signed-in users shouldn't sit on the login/register screens. */
function RedirectIfAuthed({ children }) {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <FullScreenLoader label="Загрузка…" />;
  if (isAuthenticated) return <Navigate to={user?.onboarded ? '/app' : '/onboarding'} replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<PublicLanding />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthed>
              <Register />
            </RedirectIfAuthed>
          }
        />

        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <Onboarding />
            </RequireAuth>
          }
        />
        <Route
          path="/diagnostics"
          element={
            <RequireAuth>
              <Diagnostics />
            </RequireAuth>
          }
        />
        <Route
          path="/app/*"
          element={
            <RequireAuth>
              <MainApp />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <AppStateProvider>
          <div className="space-bg min-h-screen text-slate-100">
            <DemoBanner />
            <AppRoutes />
          </div>
        </AppStateProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
