/* ── Preferencias del usuario en este navegador (cookies) ─────────────────────
   Idioma, tema y presupuesto semanal viven en cookies para que se apliquen
   desde la primera carga (también en la portada, sin sesión). Con sesión, la
   cuenta del servidor es la fuente de verdad: PreferencesContext las sincroniza.
   Migra una sola vez los valores que antes se guardaban en localStorage. */

export type Locale = 'es' | 'en' | 'pt';
export type ThemePref = 'system' | 'light' | 'dark';

export const DEFAULT_WEEKLY_GOAL = 50;

const COOKIE = { locale: 'mb_locale', theme: 'mb_theme', weeklyGoal: 'mb_weekly_goal' } as const;
const LEGACY = { locale: 'gastos_locale', dark: 'gastos_dark', goal: 'gastos_goal' } as const;
const ONE_YEAR = 60 * 60 * 24 * 365;

export function getCookie(name: string): string | null {
  const hit = document.cookie.split('; ').find(c => c.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

export function setCookie(name: string, value: string) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
}

// Lee un valor antiguo de localStorage y lo borra (ya queda en la cookie)
function takeLegacy(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) localStorage.removeItem(key);
    return v;
  } catch { return null; }
}

const isLocale = (v: unknown): v is Locale => v === 'es' || v === 'en' || v === 'pt';
const isTheme = (v: unknown): v is ThemePref => v === 'system' || v === 'light' || v === 'dark';

/** Idioma guardado, o `null` si el usuario aún no ha elegido (se usará el del navegador). */
export function loadLocaleCookie(): Locale | null {
  const v = getCookie(COOKIE.locale);
  if (isLocale(v)) return v;
  const legacy = takeLegacy(LEGACY.locale);
  if (isLocale(legacy)) { setCookie(COOKIE.locale, legacy); return legacy; }
  return null;
}
export const saveLocaleCookie = (l: Locale) => setCookie(COOKIE.locale, l);

export function loadTheme(): ThemePref {
  const v = getCookie(COOKIE.theme);
  if (isTheme(v)) return v;
  const legacy = takeLegacy(LEGACY.dark);
  if (legacy !== null) {
    const t: ThemePref = legacy === 'true' ? 'dark' : 'light';
    setCookie(COOKIE.theme, t);
    return t;
  }
  return 'system';
}
export const saveTheme = (t: ThemePref) => setCookie(COOKIE.theme, t);

export function loadWeeklyGoal(): number {
  const v = Number(getCookie(COOKIE.weeklyGoal));
  if (Number.isFinite(v) && v > 0) return v;
  const legacy = Number(takeLegacy(LEGACY.goal));
  if (Number.isFinite(legacy) && legacy > 0) { setCookie(COOKIE.weeklyGoal, String(legacy)); return legacy; }
  return DEFAULT_WEEKLY_GOAL;
}
export const saveWeeklyGoal = (n: number) => setCookie(COOKIE.weeklyGoal, String(n));

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Aplica el tema al documento; con "system" sigue al sistema operativo mientras esté activo. */
export function applyTheme(pref: ThemePref): () => void {
  const set = () => document.documentElement.classList.toggle('dark', pref === 'dark' || (pref === 'system' && darkQuery().matches));
  set();
  if (pref !== 'system') return () => {};
  const mq = darkQuery();
  mq.addEventListener('change', set);
  return () => mq.removeEventListener('change', set);
}
