/* ── Landing pública (no autenticados) ────────────────────────────────────── */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useLocale, nextLocale, localizeError, fill, LOCALE_TAG } from '../i18n';
import { BrandMark, IconDownload, IconGrid, IconList, IconRefresh, IconSmartphone, IconTarget, IconWallet, IconArrowRight, IconSparkle, IconCheckCircle, IconX, IconAlertCircle, IconServer, IconQrCode } from './Icons';
import LegalLinks from './LegalLinks';
import { apkDownloadUrl, apkLatest, type ApkLatest } from '../adminApi';

// Lo que viene (ver ROADMAP.md): sin fecha, se anuncia como «Próximamente»
const ROADMAP = [
  { icon: IconServer, title: 'landing.r1t', desc: 'landing.r1d' },
  { icon: IconSmartphone, title: 'landing.r2t', desc: 'landing.r2d' },
  { icon: IconQrCode, title: 'landing.r3t', desc: 'landing.r3d' },
];

// La build que se sirve la elige un admin (Administración → App Android)
const APK_URL = apkDownloadUrl;

const FEATURES = [
  { icon: 'list', title: 'landing.f1t', desc: 'landing.f1d' },
  { icon: 'grid', title: 'landing.f2t', desc: 'landing.f2d' },
  { icon: 'refresh', title: 'landing.f3t', desc: 'landing.f3d' },
  { icon: 'target', title: 'landing.f4t', desc: 'landing.f4d' },
  { icon: 'wallet', title: 'landing.f5t', desc: 'landing.f5d' },
  { icon: 'phone', title: 'landing.f6t', desc: 'landing.f6d' },
  { icon: 'refresh', title: 'landing.f7t', desc: 'landing.f7d' },
];

