/* ── Aviso de la cuenta demo: datos de ejemplo de solo lectura ───────────────
   Franja arriba del contenido y, si se intenta cambiar algo, un aviso flotante
   unos segundos. Ambos llevan a crear una cuenta propia. */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useLocale } from '../i18n';
import { DEMO_BLOCKED_EVENT } from '../demo';
import { IconInfo, IconLock } from './Icons';

export default function DemoBanner() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const [toast, setToast] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onBlocked = () => {
      setToast(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(false), 4000);
    };
    window.addEventListener(DEMO_BLOCKED_EVENT, onBlocked);
    return () => { window.removeEventListener(DEMO_BLOCKED_EVENT, onBlocked); window.clearTimeout(timer.current); };
  }, []);

  if (!user?.is_demo) return null;
  // Recarga completa: sale de la demo sin arrastrar su estado a la cuenta nueva
  const createAccount = () => { logout(); window.location.assign('/register'); };

  return (
    <>
      <div className="demo-banner" role="note">
        <span className="demo-banner-icon"><IconInfo size={18} /></span>
        <p><strong>{t('demo.title')}</strong> {t('demo.banner')}</p>
        <button type="button" className="btn sm primary" onClick={createAccount}>{t('demo.create')}</button>
      </div>
      {toast && (
        <div className="demo-toast" role="status">
          <IconLock size={16} />
          <span>{t('demo.readOnly')}</span>
          <button type="button" onClick={createAccount}>{t('demo.create')}</button>
        </div>
      )}
    </>
  );
}
