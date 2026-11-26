/* ── AuthContext: manages login state across the app ───────────────────────── */
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { login as apiLogin, register as apiRegister, demoLogin as apiDemoLogin, getMe, getGoogleAuthUrl, logoutSession, setStoredUser, getStoredUser, updatePreferences as apiUpdatePreferences, type AccountPreferences } from './api';
import { clearLocalData } from './store';
import { setDemoMode } from './demo';
import { isSessionRejected, shouldClearAccountCache } from './authPolicy';

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  is_admin: boolean;
  is_developer: boolean;
  locale?: AccountPreferences['locale'];
  theme?: AccountPreferences['theme'];
  weekly_goal?: number | null;
  weekly_excluded?: string[] | null;
  setup_done?: boolean;
  mobile_tour_done?: boolean;
  is_demo?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  connectionIssue: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  /** Cuenta demo pública de solo lectura */
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
  googleLogin: () => void;
  refreshUser: () => Promise<void>;
  updatePreferences: (body: Partial<AccountPreferences>) => Promise<void>;
  /** Error al volver de Google (p. ej. 'suspended': cuenta suspendida por un admin) */
  authError: string;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => {
    const stored = getStoredUser();
    setDemoMode(!!stored?.is_demo);
    return stored;
  });
  // La marca de solo lectura va a la par que el usuario (la leen store y páginas)
  const setUser = useCallback((u: User | null) => {
    setDemoMode(!!u?.is_demo);
    setUserState(u);
  }, []);
  const [loading, setLoading] = useState(true);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [authError, setAuthError] = useState('');
  const generation = useRef(0);
  const logoutInFlight = useRef<Promise<void> | null>(null);
  const clearAuthError = useCallback(() => setAuthError(''), []);

  const acceptUser = useCallback((next: User) => {
    const owner = localStorage.getItem('gastos_data_owner');
    const previous = owner ? { id: owner } : getStoredUser();
    if (shouldClearAccountCache(previous, next)) clearLocalData();
    localStorage.setItem('gastos_data_owner', next.id);
    setUser(next);
    setStoredUser(next);
    setConnectionIssue(false);
  }, [setUser]);

  const refreshUser = useCallback(async () => {
    const current = generation.current;
    // An offline logout must never restore the old cookie on reload.
    if (localStorage.getItem('peculio_logout_pending') === '1') {
      clearLocalData();
      localStorage.removeItem('gastos_data_owner');
      setStoredUser(null);
      setUser(null);
      try {
        await logoutSession();
        localStorage.removeItem('peculio_logout_pending');
        setConnectionIssue(false);
      } catch { setConnectionIssue(true); }
      if (generation.current === current) setLoading(false);
      return;
    }
    try {
      const next = await getMe();
      if (generation.current === current) acceptUser(next);
    } catch (error) {
      if (generation.current === current) {
        if (isSessionRejected(error)) {
          // Preserve the owner marker and pending writes for same-account reauthentication.
          setStoredUser(null);
          setUser(null);
          setConnectionIssue(false);
        } else {
          // Keep offline data without claiming that the server accepted pending writes.
          setConnectionIssue(true);
        }
      }
    }
    if (generation.current === current) setLoading(false);
  }, [acceptUser, setUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    const errorFromUrl = params.get('error');
    // Old web OAuth URLs must not be turned into localStorage credentials.
    if (tokenFromUrl) {
      setUser(null);
      setStoredUser(null);
    }
    if (errorFromUrl) setAuthError(errorFromUrl);
    if (tokenFromUrl || errorFromUrl) window.history.replaceState({}, '', window.location.pathname);
    void refreshUser();
  }, [refreshUser, setUser]);

  const login = async (email: string, password: string) => {
    if (logoutInFlight.current) await logoutInFlight.current;
    const data = await apiLogin(email, password);
    generation.current++;
    localStorage.removeItem('peculio_logout_pending');
    acceptUser(data.user);
  };

  const register = async (email: string, password: string, name: string) => {
    if (logoutInFlight.current) await logoutInFlight.current;
    const data = await apiRegister(email, password, name);
    generation.current++;
    localStorage.removeItem('peculio_logout_pending');
    acceptUser(data.user);
  };

  const loginDemo = async () => {
    if (logoutInFlight.current) await logoutInFlight.current;
    const data = await apiDemoLogin();
    generation.current++;
    localStorage.removeItem('peculio_logout_pending');
    clearLocalData();
    acceptUser(data.user);
  };

  const logout = async () => {
    generation.current++;
    localStorage.setItem('peculio_logout_pending', '1');
    clearLocalData();
    localStorage.removeItem('gastos_data_owner');
    setStoredUser(null);
    setUser(null);
    setConnectionIssue(false);
    const pending = (async () => {
      try {
        await logoutSession();
        localStorage.removeItem('peculio_logout_pending');
      } catch {
        // Keep the pending marker until the server clears the cookie.
        setConnectionIssue(true);
      }
    })();
    logoutInFlight.current = pending;
    try { await pending; } finally {
      if (logoutInFlight.current === pending) logoutInFlight.current = null;
    }
  };

  // Guarda preferencias en la cuenta y refresca el usuario con lo que devuelve el servidor
  const updatePreferences = useCallback(async (body: Partial<AccountPreferences>) => {
    const updated = await apiUpdatePreferences(body);
    setUser(updated);
    setStoredUser(updated);
  }, [setUser]);

  const googleLogin = () => {
    window.location.href = getGoogleAuthUrl();
  };

  return (
    <AuthContext.Provider value={{ user, loading, connectionIssue, login, register, loginDemo, logout, googleLogin, refreshUser, updatePreferences, authError, clearAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
