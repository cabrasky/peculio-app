/* ── Ventana de bienvenida: la primera vez que el usuario entra a su espacio ──
   Pide nombre, idioma, tema y presupuesto semanal. Los cambios se ven al momento
   y al guardar quedan en la cuenta (setup_done) y en las cookies. */
import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';
import { updateMe } from '../api';
import { useLocale, localizeError } from '../i18n';
import PreferencesForm from './PreferencesForm';
import { BrandMark } from './Icons';

export default function SetupModal({ onLater }: { onLater: () => void }) {
  const { user, updatePreferences } = useAuth();
  const prefs = usePreferences();
  const { t } = useLocale();
  const [name, setName] = useState(user?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== user?.name) await updateMe({ name: trimmed });
      await updatePreferences({ locale: prefs.locale, theme: prefs.theme, weekly_goal: prefs.weeklyGoal, setup_done: true });
    } catch (e) {
      setError(localizeError(e, t));
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <div className="modal modal-sm setup-modal">
        <div className="setup-head">
          <BrandMark size="lg" />
          <h2 id="setup-title">{t('setup.title')}</h2>
          <p>{t('setup.intro')}</p>
        </div>
        <div className="modal-body">
          {/* Vista previa: se aplica ya, pero solo se guarda en la cuenta al pulsar Guardar */}
          <PreferencesForm value={prefs} onChange={p => prefs.setPrefs(p, { sync: false })} name={{ value: name, onChange: setName }} />
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button className="btn primary" type="button" onClick={save} disabled={busy}>
              {busy ? t('common.saving') : t('setup.save')}
            </button>
            <button className="btn outline" type="button" onClick={onLater} disabled={busy}>{t('setup.later')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
