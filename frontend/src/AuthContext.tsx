/* ── AuthContext: manages login state across the app ───────────────────────── */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { login as apiLogin, register as apiRegister, demoLogin as apiDemoLogin, getMe, getGoogleAuthUrl, setToken, getToken, setStoredUser, getStoredUser, updatePreferences as apiUpdatePreferences, type AccountPreferences } from './api';
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
  logout: () => void;
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
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const next = await getMe();
      if (getToken() === token) acceptUser(next);
    } catch (error) {
      if (getToken() === token) {
        if (isSessionRejected(error)) {
          setToken(null);
          setStoredUser(null);
          setUser(null);
          setConnectionIssue(false);
        } else {
          // Conectividad: conserva sesión y datos; no afirma que el servidor aceptó cambios.
          setConnectionIssue(true);
        }
      }
    }
    setLoading(false);
  }, [acceptUser, setUser]);

  useEffect(() => {
    // Check URL for token (from Google OAuth redirect)
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('token');
    const errorFromUrl = params.get('error');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      // Nunca mostrar el usuario anterior mientras se valida una sesión OAuth nueva.
      setUser(null);
      setStoredUser(null);
    }
    if (errorFromUrl) setAuthError(errorFromUrl);
    if (tokenFromUrl || errorFromUrl) {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    refreshUser();
  }, [refreshUser, setUser]);

  const login = async (email: string, password: string) => {
    const data = await apiLogin(email, password);
    setToken(data.token);
    acceptUser(data.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const data = await apiRegister(email, password, name);
    setToken(data.token);
    acceptUser(data.user);
  };

  const loginDemo = async () => {
    const data = await apiDemoLogin();
    clearLocalData();
    setToken(data.token);
    acceptUser(data.user);
  };

  const logout = () => {
    clearLocalData();
    localStorage.removeItem('gastos_data_owner');
    setToken(null);
    setStoredUser(null);
    setUser(null);
    setConnectionIssue(false);
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
