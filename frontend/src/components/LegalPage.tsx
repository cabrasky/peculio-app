/* ── Textos legales: /legal/privacidad, /cookies, /aviso-legal, /terminos,
   /eliminar-cuenta (el enlace de baja de la ficha de Google Play).
   Con sesión se ven dentro del layout de la app; sin sesión, como página pública
   con la cabecera de la portada. */
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useLocale, nextLocale, LOCALE_TAG } from '../i18n';
import { LEGAL_SLUGS, LEGAL_UPDATED, isLegalSlug, legalDocs } from '../legal';
import RichText from './RichText';
import LegalLinks from './LegalLinks';
import { BrandMark, IconArrowLeft } from './Icons';

export default function LegalPage() {
  const { doc } = useParams();
  const { user } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const docs = legalDocs(locale);
  const slug = isLegalSlug(doc) ? doc : null;

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  if (!slug) return <Navigate to="/legal/privacidad" replace />;
  const d = docs[slug];
  const updated = new Date(`${LEGAL_UPDATED}T12:00:00`)
    .toLocaleDateString(LOCALE_TAG[locale], { day: 'numeric', month: 'long', year: 'numeric' });

  const body = (
    <div className="legal-layout">
      <nav className="legal-nav" aria-label={t('legal.docs')}>
        {LEGAL_SLUGS.map(s => (
          <Link key={s} to={`/legal/${s}`} className={s === slug ? 'active' : undefined} aria-current={s === slug ? 'page' : undefined}>
            {docs[s].title}
          </Link>
        ))}
      </nav>
      <article className="legal-doc">
        <h1>{d.title}</h1>
        <p className="legal-updated">{t('legal.updated')}: {updated}</p>
        <p className="legal-intro"><RichText text={d.intro} /></p>
        {d.sections.map(sec => (
          <section key={sec.h}>
            <h2>{sec.h}</h2>
            {sec.p.map((x, i) => Array.isArray(x)
              ? <ul key={i}>{x.map(li => <li key={li}><RichText text={li} /></li>)}</ul>
              : <p key={i}><RichText text={x} /></p>)}
          </section>
        ))}
      </article>
    </div>
  );

  if (user) return body;

  return (
    <div className="legal-public">
      <header className="landing-bar">
        <Link to="/" className="landing-brand">
          <BrandMark size={44} />
          <span className="brand-name">Peculio</span>
        </Link>
        <div className="landing-actions">
          <button type="button" className="theme-btn" onClick={() => setLocale(nextLocale(locale))} title={t('lang.select')} aria-label={t('lang.select')}>{locale.toUpperCase()}</button>
          <Link to="/" className="landing-link legal-back"><IconArrowLeft size={14} />{t('common.backHome')}</Link>
        </div>
      </header>
      <main className="legal-main">{body}</main>
      <footer className="landing-footer"><LegalLinks /></footer>
    </div>
  );
}
