/* ── Admin · Configuración: Google OAuth y SMTP ────────────────────────────── */
import { useState, useEffect } from 'react';
import { getOAuthConfig, updateOAuthConfig, getSmtpConfig, updateSmtpConfig, testSmtpConfig, type SmtpTestResult } from '../../api';
import { useAuth } from '../../AuthContext';
import { useLocale, localizeError } from '../../i18n';
import { IconLock, IconMail, IconCheckCircle, IconAlertCircle, IconServer, IconSend } from '../Icons';
import SmtpReport from './SmtpReport';

export default function AdminConfig() {
  const { t } = useLocale();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // OAuth state
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [oauthEnabled, setOauthEnabled] = useState(false);

  // SMTP state
  const [smtpHost, setSmtpHost] = useState('mail.cabrasky.net');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('Peculio');
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  // Prueba del SMTP: resultado paso a paso y aviso de guardado
  const [testing, setTesting] = useState<'check' | 'send' | null>(null);
  const [testTo, setTestTo] = useState('');
  const [smtpResult, setSmtpResult] = useState<SmtpTestResult | null>(null);
  const [smtpNote, setSmtpNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { loadConfig(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadConfig = async () => {
    try {
      setMsg(null);
      const [oauthData, smtpData] = await Promise.all([
        getOAuthConfig(),
        getSmtpConfig(),
      ]);
      const google = oauthData.configs.find(c => c.provider === 'google');
      if (google) {
        setClientId(google.client_id);
        setRedirectUri(google.redirect_uri);
        setOauthEnabled(google.enabled);
      }
      setSmtpHost(smtpData.host);
      setSmtpPort(smtpData.port);
      setSmtpUser(smtpData.user);
      setSmtpFromEmail(smtpData.from_email);
      setSmtpFromName(smtpData.from_name);
      setSmtpPasswordSet(smtpData.password_set);
    } catch (e: any) {
      setMsg({ ok: false, text: localizeError(e, t) });
    }
    setLoading(false);
  };

  const handleSaveOAuth = async () => {
    try {
      setSaving('oauth');
      setMsg(null);
      await updateOAuthConfig({
        provider: 'google',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        enabled: oauthEnabled,
      });
      setMsg({ ok: true, text: t('admin.oauthSaved') });
    } catch (e: any) {
      setMsg({ ok: false, text: localizeError(e, t) });
    }
    setSaving(null);
  };

  const smtpForm = () => ({
    host: smtpHost.trim(),
    port: smtpPort,
    user: smtpUser.trim(),
    password: smtpPassword,
    from_email: smtpFromEmail.trim(),
    from_name: smtpFromName.trim(),
  });

  // Guardar y, a continuación, probar la conexión con lo guardado
  const handleSaveSmtp = async () => {
    const form = smtpForm();
    setSaving('smtp');
    setSmtpNote(null);
    setSmtpResult(null);
    try {
      await updateSmtpConfig(form);
      setSmtpPassword('');
      if (form.password) setSmtpPasswordSet(true);
    } catch (e: any) {
      setSmtpNote({ ok: false, text: localizeError(e, t) });
      setSaving(null);
      return;
    }
    try {
      const r = await testSmtpConfig(form);
      setSmtpResult(r);
      setSmtpNote({ ok: r.ok, text: t(r.ok ? 'admin.smtpSavedOk' : 'admin.smtpSavedFail') });
    } catch (e: any) {
      setSmtpNote({ ok: false, text: `${t('admin.smtpSaved')}. ${localizeError(e, t)}` });
    }
    setSaving(null);
  };

  // Probar el formulario sin guardarlo: solo la conexión, o además enviar el correo de prueba
  const runSmtpTest = async (send: boolean) => {
    setTesting(send ? 'send' : 'check');
    setSmtpNote(null);
    setSmtpResult(null);
    try {
      setSmtpResult(await testSmtpConfig({ ...smtpForm(), send, to: testTo.trim() }));
    } catch (e: any) {
      setSmtpNote({ ok: false, text: localizeError(e, t) });
    }
    setTesting(null);
  };
  const smtpBusy = saving === 'smtp' || testing !== null;

  if (loading) return <div className="loading">{t('common.loading')}</div>;

  return (
    <div className="adm-stack">
      <div className="admin-section">
        <h3 className="h3-icon"><IconLock size={18} />Google OAuth</h3>
        <p className="hint">
          {t('admin.oauthHintA')}{' '}
          <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud Console</a>.
          {' '}{t('admin.oauthHintB')} <code>{redirectUri || window.location.origin + '/api/auth/google/callback'}</code>
        </p>
        <div className="auth-form">
          <label>Client ID</label>
          <input type="text" value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Google OAuth Client ID" />
          <label>Client Secret</label>
          <input type="password" value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder="Google OAuth Client Secret" />
          <label>Redirect URI</label>
          <input type="text" value={redirectUri} onChange={e => setRedirectUri(e.target.value)} placeholder="https://peculio.cabrasky.net/api/auth/google/callback" />
          <label className="checkbox-label">
            <input type="checkbox" checked={oauthEnabled} onChange={e => setOauthEnabled(e.target.checked)} />
            {' '}{t('admin.oauthEnabled')}
          </label>
          <button className="btn primary" onClick={handleSaveOAuth} disabled={saving === 'oauth'}>
            {saving === 'oauth' ? t('common.saving') : t('admin.saveOauth')}
          </button>
        </div>
      </div>

      <div className="admin-section">
        <h3 className="h3-icon"><IconMail size={18} />{t('admin.smtpTitle')}</h3>
        <p className="hint">
          {t('admin.smtpHint')}
        </p>
        <div className="auth-form">
          <label>Host</label>
          <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="mail.cabrasky.net" />
          <label>{t('admin.port')}</label>
          <input type="number" value={smtpPort} onChange={e => setSmtpPort(Number(e.target.value))} placeholder="587" />
          <label>{t('admin.user')}</label>
          <input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="gastos@cabrasky.net" />
          <label>{t('auth.password')} {smtpPasswordSet && <span className="hint">{t('admin.passwordSet')}</span>}</label>
          <input type="password" value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} placeholder={smtpPasswordSet ? t('admin.passwordKeepPh') : t('admin.smtpPasswordPh')} />
          <label>{t('admin.fromEmail')}</label>
          <input type="email" value={smtpFromEmail} onChange={e => setSmtpFromEmail(e.target.value)} placeholder="gastos@cabrasky.net" />
          <label>{t('admin.fromName')}</label>
          <input type="text" value={smtpFromName} onChange={e => setSmtpFromName(e.target.value)} placeholder="Peculio" />
          <div className="adm-actions">
            <button className="btn primary" onClick={handleSaveSmtp} disabled={smtpBusy}>
              {saving === 'smtp' ? t('admin.smtpSavingTesting') : t('admin.saveSmtp')}
            </button>
            <button type="button" className="btn outline" onClick={() => runSmtpTest(false)} disabled={smtpBusy}>
              <IconServer size={15} />{testing === 'check' ? t('admin.smtpTesting') : t('admin.smtpTest')}
            </button>
          </div>
          <label htmlFor="smtp-test-to">{t('admin.smtpTestTo')}</label>
          <div className="smtp-send-row">
            <input id="smtp-test-to" type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder={user?.email} />
            <button type="button" className="btn outline" onClick={() => runSmtpTest(true)} disabled={smtpBusy}>
              <IconSend size={15} />{testing === 'send' ? t('admin.smtpSending') : t('admin.sendTest')}
            </button>
          </div>
          {smtpNote && (
            <p className={`msg-line ${smtpNote.ok ? 'success' : 'error'}`}>
              {smtpNote.ok ? <IconCheckCircle size={16} /> : <IconAlertCircle size={16} />}{smtpNote.text}
            </p>
          )}
          {smtpResult && <SmtpReport result={smtpResult} />}
        </div>
      </div>

      {msg && <p className={`msg-line ${msg.ok ? 'success' : 'error'}`}>{msg.ok ? <IconCheckCircle size={16} /> : <IconAlertCircle size={16} />}{msg.text}</p>}
    </div>
  );
}
