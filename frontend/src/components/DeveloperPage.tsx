/* ── Desarrollador: API keys y acceso programático ─────────────────────────── */
import { useEffect, useState, useCallback } from 'react';
import {
  apiGetDeveloperStatus, apiToggleDeveloper,
  apiListApiKeys, apiCreateApiKey, apiRevokeApiKey,
  type ApiKeyItem,
} from '../api';
import { useLocale, localizeError, fill, LOCALE_TAG } from '../i18n';
import RichText from './RichText';
import { blockedInDemo } from '../demo';

const B = { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 22px', background: 'var(--surface)', marginBottom: 16 };
const H = { margin: '0 0 10px', fontSize: 16, fontWeight: 800 } as const;
const P = { lineHeight: 1.7, fontSize: 14, color: 'var(--text)' } as const;
const CODE: React.CSSProperties = {
  display: 'block', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 12, fontSize: 12.5, fontFamily: 'ui-monospace, monospace',
  overflowX: 'auto', whiteSpace: 'pre', margin: '6px 0 12px',
};

const BASE = 'https://peculio.cabrasky.net/api';

export default function DeveloperPage() {
  const { t, locale } = useLocale();
  const [isDev, setIsDev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newName, setNewName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const st = await apiGetDeveloperStatus();
      setIsDev(st.is_developer);
      if (st.is_developer) setKeys(await apiListApiKeys());
    } catch (e: any) {
      setError(localizeError(e, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (blockedInDemo()) return;
    setBusy(true); setError(null);
    try {
      const st = await apiToggleDeveloper();
      setIsDev(st.is_developer);
      if (st.is_developer) setKeys(await apiListApiKeys());
    } catch (e: any) { setError(localizeError(e, t)); }
    finally { setBusy(false); }
  };

  const create = async () => {
    if (blockedInDemo()) return;
    setBusy(true); setError(null); setCreatedKey(null);
    try {
      const created = await apiCreateApiKey(newName);
      setCreatedKey(created.key);
      setNewName('');
      setKeys(await apiListApiKeys());
    } catch (e: any) { setError(localizeError(e, t)); }
    finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm(t('dev.confirmRevoke'))) return;
    setBusy(true); setError(null);
    try {
      await apiRevokeApiKey(id);
      setKeys(await apiListApiKeys());
    } catch (e: any) { setError(localizeError(e, t)); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="loading-spinner" />;

  return (
    <div style={{ maxWidth: 720 }}>
      <section style={B}>
        <h2 style={H}>{t('dev.title')}</h2>
        <p style={P}><RichText text={t('dev.intro')} /></p>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`btn ${isDev ? 'danger' : 'primary'}`}
        >
          {isDev ? t('dev.disable') : t('dev.enable')}
        </button>
      </section>

      {!isDev ? (
        <section style={B}>
          <p style={P}>{t('dev.enableHint')}</p>
        </section>
      ) : (
        <>
          <section style={B}>
            <h2 style={H}>{t('dev.keys')}</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('dev.namePh')}
                style={{ flex: 1, height: 44, padding: '0 14px', borderRadius: 14, border: '1px solid var(--border-strong)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font)' }}
              />
              <button type="button" onClick={create} disabled={busy} className="btn primary">
                {t('common.create')}
              </button>
            </div>

            {createdKey && (
              <div style={{ border: '1px solid var(--warn-tile-border)', borderRadius: 14, padding: 14, background: 'var(--warn-tile-bg)', color: 'var(--warn-ink)', marginBottom: 12 }}>
                <b style={{ fontSize: 13.5 }}>{t('dev.saveNow')}</b>
                <code style={{ ...CODE, wordBreak: 'break-all', whiteSpace: 'normal' }}>{createdKey}</code>
              </div>
            )}

            {keys.length === 0 && !createdKey && (
              <p style={P}>{t('dev.noKeys')}</p>
            )}

            {keys.map((k) => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{k.name || t('dev.unnamed')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <code>{k.prefix}…</code>
                    {' · '}{k.revoked ? t('dev.revoked') : k.last_used_at ? fill(t('dev.usedOn'), { d: new Date(k.last_used_at).toLocaleDateString(LOCALE_TAG[locale]) }) : t('dev.unused')}
                  </div>
                </div>
                {!k.revoked && (
                  <button type="button" onClick={() => revoke(k.id)} disabled={busy} className="btn sm danger">
                    {t('dev.revoke')}
                  </button>
                )}
              </div>
            ))}
          </section>

          <section style={B}>
            <h2 style={H}>{t('dev.howTo')}</h2>
            <p style={P}>{t('dev.headerA')} <code>X-API-Key</code> {t('dev.headerB')} <code>{BASE}</code>.</p>

            <p style={{ ...P, fontWeight: 700 }}>{t('dev.addExpense')}</p>
            <code style={CODE}>{`curl -X POST ${BASE}/expenses \\
  -H "X-API-Key: mb_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"date":"2026-09-17","description":"Cine","amount":15.90}'`}</code>

            <p style={{ ...P, fontWeight: 700 }}>{t('dev.monthExpenses')}</p>
            <code style={CODE}>{`curl -H "X-API-Key: mb_live_..." \\
  "${BASE}/expenses?month=9&year=2026"`}</code>

            <p style={{ ...P, fontWeight: 700 }}>{t('dev.others')}</p>
            <code style={CODE}>{`curl -H "X-API-Key: mb_live_..." "${BASE}/incomes"
curl -H "X-API-Key: mb_live_..." "${BASE}/goals"
curl -H "X-API-Key: mb_live_..." "${BASE}/subscriptions"`}</code>

            <p style={P}>{t('dev.endpointsA')} <code>expenses</code>, <code>incomes</code>, <code>goals</code>, <code>subscriptions</code>, <code>projects</code>, <code>categories</code> {t('dev.endpointsB')} <code>docs/API.md</code> {t('dev.endpointsC')}</p>
          </section>
        </>
      )}

      {error && <p style={{ ...P, color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
