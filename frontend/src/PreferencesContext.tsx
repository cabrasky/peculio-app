/* ── Preferencias: idioma, tema y presupuesto semanal ────────────────────────
   Se aplican al momento y se guardan en cookies (preferences.ts). Con sesión se
   guardan también en la cuenta; y si la cuenta ya está configurada (setup_done),
   sus valores mandan sobre los del navegador para que web y app coincidan. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useLocale } from './i18n';
import {
  applyTheme, loadTheme, loadWeeklyGoal, saveTheme, saveWeeklyGoal,
  type Locale, type ThemePref,
} from './preferences';

export interface Prefs { locale: Locale; theme: ThemePref; weeklyGoal: number }

interface PrefsValue extends Prefs {
  /** Cambia preferencias; con `sync` (por defecto) también se guardan en la cuenta. */
  setPrefs: (p: Partial<Prefs>, opts?: { sync?: boolean }) => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, updatePreferences } = useAuth();
  const { locale, setLocale } = useLocale();
  const [theme, setTheme] = useState<ThemePref>(loadTheme);
  const [weeklyGoal, setWeeklyGoal] = useState<number>(loadWeeklyGoal);

  useEffect(() => applyTheme(theme), [theme]);

  // Cuenta → navegador (solo cuando la cuenta ya tiene preferencias elegidas)
  const applied = useRef('');
  useEffect(() => {
    if (!user?.setup_done) return;
    const sig = `${user.id}|${user.locale}|${user.theme}|${user.weekly_goal}`;
    if (applied.current === sig) return;
    applied.current = sig;
    if (user.locale) setLocale(user.locale);
    if (user.theme) { setTheme(user.theme); saveTheme(user.theme); }
    if (user.weekly_goal && user.weekly_goal > 0) { setWeeklyGoal(user.weekly_goal); saveWeeklyGoal(user.weekly_goal); }
  }, [user, setLocale]);

  // Navegador → cuenta: agrupa cambios seguidos (p. ej. al teclear el presupuesto)
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<number | undefined>(undefined);
  const pushToAccount = useCallback((body: Record<string, unknown>) => {
    Object.assign(pending.current, body);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const payload = pending.current;
      pending.current = {};
      updatePreferences(payload).catch(err => console.warn('[prefs] no se pudieron guardar en la cuenta', err));
    }, 500);
  }, [updatePreferences]);

  const setPrefs = useCallback((p: Partial<Prefs>, opts?: { sync?: boolean }) => {
    const body: Record<string, unknown> = {};
    if (p.locale) { setLocale(p.locale); body.locale = p.locale; }
    if (p.theme) { setTheme(p.theme); saveTheme(p.theme); body.theme = p.theme; }
    if (p.weeklyGoal !== undefined && Number.isFinite(p.weeklyGoal) && p.weeklyGoal >= 0) {
      setWeeklyGoal(p.weeklyGoal);
      if (p.weeklyGoal > 0) { saveWeeklyGoal(p.weeklyGoal); body.weekly_goal = p.weeklyGoal; }
    }
    if ((opts?.sync ?? true) && user && Object.keys(body).length) pushToAccount(body);
  }, [setLocale, user, pushToAccount]);

  return (
    <PrefsContext.Provider value={{ locale, theme, weeklyGoal, setPrefs }}>
      {children}
    </PrefsContext.Provider>
  );
}

export function usePreferences(): PrefsValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
