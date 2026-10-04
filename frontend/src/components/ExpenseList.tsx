import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { expenseCost, REF } from '../types';
import type { Expense } from '../types';
import { loadData } from '../store';
import { apiSendToCC, apiUploadExpensePhoto, apiDeleteExpensePhoto, fetchExpensePhotoUrl } from '../api';
import { useLocale, localizeError, LOCALE_TAG, fill, refLabel } from '../i18n';
import { personasOf } from '../personas';
import { catColor } from '../categoryColors';
import { IconSearch, IconEdit, IconFilter, IconArrowUpRight, IconChevronRight, IconX } from './Icons';
import { eurFmt } from '../format';
import { blockedInDemo } from '../demo';

interface Props {
  expenses: Expense[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}

type DebtState = 'pending' | 'settled' | null;

const PAGE = 25;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
// Formateadores ligados al idioma activo
const formatters = (tag: string) => ({
  eur: eurFmt(tag),
  monthLabel: (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return cap(new Date(y, m - 1, 1).toLocaleDateString(tag, { month: 'long', year: 'numeric' }));
  },
  dayLabel: (iso: string, short: boolean) => {
    const [y, m, d] = iso.split('-').map(Number);
    const s = cap(new Date(y, m - 1, d).toLocaleDateString(tag, short
      ? { weekday: 'short', day: 'numeric', month: 'short' }
      : { weekday: 'long', day: 'numeric', month: 'short' }));
    return short ? s.replace(/\./g, '').replace(',', '') : s;
  },
  shortDate: (d: Date) => d.toLocaleDateString(tag, { day: 'numeric', month: 'short' }),
});

function debtState(e: Expense): DebtState {
  const debtors = personasOf(e).filter(p => p.r === 'deb' && p.n.trim());
  if (!debtors.length) return null;
  return debtors.every(p => p.repaid) ? 'settled' : 'pending';
}

export default function ExpenseList({ expenses, onEdit, onDelete, compact = false }: Props) {
  const { t, locale } = useLocale();
  const { eur, monthLabel, dayLabel, shortDate } = formatters(LOCALE_TAG[locale]);
  // En inglés los meses van en mayúscula también dentro de la frase
  const monthInline = (key: string) => (locale === 'en' ? monthLabel(key) : monthLabel(key).toLowerCase());
  const catName = (c: string) => refLabel('categories', c, t);
  const methodName = (m: string) => refLabel('methods', m, t);
  const now = new Date();
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState(monthKey(now));
  const [proj, setProj] = useState('');
  const [method, setMethod] = useState('');
  const [cat, setCat] = useState('');
  const [onlyPending, setOnlyPending] = useState(false);
  const [page, setPage] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [busyCc, setBusyCc] = useState<string | null>(null);
  const [ccRefs, setCcRefs] = useState<Record<string, string>>({});
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const projects = loadData().projects;

  // Cerrar el menú "más acciones" al pulsar fuera
  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuId]);
  useEffect(() => { setPage(0); }, [search, month, proj, method, cat, onlyPending]);

  // ── Resumen (tiles) ──
  const stats = useMemo(() => {
    const thisMonth = monthKey(now);
    const year = String(now.getFullYear());
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const inMonth = expenses.filter(e => e.date.startsWith(thisMonth));
    const inYear = expenses.filter(e => e.date.startsWith(year));
    const inWeek = expenses.filter(e => { const d = new Date(e.date + 'T12:00:00'); return d >= weekAgo && d <= now; });
    const sum = (l: Expense[]) => l.reduce((s, e) => s + expenseCost(e), 0);
    let pendingAmount = 0, pendingPeople = 0;
    expenses.forEach(e => personasOf(e).forEach(p => {
      if (p.r === 'deb' && !p.repaid && p.n.trim()) { pendingAmount += Number(p.m) || 0; pendingPeople++; }
    }));
    const yearTotal = sum(inYear);
    const monthTotal = sum(inMonth);
    return {
      month: monthTotal, monthCount: inMonth.length, monthAvg: inMonth.length ? monthTotal / inMonth.length : 0,
      week: sum(inWeek), weekFrom: weekAgo,
      year: yearTotal, yearCount: inYear.length,
      pendingAmount, pendingPeople,
    };
  }, [expenses]); // eslint-disable-line react-hooks/exhaustive-deps

  const months = useMemo(() => {
    const set = new Set(expenses.map(e => e.date.slice(0, 7)));
    set.add(monthKey(now));
    return [...set].filter(Boolean).sort().reverse();
  }, [expenses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtros base (sin categoría) → para calcular los chips de categoría disponibles
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(e =>
      (!month || e.date.startsWith(month))
      && (!proj || (proj === '__none__' ? !e.proyectoId : e.proyectoId === proj))
      && (!method || e.metodo === method)
      && (!onlyPending || debtState(e) === 'pending')
      && (!q || e.desc.toLowerCase().includes(q) || (e.motivo || '').toLowerCase().includes(q)
        || String(e.amount).includes(q) || e.amount.toFixed(2).replace('.', ',').includes(q)));
  }, [expenses, search, month, proj, method, onlyPending]);

  const cats = useMemo(() => {
    const count = new Map<string, number>();
    base.forEach(e => { if (e.proposito) count.set(e.proposito, (count.get(e.proposito) || 0) + 1); });
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [base]);

  const filtered = useMemo(() => base
    .filter(e => !cat || e.proposito === cat)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')), [base, cat]);

  const total = filtered.reduce((s, e) => s + expenseCost(e), 0);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageItems = compact ? filtered : filtered.slice(page * PAGE, page * PAGE + PAGE);
  const groups = useMemo(() => {
    const out: { date: string; items: Expense[]; total: number }[] = [];
    pageItems.forEach(e => {
      let g = out[out.length - 1];
      if (!g || g.date !== e.date) { g = { date: e.date, items: [], total: 0 }; out.push(g); }
      g.items.push(e); g.total += expenseCost(e);
    });
    return out;
  }, [pageItems]);

  // ── Foto / Cuentas Claras ──
  const closePhoto = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoId(null); setPhotoUrl(null); setPhotoError('');
  };
  const openPhoto = async (expense: Expense) => {
    setPhotoId(expense.id); setPhotoUrl(null); setPhotoError('');
    try { setPhotoUrl((await fetchExpensePhotoUrl(expense.id)).url); }
    catch (error) { setPhotoError(localizeError(error, t)); }
  };
  const uploadPhoto = async (file: File | undefined) => {
    if (!photoId || !file || blockedInDemo()) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setPhotoError(t('error.photoUpload')); return; }
    setPhotoBusy(true); setPhotoError('');
    try {
      await apiUploadExpensePhoto(photoId, file, file.name, file.type);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl((await fetchExpensePhotoUrl(photoId)).url);
    } catch (error) { setPhotoError(localizeError(error, t)); }
    finally { setPhotoBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const deletePhoto = async () => {
    if (!photoId || blockedInDemo()) return;
    setPhotoBusy(true); setPhotoError('');
    try { await apiDeleteExpensePhoto(photoId); closePhoto(); }
    catch (error) { setPhotoError(localizeError(error, t)); }
    finally { setPhotoBusy(false); }
  };
  const pushCc = async (expense: Expense) => {
    if (blockedInDemo()) return;
    setBusyCc(expense.id);
    try { const result = await apiSendToCC(expense.id); setCcRefs(prev => ({ ...prev, [expense.id]: JSON.stringify(result) })); }
    catch (error) { alert(localizeError(error, t)); }
    finally { setBusyCc(null); }
  };
  const ccUrl = (expense: Expense) => {
    try { const v = JSON.parse(ccRefs[expense.id] || expense.ref_cc || ''); return v?.receipt?.url || v?.url || ''; }
    catch { return ''; }
  };
  const hasPeople = (e: Expense) => personasOf(e).some(p => p.n.trim());
  const projectName = (id: string) => projects.find(p => p.id === id)?.name || '';
  const noteOf = (e: Expense) => [e.motivo, e.proyectoId && projectName(e.proyectoId), e.invitacion ? t('expense.invitation') : ''].filter(Boolean).join(' · ');

  const moreMenu = (e: Expense) => menuId === e.id && (
    <div className="xg-menu" role="menu" onClick={ev => ev.stopPropagation()}>
      <button role="menuitem" onClick={() => { setMenuId(null); openPhoto(e); }}>{t('expense.receipt')}</button>
      <button role="menuitem" className="danger" onClick={() => { setMenuId(null); onDelete(e.id); }}>{t('common.delete')}</button>
    </div>
  );
  const moreBtn = (e: Expense) => (
    <button className="xg-icon-btn" aria-label={t('expense.moreActions')} aria-haspopup="menu" aria-expanded={menuId === e.id}
      onClick={ev => { ev.stopPropagation(); setMenuId(menuId === e.id ? null : e.id); }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
    </button>
  );
  const debtBadge = (d: DebtState, small = false) => d === 'pending'
    ? <span className={`xg-badge warn${small ? ' sm' : ''}`}>{!small && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>}{t('expense.debtPending')}</span>
    : d === 'settled'
      ? <span className={`xg-badge ok${small ? ' sm' : ''}`}>{!small && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}{t('expense.debtSettled')}</span>
      : null;

  const selects = (
    <>
      <select className="xg-select" value={month} onChange={e => setMonth(e.target.value)} aria-label={t('common.month')}>
        <option value="">{t('common.allMonths')}</option>
        {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <select className="xg-select" value={proj} onChange={e => setProj(e.target.value)} aria-label={t('expense.project')}>
        <option value="">{t('expense.allProjects')}</option>
        <option value="__none__">{t('expense.noProject')}</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select className="xg-select" value={method} onChange={e => setMethod(e.target.value)} aria-label={t('expense.method')}>
        <option value="">{t('expense.method')}</option>
        {REF.metodos.map(m => <option key={m} value={m}>{methodName(m)}</option>)}
      </select>
    </>
  );
  const chips = (
    <div className="xg-chips" role="group" aria-label={t('expense.filterPurpose')}>
      <button className={`xg-chip${!cat ? ' on' : ''}`} aria-pressed={!cat} onClick={() => setCat('')}>{t('common.all')}</button>
      {cats.map(c => (
        <button key={c} className={`xg-chip ${catColor(c)}${cat === c ? ' on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(cat === c ? '' : c)}>
          <span className="xg-dot" />{catName(c)}
        </button>
      ))}
    </div>
  );
  const pendingCheck = (
    <label className="xg-check">
      <input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />
      {t('expense.onlyPending')}
    </label>
  );
  const photoModal = photoId && (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closePhoto(); }}>
      <div className="modal modal-sm">
        <div className="modal-header"><h2>{t('expense.photoTitle')}</h2><button className="modal-close" onClick={closePhoto} aria-label={t('common.close')}><IconX size={18} /></button></div>
        <div className="modal-body">
          {photoError && <p className="error">{photoError}</p>}
          {photoUrl && <img src={photoUrl} alt={t('expense.photoTitle')} style={{ maxWidth: '100%' }} />}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => uploadPhoto(e.target.files?.[0])} />
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button className="btn sm outline" disabled={photoBusy} onClick={() => fileRef.current?.click()}>{t('expense.uploadPhoto')}</button>
            {photoUrl && <button className="btn sm danger" disabled={photoBusy} onClick={() => deletePhoto()}>{t('expense.deletePhoto')}</button>}
          </div>
        </div>
      </div>
    </div>
  );
  const periodLabel = month ? monthInline(month) : (locale === 'en' ? t('common.allMonths') : t('common.allMonths').toLowerCase());
  const subtitle = `${fill(t(filtered.length === 1 ? 'expense.countOne' : 'expense.countMany'), { n: filtered.length })} · ${periodLabel}`;

  // ─────────── Vista móvil ───────────
  if (compact) {
    return (
      <div className="xg xg-compact">
        <header className="xg-mhead">
          <div className="hero-card xg-mhero">
            <span className="hero-label">{cap(periodLabel)}</span>
            <span className="hero-num">{eur(total)}</span>
            <div className="xg-mhero-row">
              <span className="hero-sub">{fill(t(filtered.length === 1 ? 'expense.nOne' : 'expense.nMany'), { n: filtered.length })}</span>
              <span className="hero-sub">{fill(t('expense.days7'), { v: eur(stats.week) })}</span>
            </div>
          </div>
          <div className="xg-mhead-row">
            {stats.pendingPeople > 0
              ? <Link to="/pending" className="xg-mpending">{t('expense.owed')} <strong className="num">{eur(stats.pendingAmount)}</strong><IconChevronRight size={14} /></Link>
              : <span />}
            <div className="xg-mhead-actions">
              <button className="xg-icon-btn bordered" aria-label={t('common.search')} aria-expanded={showSearch} onClick={() => setShowSearch(v => !v)}><IconSearch size={18} /></button>
              <button className="xg-icon-btn bordered" aria-label={t('expense.filters')} aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)}><IconFilter size={18} /></button>
            </div>
          </div>
          {showSearch && (
            <label className="xg-search">
              <IconSearch size={18} />
              <input type="search" autoFocus placeholder={t('expense.searchPh')} value={search} onChange={e => setSearch(e.target.value)} aria-label={t('expense.searchLabel')} />
            </label>
          )}
          {showFilters && <div className="xg-mfilters">{selects}{pendingCheck}</div>}
          {chips}
        </header>
        {groups.length === 0 && <div className="empty"><IconSearch size={24} /><p>{t('common.noResults')}</p></div>}
        {groups.map(g => (
          <section key={g.date}>
            <div className="xg-mgroup"><span>{dayLabel(g.date, true)}</span><span className="num">{eur(g.total)}</span></div>
            <div className="xg-mcard">
              {g.items.map(e => {
                const d = debtState(e);
                return (
                  <div key={e.id} className="xg-mrow">
                    <button className="xg-mrow-main" onClick={() => onEdit(e.id)}>
                      <span className={`xg-initial ${catColor(e.proposito || e.desc)}`} aria-hidden="true">{(e.proposito || e.desc || '?').charAt(0).toUpperCase()}</span>
                      <span className="xg-mrow-text">
                        <span className="xg-desc">{e.desc}</span>
                        <span className="xg-meta">{[e.proposito && catName(e.proposito), e.metodo && methodName(e.metodo)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="xg-mrow-end">
                        <span className="xg-amount num">{eur(e.amount)}</span>
                        {debtBadge(d, true)}
                      </span>
                    </button>
                    <div className="xg-menu-anchor">{moreBtn(e)}{moreMenu(e)}</div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {photoModal}
      </div>
    );
  }

  // ─────────── Vista escritorio ───────────
  return (
    <div className="xg">
      <div className="xg-title">
        <h1>{t('expense.title')}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="xg-tiles">
        <div className="xg-tile hero">
          <span className="xg-tile-label">{fill(t('expense.spentIn'), { m: monthInline(monthKey(now)) })}</span>
          <span className="xg-tile-value num">{eur(stats.month)}</span>
          <span className="xg-tile-sub">{fill(t(stats.monthCount === 1 ? 'expense.nOne' : 'expense.nMany'), { n: stats.monthCount })} · {fill(t('expense.avgPer'), { v: eur(stats.monthAvg) })}</span>
        </div>
        <div className="xg-tile"><span className="xg-tile-label">{t('expense.last7')}</span><span className="xg-tile-value num">{eur(stats.week)}</span><span className="xg-tile-sub">{fill(t('expense.since'), { d: shortDate(stats.weekFrom) })}</span></div>
        <div className="xg-tile"><span className="xg-tile-label">{t('monthly.totalYear')}</span><span className="xg-tile-value num">{eur(stats.year)}</span><span className="xg-tile-sub">{fill(t(stats.yearCount === 1 ? 'expense.nOne' : 'expense.nMany'), { n: stats.yearCount })}</span></div>
        <div className="xg-tile warn">
          <span className="xg-tile-label">{t('expense.owed')}</span>
          <span className="xg-tile-value num">{eur(stats.pendingAmount)}</span>
          {stats.pendingPeople > 0
            ? <Link to="/pending" className="xg-tile-link">{fill(t('expense.seePending'), { n: stats.pendingPeople })}</Link>
            : <span className="xg-tile-sub">{t('expense.nobodyOwes')}</span>}
        </div>
      </div>

      <section className="xg-card" aria-label={t('expense.list')}>
        <div className="xg-toolbar">
          <div className="xg-toolbar-row">
            <label className="xg-search">
              <IconSearch size={18} />
              <input type="search" placeholder={t('expense.searchPh')} value={search} onChange={e => setSearch(e.target.value)} aria-label={t('expense.searchLabel')} />
            </label>
            {selects}
          </div>
          <div className="xg-toolbar-row between">
            {chips}
            {pendingCheck}
          </div>
        </div>

        <div className="xg-grid xg-head">
          <span aria-hidden="true" /><span>{t('expense.description')}</span><span>{t('expense.purpose')}</span><span>{t('expense.method')}</span><span>{t('expense.debt')}</span><span className="right">{t('expense.amount')}</span><span className="sr-only">{t('common.actions')}</span>
        </div>

        {groups.length === 0 && <div className="empty"><IconSearch size={24} /><p>{t('common.noResults')}</p></div>}
        {groups.map(g => (
          <div key={g.date}>
            <div className="xg-group"><span>{dayLabel(g.date, false)}</span><span className="num">{eur(g.total)}</span></div>
            {g.items.map(e => {
              const d = debtState(e);
              const note = noteOf(e);
              const url = ccUrl(e);
              const own = expenseCost(e);
              return (
                <div key={e.id} className="xg-grid xg-row">
                  <span className={`xg-initial ${catColor(e.proposito || e.desc)}`} aria-hidden="true">{(e.proposito || e.desc || '?').charAt(0).toUpperCase()}</span>
                  <div className="xg-cell-desc">
                    <span className="xg-desc">{e.desc}</span>
                    {(note || hasPeople(e)) && (
                      <div className="xg-meta">
                        {note && <span className="xg-note">{note}</span>}
                        {hasPeople(e) && (url
                          ? <a className="xg-cc" href={url} target="_blank" rel="noreferrer">{t('expense.inCC')}<IconArrowUpRight size={13} /></a>
                          : <button className="xg-cc" type="button" disabled={busyCc === e.id} onClick={() => pushCc(e)}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                              {busyCc === e.id ? t('expense.sending') : t('expense.addCC')}
                            </button>)}
                      </div>
                    )}
                  </div>
                  <div>{e.proposito ? <span className={`xg-cat ${catColor(e.proposito)}`}><span className="xg-dot" />{catName(e.proposito)}</span> : <span className="xg-faint">—</span>}</div>
                  <span className="xg-method">{e.metodo && methodName(e.metodo)}</span>
                  <div>{debtBadge(d) || <span className="xg-faint">—</span>}</div>
                  <span className="xg-amount num right">
                    {eur(e.amount)}
                    {Math.abs(own - e.amount) > 0.005 && <span className="xg-own">{fill(t('expense.yourShare'), { v: eur(own) })}</span>}
                  </span>
                  <div className="xg-actions">
                    <button className="xg-icon-btn" aria-label={t('expense.editLabel')} onClick={() => onEdit(e.id)}><IconEdit size={17} /></button>
                    <div className="xg-menu-anchor">{moreBtn(e)}{moreMenu(e)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div className="xg-footer">
          <span>{fill(t('expense.showing'), { a: pageItems.length, b: filtered.length })} <strong className="num">{eur(total)}</strong></span>
          {pages > 1 && (
            <div className="xg-pager">
              <button className="xg-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('common.prev')}</button>
              <button className="xg-btn" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>{t('common.next')}</button>
            </div>
          )}
        </div>
      </section>
      {photoModal}
    </div>
  );
}
