/* ── Eliminar la cuenta: se confirma escribiendo el propio email ────────────
   (las cuentas de Google no tienen contraseña). Al terminar se cierra la sesión
   y se vuelve a la portada con el aviso de cuenta eliminada. */
import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { deleteAccount } from '../api';
import { useLocale, localizeError, fill } from '../i18n';
import { IconX } from './Icons';

export default function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const matches = !!user && email.trim().toLowerCase() === user.email.toLowerCase();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches || busy) return;
    setBusy(true); setError('');
    try {
      await deleteAccount(email.trim());
      logout();
      window.location.assign('/?deleted=1');
    } catch (err) {
      setError(localizeError(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <h2 id="delete-title">{t('account.deleteConfirmTitle')}</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy} aria-label={t('common.close')}><IconX size={18} /></button>
        </div>
        <form className="modal-body delete-confirm" onSubmit={submit}>
          <p className="delete-warning">{t('account.deleteText')}</p>
          <div className="form-group">
            <label htmlFor="delete-email">{fill(t('account.deleteConfirmLabel'), { email: user?.email || '' })}</label>
            <input id="delete-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" autoFocus />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button className="btn danger-solid" type="submit" disabled={!matches || busy}>
              {busy ? t('account.deleting') : t('account.deleteConfirmBtn')}
            </button>
            <button className="btn outline" type="button" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
