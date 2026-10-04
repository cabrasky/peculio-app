/* ── Forgot Password Page ───────────────────────────────────────────────────── */
import { useState } from 'react';
import { forgotPassword } from '../api';
import { Link } from 'react-router-dom';
import { useLocale, localizeError } from '../i18n';
import { BrandMark, IconArrowLeft } from './Icons';

export default function ForgotPassword() {
  const { t } = useLocale();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await forgotPassword(email);
      setMessage(t('auth.forgotSent'));
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
        <h1>{t('auth.recover')}</h1>
        <form onSubmit={handleSubmit}>
          <label>{t('common.email')}</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder={t('auth.emailPh')}
          />
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? t('auth.sending') : t('auth.sendLink')}
          </button>
        </form>
        <p className="auth-link">
          <Link to="/login">{t('auth.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
