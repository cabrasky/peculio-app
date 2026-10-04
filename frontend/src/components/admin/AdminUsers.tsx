/* ── Admin · Usuarios: lista, detalle y acciones ────────────────────────────
   Solo datos de cuenta y cuántos registros tiene cada uno, nunca su contenido.
   La cuenta demo y la propia no admiten acciones (el backend también lo impide). */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import {
  adminUsers, adminUser, adminSetSuspended, adminSetAdmin, adminPasswordReset, adminDeleteUser,
  RECORD_KINDS, type AdminUser, type AdminUserDetail,
} from '../../adminApi';
import { useLocale, localizeError, fill } from '../../i18n';
import { IconSearch, IconX, IconMail, IconShield, IconLock, IconTrash, IconCheckCircle, IconAlertCircle } from '../Icons';
import { fmtAgo, fmtDate, fmtDateTime } from './format';
import { KIND_LABEL } from './labels';

const SORTS = ['created', 'last_login', 'records', 'name'] as const;

function Chips({ u }: { u: AdminUser }) {
  const { t } = useLocale();
  return (
    <span className="adm-chips">
      {u.is_demo && <span className="adm-chip">{t('admin.chipDemo')}</span>}
      {u.is_admin && <span className="adm-chip brand">{t('admin.chipAdmin')}</span>}
      {u.suspended_at && <span className="adm-chip danger">{t('admin.chipSuspended')}</span>}
      {u.is_developer && <span className="adm-chip">{t('admin.chipDev')}</span>}
      {u.providers.includes('google') && <span className="adm-chip">Google</span>}
      {u.mobile && <span className="adm-chip">{t('admin.chipApp')}</span>}
    </span>
  );
}

