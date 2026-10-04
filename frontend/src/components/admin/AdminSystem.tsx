/* ── Admin · Sistema: estado de los servicios, versiones y errores recientes ─ */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminSystem, adminTestEmail, apkLatest, type AdminSystem as SystemInfo, type ApkLatest } from '../../adminApi';
import type { SmtpTestResult } from '../../api';
import SmtpReport from './SmtpReport';
import { useLocale, localizeError, fill } from '../../i18n';
import { IconRefresh, IconMail, IconCheckCircle, IconAlertTriangle, IconXCircle } from '../Icons';
import { fmtAgo, fmtBytes, fmtDate, fmtDateTime } from './format';

type State = 'ok' | 'warn' | 'err';

function Status({ state, children }: { state: State; children: React.ReactNode }) {
  const Icon = state === 'ok' ? IconCheckCircle : state === 'warn' ? IconAlertTriangle : IconXCircle;
  return <span className={`adm-state ${state}`}><Icon size={15} />{children}</span>;
}

export default function AdminSystem() {
  const { t, locale } = useLocale();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [apk, setApk] = useState<ApkLatest | null | 'error'>(null);
  const [, setParams] = useSearchParams();
  const [error, setError] = useState('');
  const [mail, setMail] = useState<SmtpTestResult | null>(null);
  const [mailError, setMailError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    setError('');
    adminSystem().then(setInfo).catch(e => setError(localizeError(e, t)));
    apkLatest().then(setApk).catch(() => setApk('error'));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const testMail = async () => {
    setSending(true); setMail(null); setMailError('');
    try {
      setMail(await adminTestEmail());
    } catch (e) {
      setMailError(localizeError(e, t));
    }
    setSending(false);
  };

  if (error) return <p className="msg-line error">{error}</p>;
  if (!info) return <div className="loading">{t('common.loading')}</div>;

  const cc = info.cuentas_claras;
  const today = new Date().toISOString().slice(0, 10);
  const tables = Object.entries(info.database.tables).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <p className="hint" style={{ margin: 0 }}>{fill(t('admin.sysServedBy'), { host: info.api.host, ago: fmtAgo(info.api.started_at, locale) })}</p>
        <button type="button" className="btn outline sm" onClick={load}><IconRefresh size={14} />{t('admin.refresh')}</button>
      </div>

      <div className="adm-services">
        <section className="card adm-service">
          <h3>API</h3>
          <Status state="ok">{t('admin.sOperational')}</Status>
          <dl className="adm-dl">
            <div><dt>{t('admin.version')}</dt><dd><code>{info.api.version}</code></dd></div>
            <div><dt>Python</dt><dd>{info.api.python}</dd></div>
          </dl>
        </section>

        <section className="card adm-service">
          <h3>{t('admin.sDatabase')}</h3>
          <Status state={info.database.ms > 200 ? 'warn' : 'ok'}>{fill(t('admin.sLatency'), { ms: info.database.ms })}</Status>
          <dl className="adm-dl">
            <div><dt>{t('admin.sEngine')}</dt><dd>{info.database.dialect}</dd></div>
            <div><dt>{t('admin.sSize')}</dt><dd>{fmtBytes(info.database.size_bytes)}</dd></div>
          </dl>
        </section>

        <section className="card adm-service">
          <h3>{t('admin.sMail')}</h3>
          <Status state={info.smtp.configured ? 'ok' : 'warn'}>{t(info.smtp.configured ? 'admin.sConfigured' : 'admin.sNotConfigured')}</Status>
          <dl className="adm-dl">
            <div><dt>{t('admin.sServer')}</dt><dd>{info.smtp.host}:{info.smtp.port}</dd></div>
            <div><dt>{t('admin.fromEmail')}</dt><dd>{info.smtp.from || '—'}</dd></div>
          </dl>
          <button type="button" className="btn outline sm" onClick={testMail} disabled={sending}>
            <IconMail size={14} />{sending ? t('admin.smtpSending') : t('admin.sendTest')}
          </button>
          {mail && <SmtpReport result={mail} />}
          {mailError && <p className="msg-line error">{mailError}</p>}
        </section>

        <section className="card adm-service">
          <h3>Google</h3>
          <Status state={info.google.enabled ? 'ok' : 'warn'}>{t(info.google.enabled ? 'admin.sEnabled' : 'admin.sDisabled')}</Status>
          <p className="hint">{t('admin.sGoogleHint')}</p>
        </section>

        <section className="card adm-service">
          <h3>Cuentas Claras</h3>
          <Status state={cc.ok ? 'ok' : 'err'}>
            {cc.ok ? fill(t('admin.sLatency'), { ms: cc.ms ?? 0 }) : t('admin.sUnreachable')}
          </Status>
          <p className="hint adm-url">{cc.url}{cc.status ? ` · HTTP ${cc.status}` : cc.error ? ` · ${cc.error}` : ''}</p>
        </section>

        <section className="card adm-service">
          <h3>{t('admin.sDemo')}</h3>
          <Status state={!info.demo.enabled ? 'warn' : info.demo.seeded_on === today ? 'ok' : 'warn'}>
            {!info.demo.enabled ? t('admin.sDisabled') : info.demo.seeded_on ? fill(t('admin.sSeeded'), { d: fmtDate(info.demo.seeded_on, locale) }) : t('admin.sNotSeeded')}
          </Status>
          <p className="hint">{info.demo.email}</p>
        </section>

        <section className="card adm-service">
          <h3>{t('admin.sApk')}</h3>
          {apk === null ? <span className="hint">{t('common.loading')}</span> : apk === 'error' ? (
            <Status state="warn">{t('admin.sApkMissing')}</Status>
          ) : (
            <>
              <Status state="ok">v{apk.version}{apk.build_number ? ` · #${apk.build_number}` : ''}</Status>
              <p className="hint">{fill(t('admin.sPublished'), { d: fmtDateTime(apk.published_at, locale) })}</p>
            </>
          )}
          <button type="button" className="link-btn" onClick={() => setParams({ tab: 'apk' })}>{t('apk.manage')}</button>
        </section>
      </div>

      <section className="card">
        <div className="adm-chart-head">
          <h3>{t('admin.errorsTitle')}</h3>
          <span className="hint">{fill(t('admin.errorsSub'), { d: info.errors.last_24h, w: info.errors.last_7d })}</span>
        </div>
        {info.errors.recent.length === 0 ? (
          <p className="adm-state ok"><IconCheckCircle size={15} />{t('admin.noErrors')}</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table adm-errors">
              <thead><tr><th>{t('admin.when')}</th><th>{t('admin.request')}</th><th>{t('admin.error')}</th></tr></thead>
              <tbody>
                {info.errors.recent.map(e => (
                  <tr key={`${e.request_id}-${e.created_at}`}>
                    <td title={fmtDateTime(e.created_at, locale)}>{fmtAgo(e.created_at, locale)}</td>
                    <td><span className="adm-status closed">{e.status}</span> <code>{e.method} {e.path}</code></td>
                    <td><b>{e.error_type}</b>{e.message ? `: ${e.message}` : ''}<code className="adm-reqid">{e.request_id}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="card adm-table-details">
        <summary>{t('admin.tables')}</summary>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>{t('admin.table')}</th><th className="num">{t('admin.rows')}</th></tr></thead>
            <tbody>
              {tables.map(([name, n]) => <tr key={name}><td><code>{name}</code></td><td className="num">{n ?? '—'}</td></tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