export default function Landing() {
  const { t, locale, setLocale } = useLocale();
  const { loginDemo, authError, clearAuthError } = useAuth();
  const navigate = useNavigate();
  // La demo solo se abre desde aquí (no desde el login)
  const [demo, setDemo] = useState({ busy: false, error: '' });
  const [apk, setApk] = useState<ApkLatest | null>(null);
  useEffect(() => { apkLatest().then(setApk).catch(() => {}); }, []);
  // Tras eliminar la cuenta se vuelve aquí con ?deleted=1
  const [deleted, setDeleted] = useState(() => new URLSearchParams(window.location.search).has('deleted'));
  const closeDeleted = () => { setDeleted(false); window.history.replaceState(null, '', '/'); };
  const tryDemo = async () => {
    setDemo({ busy: true, error: '' });
    try {
      await loginDemo();
      navigate('/dashboard');
    } catch (err) {
      setDemo({ busy: false, error: localizeError(err, t) });
    }
  };
  const mock = [
    { d: t('landing.mock1'), c: t('ref.categories.savings'), a: '450,00 €', cat: 'cat-c2', income: false },
    { d: t('landing.mock2'), c: t('ref.categories.food'), a: '3,50 €', cat: 'cat-c4', income: false },
    { d: t('landing.mock3'), c: t('ref.categories.drink'), a: '2,90 €', cat: 'cat-c1', income: false },
    { d: t('landing.mock4'), c: t('landing.income'), a: '+800,00 €', cat: 'cat-c1', income: true },
  ];
  return (
    <div className="landing">
      <header className="landing-bar">
        <div className="landing-brand">
          <BrandMark size={52} />
          <span className="brand-name">Peculio</span>
        </div>
        <div className="landing-actions">
          <button type="button" className="theme-btn" onClick={() => setLocale(nextLocale(locale))} title={t('lang.select')} aria-label={t('lang.select')}>{locale.toUpperCase()}</button>
          <Link to="/register" className="landing-link">{t('auth.createAccount')}</Link>
          <Link to="/login" className="btn primary">{t('auth.enter')}</Link>
        </div>
      </header>

      {authError === 'suspended' && (
        <div className="landing-notice warn" role="alert">
          <IconAlertCircle size={18} />
          <span>{t('error.suspended')}</span>
          <button type="button" onClick={clearAuthError} aria-label={t('common.close')}><IconX size={16} /></button>
        </div>
      )}
      {deleted && (
        <div className="landing-notice" role="status">
          <IconCheckCircle size={18} />
          <span>{t('account.deleted')}</span>
          <button type="button" onClick={closeDeleted} aria-label={t('common.close')}><IconX size={16} /></button>
        </div>
      )}

      <section className="landing-hero">
        <div>
          <span className="landing-eyebrow">{t('landing.badge')}</span>
          <h1>
            {t('landing.heroA')}<br />{t('landing.heroB')} <em>{t('landing.heroC')}</em>.
          </h1>
          <p className="landing-lead">{t('landing.heroText')}</p>
          <div className="landing-ctas">
            <a href={APK_URL} className="btn primary lg"><IconSmartphone size={18} />{t('landing.downloadAndroid')}</a>
            <Link to="/login" className="btn outline lg">{t('landing.openWeb')}<IconArrowRight size={16} /></Link>
          </div>
          <button type="button" className="landing-demo" onClick={tryDemo} disabled={demo.busy}>
            <span className="landing-demo-icon"><IconSparkle size={18} /></span>
            <span className="landing-demo-text">
              <strong>{demo.busy ? t('demo.entering') : t('demo.try')}</strong>
              <span>{t('demo.tryHint')}</span>
            </span>
            <IconArrowRight size={16} />
          </button>
          {demo.error && <p className="error">{demo.error}</p>}
          <p className="landing-note">{t('landing.requirements')}</p>
        </div>

        {/* Mock de la app */}
        <div className="landing-mock" aria-hidden="true">
          <div className="landing-mock-top">
            <div className="landing-brand sm">
              <BrandMark size={36} />
              <span>Peculio</span>
            </div>
            <span className="landing-note">{t('ref.months.9')} 2026</span>
          </div>
          <div className="hero-card landing-mock-hero">
            <span className="hero-label">{t('landing.monthBalance')}</span>
            <span className="hero-num">+326,41 €</span>
          </div>
          {mock.map(r => (
            <div key={r.d} className="landing-mock-row">
              <span className={`xg-initial ${r.cat}`}>{r.c.charAt(0).toUpperCase()}</span>
              <span className="landing-mock-text">
                <span className="xg-desc">{r.d}</span>
                <span className="xg-meta">{r.c}</span>
              </span>
              <span className={`xg-amount num${r.income ? ' income' : ''}`}>{r.a}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <span className="landing-eyebrow">Peculio</span>
        <h2>{t('landing.featuresTitle')}</h2>
        <div className="landing-features">
          {FEATURES.map(f => {
            const Icon = { list: IconList, grid: IconGrid, refresh: IconRefresh, target: IconTarget, wallet: IconWallet, phone: IconSmartphone }[f.icon] as any;
            return (
              <div key={f.title} className="landing-feature">
                <div className="more-icon"><Icon size={22} /></div>
                <div className="landing-feature-title">{t(f.title)}</div>
                <div className="landing-feature-desc">{t(f.desc)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="landing-section">
        <span className="landing-eyebrow">{t('landing.roadmapEyebrow')}</span>
        <h2>{t('landing.roadmapTitle')}</h2>
        <div className="landing-features landing-roadmap">
          {ROADMAP.map(r => (
            <div key={r.title} className="landing-feature">
              <div className="landing-roadmap-top">
                <div className="more-icon"><r.icon size={22} /></div>
                <span className="landing-soon">{t('landing.soon')}</span>
              </div>
              <div className="landing-feature-title">{t(r.title)}</div>
              <div className="landing-feature-desc">{t(r.desc)}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="descarga" className="landing-section narrow">
        <div className="hero-card landing-download">
          <div className="landing-download-icon"><IconSmartphone size={32} /></div>
          <h2>{t('landing.downloadTitle')}</h2>
          <p>{t('landing.downloadText')}</p>
          <a href={APK_URL} download className="btn primary lg"><IconDownload size={18} />{t('landing.downloadApk')}</a>
          <div className="landing-download-info">
            {apk
              ? fill(t('landing.apkInfo'), { v: apk.version, mb: Math.max(1, Math.round(apk.size / 1048576)), d: new Date(`${apk.published_at}Z`).toLocaleDateString(LOCALE_TAG[locale], { day: 'numeric', month: 'short', year: 'numeric' }) })
              : t('landing.apkInfoBasic')}<br />
            {t('landing.apkHelp')}
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div>{t('landing.footer')} <Link to="/login">{t('auth.login')}</Link></div>
        <LegalLinks />
      </footer>
    </div>
  );
}
