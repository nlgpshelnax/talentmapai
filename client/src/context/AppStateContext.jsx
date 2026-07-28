import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { errorMessage } from '../lib/api';
import { useAuth } from './AuthContext';

const AppStateContext = createContext(null);

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>');
  return ctx;
}

/**
 * Single source of truth for map / portfolio / history / store data.
 *
 * The prototype refetched `/api/app-state` from several components, passed the
 * result down by props, and had no request cancellation — a slow response could
 * land after a newer one and overwrite fresh state. Here one provider owns the
 * fetch, guards against out-of-order responses, and every mutation returns the
 * updated slices so screens stay consistent.
 */
export function AppStateProvider({ children }) {
  const { isAuthenticated, patchUser } = useAuth();

  const [state, setState] = useState(null);
  // Starts true: an authenticated mount always fetches. Only the *first* load
  // shows a spinner — background refreshes after a mutation keep the current
  // screen visible instead of flashing a full-page loader.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return null;
    const id = ++requestId.current;
    try {
      const res = await api.get('/app-state');
      // Ignore a response that a newer request has already superseded.
      if (id !== requestId.current) return null;
      setState(res.data);
      setError(null);
      if (res.data.user) patchUser(res.data.user);
      return res.data;
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err, 'Не удалось загрузить данные'));
      return null;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [isAuthenticated, patchUser]);

  useEffect(() => {
    // Запуск вынесен в асинхронную функцию: refresh() меняет состояние уже
    // после await, а не в синхронном теле эффекта. Порядок ответов refresh
    // защищает собственным requestId, для неавторизованного пользователя — no-op.
    (async () => {
      if (isAuthenticated) await refresh();
    })();
  }, [isAuthenticated, refresh]);

  /** Apply partial server responses without a full refetch. */
  const applyPatch = useCallback(
    (patch) => {
      if (!patch) return;
      setState((prev) => (prev ? { ...prev, ...patch } : prev));
      if (patch.user) patchUser(patch.user);
    },
    [patchUser]
  );

  const completeStar = useCallback(
    async (starId) => {
      const res = await api.post('/progress/complete', { starId });
      applyPatch({
        completedStars: res.data.completedStars,
        currentStarId: res.data.currentStarId,
        historyLogs: res.data.historyLogs,
      });
      patchUser({ xp: res.data.xp });
      return res.data;
    },
    [applyPatch, patchUser]
  );

  const resetStar = useCallback(
    async (starId) => {
      const res = await api.post('/progress/reset', { starId });
      applyPatch({
        completedStars: res.data.completedStars,
        currentStarId: res.data.currentStarId,
        historyLogs: res.data.historyLogs,
      });
      patchUser({ xp: res.data.xp });
      return res.data;
    },
    [applyPatch, patchUser]
  );

  const value = useMemo(
    () => ({
      // Derive rather than clearing in an effect: signing out must never leave
      // the previous account's map briefly visible to the next user.
      state: isAuthenticated ? state : null,
      loading,
      error,
      refresh,
      applyPatch,
      completeStar,
      resetStar,
    }),
    [state, isAuthenticated, loading, error, refresh, applyPatch, completeStar, resetStar]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
