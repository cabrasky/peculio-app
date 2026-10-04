/* ── Admin · Soporte: consultas de los usuarios ─────────────────────────────
   Lista (abiertas primero) + hilo. Responder deja la consulta «respondida» y le
   llega al usuario por email. La consulta abierta va en la URL (?ticket=…). */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  adminTickets, adminTicket, adminReply, adminSetTicketOpen,
  type AdminTicketRow, type SupportTicket, type TicketStatus,
} from '../../adminApi';
import { useLocale, localizeError, fill } from '../../i18n';
import { IconArrowLeft, IconSend, IconSmartphone, IconMonitor, IconCheckCircle, IconAlertCircle } from '../Icons';
import { fmtAgo, fmtDateTime } from './format';

const FILTERS: ('' | TicketStatus)[] = ['open', 'answered', 'closed', ''];

export default function AdminSupport() {
  const { t, locale } = useLocale();
  const [params, setParams] = useSearchParams();
  const selected = params.get('ticket');
  const [status, setStatus] = useState<'' | TicketStatus>('open');
  const [rows, setRows] = useState<AdminTicketRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    adminTickets(status).then(setRows).catch(e => setError(localizeError(e, t)));
  }, [status, t]);
  useEffect(() => { load(); }, [load]);

  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('ticket', id); else next.delete('ticket');
    setParams(next);
  };

  return (
    <div className={`adm-support${selected ? ' has-thread' : ''}`}>
      <div className="adm-support-list">
        <div className="adm-seg adm-seg-wrap" role="group" aria-label={t('admin.filterStatus')}>
          {FILTERS.map(f => (
            <button key={f || 'all'} type="button" className={status === f ? 'active' : undefined} aria-pressed={status === f} onClick={() => setStatus(f)}>
              {t(f ? `support.status_${f}` : 'admin.all')}
            </button>
          ))}
        </div>
        {error && <p className="msg-line error">{error}</p>}
        {!rows ? <div className="loading">{t('common.loading')}</div> : rows.length === 0 ? (
          <p className="hint adm-empty">{t('admin.noTickets')}</p>
        ) : (
          <ul className="adm-ticket-list">
            {rows.map(r => (
              <li key={r.id}>
                <button type="button" className={selected === r.id ? 'active' : undefined} onClick={() => select(r.id)}>
                  <span className="adm-ticket-top">
                    <b>{r.subject}</b>
                    <span className={`adm-status ${r.status}`}>{t(`support.status_${r.status}`)}</span>
                  </span>
                  <span className="adm-ticket-preview">{r.last_author === 'admin' ? `${t('admin.you')}: ` : ''}{r.preview}</span>
                  <span className="adm-ticket-meta">
                    {r.platform === 'android' ? <IconSmartphone size={12} /> : <IconMonitor size={12} />}
                    {r.user.name || r.user.email} · {fmtAgo(r.updated_at, locale)} · {fill(t('admin.nMessages'), { n: r.messages })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="adm-support-thread">
        {selected ? <Thread id={selected} onBack={() => select(null)} onChanged={load} /> : (
          <p className="hint adm-empty">{t('admin.pickTicket')}</p>
        )}
      </div>
    </div>
  );
}

function Thread({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const { t, locale } = useLocale();
  const [tk, setTk] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setTk(null); setMsg(null); setReply('');
    adminTicket(id).then(setTk).catch(e => setMsg({ ok: false, text: localizeError(e, t) }));
  }, [id, t]);

  const act = async (fn: () => Promise<SupportTicket>, ok?: (r: SupportTicket) => string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fn();
      setTk(r);
      if (ok) setMsg({ ok: true, text: ok(r) });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: localizeError(e, t) });
    }
    setBusy(false);
  };

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    act(() => adminReply(id, reply.trim()), r => { setReply(''); return t(r.emailed ? 'admin.replySentEmail' : 'admin.replySentNoEmail'); });
  };

  if (!tk) return msg ? <p className="msg-line error">{msg.text}</p> : <div className="loading">{t('common.loading')}</div>;

  return (
    <div className="adm-thread">
      <div className="adm-thread-head">
        <button type="button" className="back-btn adm-thread-back" onClick={onBack} aria-label={t('common.back')}><IconArrowLeft size={16} /></button>
        <div>
          <h3>{tk.subject}</h3>
          <p className="hint">
            {tk.user?.name} · <a href={`mailto:${tk.user?.email}`}>{tk.user?.email}</a> · {t(`support.cat_${tk.category}`)} ·{' '}
            {tk.platform === 'android' ? `Android${tk.app_version ? ` ${tk.app_version}` : ''}` : 'Web'}
          </p>
        </div>
        <span className={`adm-status ${tk.status}`}>{t(`support.status_${tk.status}`)}</span>
      </div>

      <ol className="adm-messages">
        {tk.messages.map(m => (
          <li key={m.id} className={m.author === 'admin' ? 'mine' : 'theirs'}>
            <div className="adm-bubble">{m.body}</div>
            <span className="adm-msg-meta">{m.author === 'admin' ? t('admin.you') : tk.user?.name} · {fmtDateTime(m.created_at, locale)}</span>
          </li>
        ))}
      </ol>

      <form className="adm-reply" onSubmit={send}>
        <textarea value={reply} onChange={e => setReply(e.target.value)} rows={4} maxLength={4000}
          placeholder={t('admin.replyPh')} aria-label={t('admin.replyPh')} />
        <div className="adm-reply-actions">
          <button type="submit" className="btn primary sm" disabled={busy || !reply.trim()}><IconSend size={14} />{t('admin.replySend')}</button>
          {tk.status === 'closed' ? (
            <button type="button" className="btn outline sm" disabled={busy} onClick={() => act(() => adminSetTicketOpen(id, true))}>{t('admin.reopen')}</button>
          ) : (
            <button type="button" className="btn outline sm" disabled={busy} onClick={() => act(() => adminSetTicketOpen(id, false))}>{t('admin.close')}</button>
          )}
        </div>
      </form>
      {msg && <p className={`msg-line ${msg.ok ? 'success' : 'error'}`}>{msg.ok ? <IconCheckCircle size={16} /> : <IconAlertCircle size={16} />}{msg.text}</p>}
    </div>
  );
}
