/* ── Formulario de preferencias (ventana de bienvenida y Configuración) ────── */
import { useEffect, useState } from 'react';
import { useLocale } from '../i18n';
import type { Prefs } from '../PreferencesContext';
import type { Locale, ThemePref } from '../preferences';
import { IconMonitor, IconSun, IconMoon } from './Icons';

// Cada idioma con su propio nombre, para que se reconozca aunque la interfaz esté en otro
const LANGS: { value: Locale; label: string }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
];

interface Props {
  value: Prefs;
  onChange: (p: Partial<Prefs>) => void;
  name?: { value: string; onChange: (v: string) => void };
}

export default function PreferencesForm({ value, onChange, name }: Props) {
  const { t } = useLocale();
  const themes: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
    { value: 'system', label: t('settings.themeSystem'), icon: <IconMonitor size={16} /> },
    { value: 'light', label: t('settings.themeLight'), icon: <IconSun size={16} /> },
    { value: 'dark', label: t('settings.themeDark'), icon: <IconMoon size={16} /> },
  ];
  // Texto del presupuesto mientras se escribe (se puede dejar vacío un momento)
  const [goal, setGoal] = useState(String(value.weeklyGoal));
  useEffect(() => { setGoal(g => (Number(g) === value.weeklyGoal ? g : String(value.weeklyGoal))); }, [value.weeklyGoal]);

  return (
    <div className="prefs-form">
      {name && (
        <div className="form-group">
          <label htmlFor="pref-name">{t('common.name')}</label>
          <input id="pref-name" type="text" value={name.value} onChange={e => name.onChange(e.target.value)} placeholder={t('profile.namePh')} autoComplete="name" />
        </div>
      )}
      <div className="form-group">
        <label id="pref-lang">{t('settings.language')}</label>
        <div className="seg" role="radiogroup" aria-labelledby="pref-lang">
          {LANGS.map(l => (
            <button key={l.value} type="button" role="radio" aria-checked={value.locale === l.value}
              className={value.locale === l.value ? 'on' : ''} onClick={() => onChange({ locale: l.value })}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label id="pref-theme">{t('settings.theme')}</label>
        <div className="seg" role="radiogroup" aria-labelledby="pref-theme">
          {themes.map(th => (
            <button key={th.value} type="button" role="radio" aria-checked={value.theme === th.value}
              className={value.theme === th.value ? 'on' : ''} onClick={() => onChange({ theme: th.value })}>
              {th.icon}{th.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="pref-goal">{t('settings.weeklyGoal')}</label>
        <div className="amount-input-wrap">
          <span className="cur">€</span>
          <input id="pref-goal" type="number" inputMode="decimal" min={0} step={5} value={goal}
            onChange={e => { setGoal(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && n >= 0) onChange({ weeklyGoal: n }); }} />
        </div>
        <span className="form-hint">{t('settings.weeklyGoalHint')}</span>
      </div>
    </div>
  );
}
