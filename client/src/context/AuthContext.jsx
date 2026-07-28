import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { getToken, setToken as persistToken, setUnauthorizedHandler } from '../lib/api';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Auth state.
 *
 * The prototype rehydrated the whole user object from localStorage and trusted
 * it forever — a stale (or hand-edited) copy meant the UI believed a wrong
 * subscription tier, wrong XP, even a forged admin flag. Here localStorage
 * holds only the token; the user is always fetched from GET /api/auth/me.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(() => getToken());
  const [loading, setLoading] = useState(Boolean(getToken()));
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const logout = useCallback(() => {
    persistToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  // A 401 from anywhere drops the session rather than leaving a half-signed-in UI.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      persistToken(null);
      setTokenState(null);
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    // No token means there is nothing to revalidate. `user` is already null
    // (logout and the 401 handler both clear it) and `loading` initialises
    // from the stored token, so no state needs touching here.
    if (!token) return undefined;

    let cancelled = false;

    api
      .get('/auth/me')
      .then((res) => {
        if (!cancelled && mounted.current) setUser(res.data.user);
      })
      .catch(() => {
        if (!cancelled && mounted.current) {
          persistToken(null);
          setTokenState(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = useCallback((nextToken, nextUser) => {
    persistToken(nextToken);
    setLoading(Boolean(nextToken) && !nextUser);
    setTokenState(nextToken);
    if (nextUser) setUser(nextUser);
  }, []);

  /** Merge a fresh user object returned by a mutation (purchase, profile save…). */
  const patchUser = useCallback((next) => {
    setUser((prev) => (next ? { ...prev, ...next } : prev));
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      patchUser,
    }),
    [user, token, loading, login, logout, patchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
