/* ── Reset Password Page ────────────────────────────────────────────────────── */
import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { resetPassword } from '../api';
import { useLocale, localizeError } from '../i18n';
import { BrandMark, IconArrowLeft } from './Icons';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLocale();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirm) {
      setError(t('error.passwordMismatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('error.passwordLength'));
      return;
    }

    setBusy(true);
    try {
      await resetPassword(token, password);
      setMessage(t('auth.resetDone'));
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(localizeError(err, t));
    }
    setBusy(false);
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-top">
            <span className="auth-brand"><BrandMark /><span className="brand-name">Peculio</span></span>
            <Link to="/" className="back-link"><IconArrowLeft size={14} />{t('common.backHome')}</Link>
          </div>
          <h1>{t('error.invalidLink')}</h1>
          <p>{t('auth.invalidLinkText')}</p>
          <p className="auth-link">
            <Link to="/forgot-password">{t('auth.requestNew')}</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-top">
          <span className="auth-brand"><BrandMark /><span className="brand-name">Peculio</span></span>
        </div>
        <h1>{t('auth.newPassword')}</h1>
        <form onSubmit={handleSubmit}>
          <label>{t('auth.newPassword')}</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder={t('auth.minChars')}
          />
          <label>{t('auth.confirmPassword')}</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            minLength={6}
            placeholder={t('auth.repeatPh')}
          />
          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? t('common.saving') : t('profile.changeBtn')}
          </button>
        </form>
        <p className="auth-link">
          <Link to="/login">{t('auth.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
