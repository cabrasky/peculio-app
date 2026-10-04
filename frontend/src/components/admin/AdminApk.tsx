/* ── Admin · App Android: repositorio de versiones y build servida ──────────
   Jenkins sube cada build al repositorio (ya no se publica sola); aquí se elige
   cuál sirve la web (portada y aviso de actualización de la app) y se pueden
   subir APKs a mano. Las descargas se cuentan por build. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApkDelete, adminApkRepo, adminApkServe, adminApkUpdate, adminApkUpload, type ApkBuild, type ApkRepo } from '../../adminApi';
import { useLocale, localizeError, fill, LOCALE_TAG } from '../../i18n';
import { IconDownload, IconCheckCircle, IconAlertCircle, IconAlertTriangle, IconEdit, IconTrash, IconX } from '../Icons';
import { fmtBytes, fmtDateTime } from './format';

const REPO_URL = 'https://github.com/cabrasky/peculio-mobile/commit/';
const VERSION_IN_NAME = /(\d+\.\d+(?:\.\d+){0,2})/;

type Msg = { ok: boolean; text: string } | null;

export default function AdminApk() {
  const { t, locale } = useLocale();
  const [repo, setRepo] = useState<ApkRepo | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<ApkBuild | null>(null);

  const load = useCallback(() => {
    adminApkRepo().then(setRepo).catch(e => setError(localizeError(e, t)));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  const serve = async (b: ApkBuild) => {
    if (!confirm(fill(t('apk.confirmServe'), { v: b.version, b: b.build_number || b.commit || '—' }))) return;
    setBusy(b.id); setMsg(null);
    try {
      await adminApkServe(b.id);
      setMsg({ ok: true, text: fill(t('apk.served'), { v: b.version }) });
      load();
    } catch (e) {
      setMsg({ ok: false, text: localizeError(e, t) });
    }
    setBusy('');
  };

  const remove = async (b: ApkBuild) => {
    if (!confirm(fill(t('apk.confirmDelete'), { v: b.version || '?', b: b.build_number || b.commit || b.file }))) return;
    setBusy(`delete:${b.id}`); setMsg(null);
    try {
      await adminApkDelete(b.id);
      setMsg({ ok: true, text: fill(t('apk.deleted'), { v: b.version || '?' }) });
      load();
    } catch (e) {
      setMsg({ ok: false, text: localizeError(e, t) });
    }
    setBusy('');
  };

  if (error) return <p className="msg-line error">{error}</p>;
  if (!repo) return <div className="loading">{t('common.loading')}</div>;

  const served = repo.builds.find(b => b.served) || null;
  const source = (b: ApkBuild) => t(`apk.src_${b.source}`);

  return (
    <div className="adm-stack">
      {!repo.storage_ok && <p className="msg-line error"><IconAlertCircle size={16} />{t('apk.noStorage')}</p>}

      <section className="card">
        <div className="adm-chart-head"><h3>{t('apk.servedTitle')}</h3><span className="hint">{t('apk.servedHint')}</span></div>
        {served ? (
          <div className="apk-served">
            <div>
              <div className="apk-version">v{served.version}</div>
              <div className="hint">
                {served.build_number ? `#${served.build_number} · ` : ''}{served.commit ? <a href={REPO_URL + served.commit} target="_blank" rel="noopener noreferrer"><code>{served.commit}</code></a> : source(served)}
                {' · '}{fmtDateTime(served.uploaded_at, locale)} · {fill(t('apk.nDownloads'), { n: served.downloads.toLocaleString(LOCALE_TAG[locale]) })}
              </div>
              {served.notes && <p className="apk-notes">{served.notes}</p>}
            </div>
            <div className="row-actions">
              <a className="btn outline sm" href={served.file_url} download><IconDownload size={14} />{t('apk.download')}</a>
              <button type="button" className="btn outline sm" onClick={() => setEditing(served)}><IconEdit size={14} />{t('apk.editNotes')}</button>
            </div>
          </div>
        ) : <p className="hint">{t('apk.noneServed')}</p>}
      </section>

      <UploadCard repo={repo} onDone={(text) => { setMsg({ ok: true, text }); load(); }} />

      <section className="card">
        <div className="adm-chart-head"><h3>{t('apk.repoTitle')}</h3><span className="hint">{fill(t('apk.nBuilds'), { n: repo.builds.length })}</span></div>
        <p className="hint apk-warning"><IconAlertTriangle size={14} />{t('apk.downgradeHint')}</p>
        {msg && <p className={`msg-line ${msg.ok ? 'success' : 'error'}`}>{msg.ok ? <IconCheckCircle size={16} /> : <IconAlertCircle size={16} />}{msg.text}</p>}
        <div className="adm-table-wrap">
          <table className="adm-table apk-table">
            <thead>
              <tr>
                <th>{t('apk.version')}</th>
                <th>{t('apk.build')}</th>
                <th>{t('apk.uploaded')}</th>
                <th className="num">{t('apk.size')}</th>
                <th className="num">{t('apk.downloads')}</th>
                <th>{t('apk.notes')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {repo.builds.map(b => (
                <tr key={b.id} className={b.served ? 'apk-row-served' : undefined}>
                  <td data-label={t('apk.version')}>
                    <b>v{b.version || '?'}</b>
                    <span className="adm-chips">
                      {b.served && <span className="adm-chip brand">{t('apk.chipServed')}</span>}
                      <span className="adm-chip">{source(b)}</span>
                      {b.missing && <span className="adm-chip danger">{t('apk.chipMissing')}</span>}
                    </span>
                  </td>
                  <td data-label={t('apk.build')}>
                    {b.build_number && <span>#{b.build_number} </span>}
                    {b.commit ? <a href={REPO_URL + b.commit} target="_blank" rel="noopener noreferrer"><code>{b.commit}</code></a> : <span className="hint">—</span>}
                    {b.version_code ? <div className="hint">{fill(t('apk.code'), { c: b.version_code })}</div> : null}
                  </td>
                  <td data-label={t('apk.uploaded')}>
                    {fmtDateTime(b.uploaded_at, locale)}
                    {b.uploaded_by && <div className="hint">{b.uploaded_by}</div>}
                  </td>
                  <td data-label={t('apk.size')} className="num">{fmtBytes(b.size)}</td>
                  <td data-label={t('apk.downloads')} className="num">{b.downloads.toLocaleString(LOCALE_TAG[locale])}</td>
                  <td data-label={t('apk.notes')} className="apk-notes-cell">
                    <span>{b.notes || <span className="hint">—</span>}</span>
                    <button type="button" className="link-btn" onClick={() => setEditing(b)} aria-label={t('apk.editNotes')}><IconEdit size={13} /></button>
                  </td>
                  <td className="apk-actions">
                    {!b.served && !b.missing && (
                      <button type="button" className="btn primary sm" disabled={!!busy} onClick={() => serve(b)}>
                        {busy === b.id ? t('common.saving') : t('apk.serve')}
                      </button>
                    )}
                    {!b.missing && <a className="btn outline sm" href={b.file_url} download aria-label={t('apk.download')}><IconDownload size={14} /></a>}
                    {!b.served && (
                      <button type="button" className="btn danger sm" disabled={!!busy} onClick={() => remove(b)}
                        aria-label={t('apk.delete')} title={t('apk.delete')}>
                        <IconTrash size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {repo.builds.length === 0 && <tr><td colSpan={7} className="hint">{t('apk.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <NotesModal build={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setMsg({ ok: true, text: t('apk.notesSaved') }); load(); }} />
      )}
    </div>
  );
}

function UploadCard({ repo, onDone }: { repo: ApkRepo; onDone: (text: string) => void }) {
  const { t } = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const [serveNow, setServeNow] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setFile(f); setError('');
    const m = f ? VERSION_IN_NAME.exec(f.name) : null;
    if (m && !version) setVersion(m[1]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    if (file.size > repo.max_bytes) { setError(fill(t('apk.tooBig'), { mb: Math.round(repo.max_bytes / 1048576) })); return; }
    setError(''); setProgress(0);
    try {
      const b = await adminApkUpload(file, {
        version: version.trim(), notes: notes.trim(), ...(code.trim() ? { version_code: Number(code) } : {}),
      }, serveNow, (sent, total) => setProgress(sent / total));
      setFile(null); setVersion(''); setCode(''); setNotes(''); setServeNow(false);
      if (fileRef.current) fileRef.current.value = '';
      onDone(fill(t(b.served ? 'apk.uploadedServed' : 'apk.uploadedOk'), { v: b.version }));
    } catch (err) {
      setError(localizeError(err, t));
    }
    setProgress(null);
  };

  const uploading = progress !== null;
  const validVersion = /^\d+(\.\d+){0,3}([-+][0-9A-Za-z.]+)?$/.test(version.trim());

  return (
    <section className="card">
      <div className="adm-chart-head"><h3>{t('apk.uploadTitle')}</h3><span className="hint">{t('apk.uploadHint')}</span></div>
      <form className="apk-upload" onSubmit={submit}>
        <div className="form-group apk-file">
          <label htmlFor="apk-file">{t('apk.file')}</label>
          <input id="apk-file" ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive" disabled={uploading}
            onChange={e => pick(e.target.files?.[0] || null)} />
        </div>
        <div className="form-group">
          <label htmlFor="apk-version">{t('apk.version')}</label>
          <input id="apk-version" value={version} onChange={e => setVersion(e.target.value)} placeholder="1.3.0" disabled={uploading} />
        </div>
        <div className="form-group">
          <label htmlFor="apk-code">{t('apk.versionCode')}</label>
          <input id="apk-code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder={t('apk.optional')} disabled={uploading} />
        </div>
        <div className="form-group apk-notes-field">
          <label htmlFor="apk-notes">{t('apk.notes')}</label>
          <textarea id="apk-notes" rows={2} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('apk.notesPh')} disabled={uploading} />
        </div>
        <label className="checkbox-label">
          <input type="checkbox" checked={serveNow} onChange={e => setServeNow(e.target.checked)} disabled={uploading} />
          {t('apk.serveNow')}
        </label>
        <div className="apk-upload-actions">
          <button type="submit" className="btn primary" disabled={!file || !validVersion || uploading || !repo.storage_ok}>
            {uploading ? fill(t('apk.uploading'), { p: Math.round((progress || 0) * 100) }) : t('apk.upload')}
          </button>
          {uploading && <progress max={1} value={progress || 0} className="apk-progress" />}
          {file && !uploading && <span className="hint">{file.name} · {fmtBytes(file.size)}</span>}
        </div>
        {error && <p className="msg-line error"><IconAlertCircle size={16} />{error}</p>}
      </form>
    </section>
  );
}

function NotesModal({ build, onClose, onSaved }: { build: ApkBuild; onClose: () => void; onSaved: () => void }) {
  const { t } = useLocale();
  const [notes, setNotes] = useState(build.notes);
  const [code, setCode] = useState(build.version_code ? String(build.version_code) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await adminApkUpdate(build.id, { notes, ...(code && Number(code) !== build.version_code ? { version_code: Number(code) } : {}) });
      onSaved();
    } catch (err) {
      setError(localizeError(err, t));
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="apk-notes-title"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal modal-sm">
        <div className="modal-header">
          <h2 id="apk-notes-title">v{build.version}{build.build_number ? ` · #${build.build_number}` : ''}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}><IconX size={18} /></button>
        </div>
        <form className="modal-body" onSubmit={save}>
          <div className="form-group">
            <label htmlFor="apk-edit-notes">{t('apk.notes')}</label>
            <textarea id="apk-edit-notes" rows={4} maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('apk.notesPh')} autoFocus />
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label htmlFor="apk-edit-code">{t('apk.versionCode')}</label>
            <input id="apk-edit-code" inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder={t('apk.optional')} />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>{t('apk.notesModalHint')}</p>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
            <button type="button" className="btn outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
