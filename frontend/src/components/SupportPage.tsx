/* ── Ayuda y soporte: escribir al admin y seguir tus consultas ───────────────
   Las respuestas llegan también por email. La demo (solo lectura) no puede enviar. */
import { useCallback, useEffect, useState } from 'react';
import { supportCreate, supportList, supportReply, type SupportTicket, type TicketCategory } from '../adminApi';
import { useLocale, localizeError } from '../i18n';
import { blockedInDemo } from '../demo';
import RichText from './RichText';
import { IconLifeBuoy, IconSend, IconCheckCircle, IconAlertCircle } from './Icons';
import { fmtDateTime } from './admin/format';

const CATEGORIES: TicketCategory[] = ['problem', 'question', 'suggestion'];

export default function SupportPage() {
  const { t } = useLocale();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [category, setCategory] = useState<TicketCategory>('problem');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    supportList().then(setTickets).catch(e => setMsg({ ok: false, text: localizeError(e, t) }));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blockedInDemo()) return;
    setBusy(true); setMsg(null);
    try {
      const tk = await supportCreate({ subject: subject.trim(), category, body: body.trim() });
      setSubject(''); setBody('');
      setMsg({ ok: true, text: t('support.sent') });
      setOpenId(tk.id);
      load();
    } catch (err) {
      setMsg({ ok: false, text: localizeError(err, t) });
    }
    setBusy(false);
  };

  const valid = subject.trim().length >= 3 && body.trim().length >= 5;

  return (
    <div className="support-page">
      <section className="admin-section">
        <h3 className="h3-icon"><IconLifeBuoy size={18} />{t('support.newTitle')}</h3>
        <p className="hint"><RichText text={t('support.intro')} /></p>
        <form onSubmit={submit} className="support-form">
          <div className="adm-seg" role="group" aria-label={t('support.category')}>
            {CATEGORIES.map(c => (
              <button key={c} type="button" className={category === c ? 'active' : undefined} aria-pressed={category === c} onClick={() => setCategory(c)}>
                {t(`support.cat_${c}`)}
              </button>
            ))}
          </div>
          <div className="form-group">
            <label htmlFor="sp-subject">{t('support.subject')}</label>
            <input id="sp-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={120} placeholder={t('support.subjectPh')} />
          </div>
          <div className="form-group">
            <label htmlFor="sp-body">{t('support.message')}</label>
            <textarea id="sp-body" value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={4000} placeholder={t('support.messagePh')} />
          </div>
          <div>
            <button type="submit" className="btn primary" disabled={busy || !valid}><IconSend size={16} />{busy ? t('support.sending') : t('support.send')}</button>
          </div>
          {msg && <p className={`msg-line ${msg.ok ? 'success' : 'error'}`}>{msg.ok ? <IconCheckCircle size={16} /> : <IconAlertCircle size={16} />}{msg.text}</p>}
        </form>
      </section>

      <section className="admin-section">
        <h3>{t('support.mine')}</h3>
        {!tickets ? <div className="loading">{t('common.loading')}</div> : tickets.length === 0 ? (
          <p className="hint">{t('support.none')}</p>
        ) : (
          <ul className="support-list">
            {tickets.map(tk => (
              <li key={tk.id} className={openId === tk.id ? 'open' : undefined}>
                <button type="button" className="support-item" onClick={() => setOpenId(openId === tk.id ? null : tk.id)} aria-expanded={openId === tk.id}>
                  <b>{tk.subject}</b>
                  <span className={`adm-status ${tk.status}`}>{t(`support.status_${tk.status}`)}</span>
                </button>
                {openId === tk.id && <Thread ticket={tk} onUpdated={next => setTickets(list => list?.map(x => (x.id === next.id ? next : x)) ?? null)} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Thread({ ticket, onUpdated }: { ticket: SupportTicket; onUpdated: (t: SupportTicket) => void }) {
  const { t, locale } = useLocale();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim() || blockedInDemo()) return;
    setBusy(true); setError('');
    try {
      onUpdated(await supportReply(ticket.id, reply.trim()));
      setReply('');
    } catch (err) {
      setError(localizeError(err, t));
    }
    setBusy(false);
  };

  return (
    <div className="support-thread">
      <ol className="adm-messages">
        {ticket.messages.map(m => (
          <li key={m.id} className={m.author === 'user' ? 'mine' : 'theirs'}>
            <div className="adm-bubble">{m.body}</div>
            <span className="adm-msg-meta">{m.author === 'admin' ? t('support.team') : t('admin.you')} · {fmtDateTime(m.created_at, locale)}</span>
          </li>
        ))}
      </ol>
      <form className="adm-reply" onSubmit={send}>
        <textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} maxLength={4000}
          placeholder={t('support.replyPh')} aria-label={t('support.replyPh')} />
        <div className="adm-reply-actions">
          <button type="submit" className="btn primary sm" disabled={busy || !reply.trim()}><IconSend size={14} />{t('support.reply')}</button>
        </div>
      </form>
      {error && <p className="msg-line error">{error}</p>}
    </div>
  );
}
