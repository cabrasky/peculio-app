import { useRef, useState } from 'react';
import { getToken } from '../api';
import { useLocale, localizeError, fill } from '../i18n';
import { blockedInDemo } from '../demo';

const P = { box: { border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 22px', background: 'var(--surface)', display: 'flex', flexDirection: 'column' as const, gap: 12 } };

export default function ExcelPage({ onImported }: { onImported?: () => void }) {
  const { t } = useLocale();
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = (kind: 'template' | 'export') => {
    const link = document.createElement('a');
    link.href = `/api/excel/${kind}?token=${encodeURIComponent(getToken() || '')}`;
    link.download = ''; document.body.appendChild(link); link.click(); link.remove();
  };

  const importFile = async (file: File) => {
    if (blockedInDemo()) { if (fileRef.current) fileRef.current.value = ''; return; }
    setBusy(true); setMsg({});
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch('/api/excel/import', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Error ${response.status}`);
      setMsg({ ok: data.duplicados
        ? fill(t('excel.importedDup'), { n: data.creados, d: data.duplicados })
        : fill(t('excel.imported'), { n: data.creados }) });
      onImported?.();
    } catch (error) { setMsg({ err: localizeError(error, t) }); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
    <div style={P.box}>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>{t('excel.intro')}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" onClick={() => download('template')}>{t('excel.template')}</button>
        <button type="button" className="btn outline" onClick={() => download('export')}>{t('excel.export')}</button>
        <button type="button" className="btn outline" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? t('excel.importing') : t('excel.import')}</button>
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={e => { const file = e.target.files?.[0]; if (file) importFile(file); }} />
      </div>
      {msg.ok && <div className="success">{msg.ok}</div>}
      {msg.err && <div className="error">{msg.err}</div>}
    </div>
  </div>;
}
