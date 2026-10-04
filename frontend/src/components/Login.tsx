/* ── Login Page ─────────────────────────────────────────────────────────────── */
import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { useLocale, localizeError } from '../i18n';
import { BrandMark, IconArrowLeft } from './Icons';
import LegalLinks from './LegalLinks';

export default function Login() {
  const { login, googleLogin, authError } = useAuth();
  const navigate = useNavigate();
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(localizeError(err, t));
    }
    setBusy(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-top">
          <span className="auth-brand"><BrandMark /><span className="brand-name">Peculio</span></span>
          <Link to="/" className="back-link"><IconArrowLeft size={14} />{t('common.backHome')}</Link>
        </div>
        <h1>{t('auth.login')}</h1>
        <form onSubmit={handleSubmit}>
          <label>{t('common.email')}</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <label>{t('auth.password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          {(error || authError === 'suspended') && <p className="error">{error || t('error.suspended')}</p>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? t('auth.entering') : t('auth.enter')}
          </button>
        </form>
        <button className="btn google-btn" onClick={googleLogin}>
          {t('auth.google')}
        </button>
        <p className="auth-link">
          {t('auth.noAccount')} <Link to="/register">{t('auth.signUp')}</Link>
        </p>
        <p className="auth-link">
          <Link to="/forgot-password">{t('auth.forgot')}</Link>
        </p>
        <LegalLinks className="auth-legal" />
      </div>
    </div>
  );
}
