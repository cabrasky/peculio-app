/* ── Enlaces a los textos legales (portada, login, Configuración) ────────── */
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import { LEGAL_SLUGS, type LegalSlug } from '../legal';

const LABEL: Record<LegalSlug, string> = {
  privacidad: 'legal.privacy',
  cookies: 'legal.cookies',
  'aviso-legal': 'legal.notice',
  terminos: 'legal.terms',
  'eliminar-cuenta': 'account.deleteTitle',
};

export default function LegalLinks({ className = '' }: { className?: string }) {
  const { t } = useLocale();
  return (
    <nav className={`legal-links ${className}`.trim()} aria-label={t('legal.docs')}>
      {LEGAL_SLUGS.map(s => <Link key={s} to={`/legal/${s}`}>{t(LABEL[s])}</Link>)}
    </nav>
  );
}