export default function AdminUsers() {
  const { t, locale } = useLocale();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<typeof SORTS[number]>('created');
  const [list, setList] = useState<{ total: number; users: AdminUser[] } | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const openId = params.get('user');

  const load = useCallback(() => {
    adminUsers(q.trim(), sort).then(setList).catch(e => setError(localizeError(e, t)));
  }, [q, sort, t]);

  // Búsqueda con una pequeña pausa al teclear
  useEffect(() => {
    const id = window.setTimeout(load, 250);
    return () => window.clearTimeout(id);
  }, [load]);

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('user', id); else next.delete('user');
    setParams(next);
  };

  return (
    <div className="adm-stack">
      <div className="adm-toolbar">
        <label className="xg-search adm-search">
          <IconSearch size={16} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('admin.searchUsers')} aria-label={t('admin.searchUsers')} />
        </label>
        <select value={sort} onChange={e => setSort(e.target.value as typeof SORTS[number])} aria-label={t('admin.sortBy')} className="adm-select">
          {SORTS.map(s => <option key={s} value={s}>{t(`admin.sort_${s}`)}</option>)}
        </select>
        {list && <span className="hint">{fill(t('admin.nUsers'), { n: list.total })}</span>}
      </div>
      {error && <p className="msg-line error"><IconAlertCircle size={16} />{error}</p>}
      {!list ? <div className="loading">{t('common.loading')}</div> : (
        <div className="card adm-table-wrap">
          <table className="adm-table adm-users">
            <thead>
              <tr>
                <th>{t('admin.user')}</th>
                <th>{t('admin.signedUp')}</th>
                <th>{t('admin.lastLogin')}</th>
                <th className="num">{t('admin.records')}</th>
              </tr>
            </thead>
            <tbody>
              {list.users.map(u => (
                <tr key={u.id} className="clickable" tabIndex={0} onClick={() => open(u.id)}
                  onKeyDown={e => { if (e.key === 'Enter') open(u.id); }}>
                  <td>
                    <div className="adm-user">
                      <span className="user-avatar user-avatar-fallback">{(u.name || '?').charAt(0).toUpperCase()}</span>
                      <span className="adm-user-meta">
                        <b>{u.name}</b>
                        <span>{u.email}</span>
                        <Chips u={u} />
                      </span>
                    </div>
                  </td>
                  <td data-label={t('admin.signedUp')}>{fmtDate(u.created_at, locale)}</td>
                  <td data-label={t('admin.lastLogin')} title={fmtDateTime(u.last_login, locale)}>{fmtAgo(u.last_login, locale)}</td>
                  <td data-label={t('admin.records')} className="num">{u.records}</td>
                </tr>
              ))}
              {list.users.length === 0 && <tr><td colSpan={4} className="hint">{t('admin.noUsers')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {openId && <UserDetail id={openId} onClose={() => open(null)} onChanged={load} />}
    </div>
  );
}

function UserDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t, locale } = useLocale();
  const { user: me } = useAuth();
  const [, setParams] = useSearchParams();
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');

  const reload = useCallback(() => {
    adminUser(id).then(setU).catch(e => setMsg({ ok: false, text: localizeError(e, t) }));
  }, [id, t]);
  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async (key: string, confirmText: string | null, action: () => Promise<unknown>, okText: string, after?: () => void) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(key); setMsg(null);
    try {
      await action();
      setMsg({ ok: true, text: okText });
      onChanged();
      if (after) after(); else reload();
    } catch (e) {
      setMsg({ ok: false, text: localizeError(e, t) });
    }
    setBusy('');
  };

  const self = !!u && u.id === me?.id;
  const locked = !!u && (u.is_demo || self);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-user-title"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal adm-detail">
        <div className="modal-header">
          <h2 id="adm-user-title">{u?.name || '…'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}><IconX size={18} /></button>
        </div>
        <div className="modal-body">
          {!u ? <div className="loading">{t('common.loading')}</div> : (
            <>
              <p className="adm-detail-email">{u.email}</p>
              <Chips u={u} />

              <dl className="adm-dl">
                <div><dt>{t('admin.signedUp')}</dt><dd>{fmtDate(u.created_at, locale)}</dd></div>
                <div><dt>{t('admin.lastLogin')}</dt><dd title={fmtDateTime(u.last_login, locale)}>{fmtAgo(u.last_login, locale)}</dd></div>
                <div><dt>{t('admin.providers')}</dt><dd>{u.providers.map(p => (p === 'google' ? 'Google' : t('admin.provEmail'))).join(' · ') || '—'}</dd></div>
                <div><dt>{t('admin.prefs')}</dt><dd>{(u.locale || '—').toUpperCase()} · {u.theme || 'system'}{u.setup_done ? '' : ` · ${t('admin.noSetup')}`}</dd></div>
                <div><dt>{t('admin.apiKeys')}</dt><dd>{u.api_keys.active}{u.api_keys.last_used_at ? ` · ${fmtAgo(u.api_keys.last_used_at, locale)}` : ''}</dd></div>
                {u.suspended_at && <div><dt>{t('admin.suspendedOn')}</dt><dd>{fmtDateTime(u.suspended_at, locale)}</dd></div>}
              </dl>

              <h3 className="adm-sub">{t('admin.records')}</h3>
              <div className="adm-counts">
                {RECORD_KINDS.map(k => <span key={k}><b className="num">{u.counts[k]}</b>{t(KIND_LABEL[k])}</span>)}
                <span><b className="num">{u.counts.photos}</b>{t('admin.fPhotos')}</span>
              </div>
              <p className="hint">{t('admin.privacyNote')}</p>

              {u.tickets.length > 0 && (
                <>
                  <h3 className="adm-sub">{t('admin.tabSupport')}</h3>
                  <ul className="adm-ticket-links">
                    {u.tickets.map(tk => (
                      <li key={tk.id}>
                        <button type="button" className="link-btn" onClick={() => setParams({ tab: 'support', ticket: tk.id })}>{tk.subject}</button>
                        <span className={`adm-status ${tk.status}`}>{t(`support.status_${tk.status}`)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3 className="adm-sub">{t('admin.actions')}</h3>
              {locked ? (
                <p className="hint">{t(u.is_demo ? 'admin.lockedDemo' : 'admin.lockedSelf')}</p>
              ) : (
                <div className="adm-actions">
                  <button type="button" className="btn outline sm" disabled={!!busy}
                    onClick={() => run('reset', fill(t('admin.confirmReset'), { email: u.email }), () => adminPasswordReset(u.id), t('admin.resetSent'))}>
                    <IconMail size={14} />{busy === 'reset' ? t('common.saving') : t('admin.sendReset')}
                  </button>
                  {!u.suspended_at && (
                    <button type="button" className="btn outline sm" disabled={!!busy}
                      onClick={() => run('admin', fill(t(u.is_admin ? 'admin.confirmUnadmin' : 'admin.confirmMakeAdmin'), { name: u.name }),
                        () => adminSetAdmin(u.id, !u.is_admin), t(u.is_admin ? 'admin.unadminDone' : 'admin.makeAdminDone'))}>
                      <IconShield size={14} />{t(u.is_admin ? 'admin.removeAdmin' : 'admin.makeAdmin')}
                    </button>
                  )}
                  {!u.is_admin && (
                    <button type="button" className={`btn sm ${u.suspended_at ? 'outline' : 'danger'}`} disabled={!!busy}
                      onClick={() => run('suspend', fill(t(u.suspended_at ? 'admin.confirmReactivate' : 'admin.confirmSuspend'), { name: u.name }),
                        () => adminSetSuspended(u.id, !u.suspended_at), t(u.suspended_at ? 'admin.reactivated' : 'admin.suspended'))}>
                      <IconLock size={14} />{t(u.suspended_at ? 'admin.reactivate' : 'admin.suspend')}
                    </button>
                  )}
                </div>
              )}

              {!locked && !u.is_admin && (
                <div className="adm-danger">
                  <label htmlFor="adm-del">{fill(t('admin.deleteLabel'), { email: u.email })}</label>
                  <div className="adm-danger-row">
                    <input id="adm-del" type="email" value={confirmDelete} onChange={e => setConfirmDelete(e.target.value)} autoComplete="off" />
                    <button type="button" className="btn danger-solid sm"
                      disabled={!!busy || confirmDelete.trim().toLowerCase() !== u.email.toLowerCase()}
                      onClick={() => run('delete', null, () => adminDeleteUser(u.id, confirmDelete.trim()), t('admin.deleted'), onClose)}>
                      <IconTrash size={14} />{busy === 'delete' ? t('account.deleting') : t('admin.deleteUser')}
                    </button>
                  </div>
                </div>
              )}

              {msg && <p className={`msg-line ${msg.ok ? 'success' : 'error'}`}>{msg.ok ? <IconCheckCircle size={16} /> : <IconAlertCircle size={16} />}{msg.text}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
