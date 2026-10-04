/* ── Perfil: editar mi usuario (nombre, avatar) y cambiar contraseña ──────────
   Se muestra dentro de Configuración (SettingsPage). */
import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { updateMe, changePassword } from '../api';
import { useLocale, localizeError } from '../i18n';
import { IconUser, IconKey, IconCheckCircle, IconAlertCircle } from './Icons';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const { t } = useLocale();
  const [name, setName] = useState(user?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setMsg(null);
      const updated = await updateMe({ name: name.trim() || undefined, avatar_url: avatarUrl.trim() });
      if (updated) {
        setName(updated.name);
        setAvatarUrl(updated.avatar_url);
        await refreshUser();
      }
      setMsg({ ok: true, text: t('profile.saved') });
    } catch (e: any) {
      setMsg({ ok: false, text: localizeError(e, t) });
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    try {
      setMsg(null);
      if (newPassword.length < 6) {
        setMsg({ ok: false, text: t('error.passwordLength') });
        return;
      }
      if (newPassword !== confirmPassword) {
        setMsg({ ok: false, text: t('error.passwordMismatch') });
        return;
      }
      setSaving(true);
      await changePassword(currentPassword, newPassword);
      setMsg({ ok: true, text: t('profile.passwordChanged') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setMsg({ ok: false, text: localizeError(e, t) });
    }
    setSaving(false);
  };

  if (!user) return null;

  return (
    <>
      <div className="admin-section">
        <h3 className="h3-icon"><IconUser size={18} />{t('profile.personal')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          {user.avatar_url ? (
            <img src={user.avatar_url} alt={user.name || ''} width={56} height={56} style={{ borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
          ) : (
            <div className="user-avatar-fallback" style={{ width: 56, height: 56, borderRadius: '50%', fontSize: 22 }}>
              {(user.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 700 }}>{user.name}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{user.email}{user.is_admin ? ' · admin' : ''}</div>
          </div>
        </div>
        {user.is_demo ? <p className="hint">{t('demo.profile')}</p> : <div className="auth-form">
          <label>{t('common.name')}</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('profile.namePh')} />
          <label>{t('profile.avatar')}</label>
          <input type="url" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder={t('profile.avatarPh')} />
          <button className="btn primary" onClick={handleSaveProfile} disabled={saving}>
            {saving ? t('common.saving') : t('profile.save')}
          </button>
        </div>}
      </div>

      {!user.is_demo && <div className="admin-section">
        <h3 className="h3-icon"><IconKey size={18} />{t('profile.changePassword')}</h3>
        <div className="auth-form">
          <label>{t('profile.currentPassword')}</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder={t('profile.currentPh')} autoComplete="current-password" />
          <label>{t('auth.newPassword')}</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('auth.minChars')} autoComplete="new-password" />
          <label>{t('profile.repeatNew')}</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('profile.repeatNewPh')} autoComplete="new-password" />
          <button className="btn primary" onClick={handleChangePassword} disabled={saving}>
            {saving ? t('common.saving') : t('profile.changeBtn')}
          </button>
          <p className="hint" style={{ marginTop: 8 }}>
            {t('profile.hint')}
          </p>
        </div>
      </div>}

      {msg && <p className={`msg-line ${msg.ok ? 'success' : 'error'}`}>{msg.ok ? <IconCheckCircle size={16} /> : <IconAlertCircle size={16} />}{msg.text}</p>}
    </>
  );
}
