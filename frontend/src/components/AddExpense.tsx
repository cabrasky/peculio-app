import { useState, useEffect, useMemo, useRef } from 'react';
import { REF } from '../types';
import { addExpense, updateExpense, loadData, suggestExpense, type Suggestion } from '../store';
import type { Expense } from '../types';
import { useLocale, refLabel, fill } from '../i18n';
import RichText from './RichText';
import { detectSplit, equalShares, frequentPeople, personasOf, repaySummary, serializePersonas, type Persona } from '../personas';
import { catColor } from '../categoryColors';
import { eur } from '../format';
import { IconSparkle, IconX } from './Icons';

interface Props {
  isOpen: boolean;
  editExpense?: Expense | null;
  onClose: () => void;
  onSaved: () => void;
  presetProjectId?: string;
}

// Fila editable de una persona: el importe se guarda como texto para poder escribir
// decimales ("12," no se pierde) y el id estable evita que los inputs se mezclen al quitar filas.
type Row = Omit<Persona, 'm'> & { id: number; txt: string };

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: string) => Math.max(0, parseFloat(v.replace(',', '.')) || 0);
const numTxt = (n: number) => (n ? round2(n).toFixed(2).replace('.', ',') : '');

export default function AddExpense({ isOpen, editExpense, onClose, onSaved, presetProjectId = '' }: Props) {
  const { t } = useLocale();
  const isEdit = !!editExpense;
  const today = new Date().toISOString().slice(0, 10);
  const projects = loadData().projects;

  const [date, setDate] = useState(today);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(0);
  const [proposito, setProposito] = useState('');
  const [metodo, setMetodo] = useState('Tarjeta');
  const [motivo, setMotivo] = useState('');
  const [tipo, setTipo] = useState('Puntual');
  const [proyectoId, setProyectoId] = useState('');
  const [showShared, setShowShared] = useState(false);
  const [ajeno, setAjeno] = useState(0);
  const [invitacion, setInvitacion] = useState(0);
  const [deudores, setDeudores] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [equal, setEqual] = useState(true);
  const [withMe, setWithMe] = useState(true);
  const [focusId, setFocusId] = useState(0);
  const nextId = useRef(1);
  const [viaje, setViaje] = useState('');
  const [errors, setErrors] = useState<{ desc?: string; amount?: string; people?: string }>({});
  const [sug, setSug] = useState<Suggestion | null>(null);
  const sugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (sugTimer.current) clearTimeout(sugTimer.current);
    const q = desc.trim();
    if (!q || q.length < 3) { setSug(null); return; }
    sugTimer.current = setTimeout(() => {
      if (editExpense) { setSug(null); return; }
      const s = suggestExpense(q);
      setSug(s && (s.proposito || s.tipo || s.motivo || s.metodo !== 'Tarjeta') ? s : null);
    }, 300);
    return () => { if (sugTimer.current) clearTimeout(sugTimer.current); };
  }, [desc, editExpense]);

  const toRow = (p: Omit<Persona, 'm'> & { m?: number }): Row =>
    ({ id: nextId.current++, n: p.n, r: p.r, repaid: p.repaid, method: p.method, txt: numTxt(p.m || 0) });

  const applySug = () => {
    if (!sug) return;
    setProposito(sug.proposito); setTipo(sug.tipo); setMotivo(sug.motivo); setMetodo(sug.metodo);
    if (sug.proyectoId) setProyectoId(sug.proyectoId);
    setSug(null);
  };

  useEffect(() => {
    if (editExpense) {
      setDate(editExpense.date);
      setDesc(editExpense.desc);
      setAmount(editExpense.amount);
      setProposito(editExpense.proposito);
      setMetodo(editExpense.metodo || 'Tarjeta');
      setMotivo(editExpense.motivo);
      setTipo(editExpense.tipo || 'Puntual');
      setProyectoId(editExpense.proyectoId || '');
      setAjeno(editExpense.ajeno || 0);
      setInvitacion(editExpense.invitacion ? 1 : 0);
      setDeudores(editExpense.deudores || '');
      // Incluye la migración lazy del flag global "devuelto" a cada deudor
      const ps = personasOf(editExpense);
      const mode = detectSplit(editExpense.amount, ps);
      setRows(ps.map(toRow));
      setEqual(mode !== 'manual');
      setWithMe(mode !== 'others');
      setViaje(editExpense.viaje || '');
      setShowShared(!!(editExpense.ajeno || editExpense.deudores || editExpense.devuelto === 'yes' || editExpense.viaje || ps.length));
    } else {
      setDate(today);
      setDesc('');
      setAmount(0);
      setProposito('');
      setMetodo('Tarjeta');
      setMotivo('');
      setTipo('Puntual');
      setProyectoId(presetProjectId);
      setAjeno(0);
      setInvitacion(0);
      setDeudores('');
      setRows([]);
      setEqual(true);
      setWithMe(true);
      setViaje('');
      setShowShared(false);
    }
    setFocusId(0);
    setErrors({});
  }, [editExpense, isOpen, presetProjectId]);

  // Personas con las que más se comparte, para añadirlas con un clic
  const frequent = useMemo(() => (isOpen ? frequentPeople(loadData().expenses, 12) : []), [isOpen]);

  if (!isOpen) return null;

  // "Me corresponde" se calcula solo (importe − partes que te deben), como en la plantilla
  const total = amount > 0 && isFinite(amount) ? round2(amount) : 0;
  // A partes iguales los importes salen del total; a mano, de lo escrito en cada fila
  const shares = equal ? equalShares(total, rows.length, withMe) : null;
  const personas: Persona[] = rows.map((x, i) => ({ n: x.n, r: x.r, repaid: x.repaid, method: x.method, m: shares ? shares[i] : num(x.txt) }));
  const debtSum = round2(personas.reduce((s2, x) => s2 + (x.r === 'deb' ? x.m : 0), 0));
  const invSum = round2(personas.reduce((s2, x) => s2 + (x.r === 'inv' ? x.m : 0), 0));
  const ajenoEf = personas.length ? debtSum : ajeno;
  const meCorresponde = round2(Math.max(0, total - Math.min(ajenoEf, total)));
  const over = round2(debtSum + invSum - total);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { desc?: string; amount?: string; people?: string } = {};
    if (!desc.trim()) errs.desc = t('error.descriptionRequired');
    const amt = Number(amount);
    if (!amt || amt <= 0 || !isFinite(amt)) errs.amount = t('error.amountPositive');
    if (showShared && personas.some(x => !x.n.trim())) errs.people = t('expense.personNameRequired');
    else if (showShared && personas.length && over > 0) errs.people = fill(t('expense.overTotal'), { v: eur(over) });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const per = personas.filter(x => x.n.trim());
    const debtors = per.filter(x => x.r === 'deb');
    const allInv = per.length > 0 && per.every(x => x.r === 'inv');
    const repay = repaySummary(per);
    const data: any = {
      date, desc: desc.trim(), amount: round2(amt), proposito, metodo,
      motivo: motivo.trim(), tipo: tipo.trim(),
      ajeno: showShared ? Math.min(ajenoEf, round2(amt)) : 0,
      invitacion: allInv ? 1 : (invitacion ? 1 : 0),
      deudores: showShared ? (per.length ? debtors.map(x => x.n.trim()).join(', ') : deudores.trim()) : '',
      personas: per.length ? serializePersonas(per) : (editExpense?.personas || ''),
      deudaMetodo: showShared ? repay.deudaMetodo : 'Bizum',
      devuelto: showShared ? repay.devuelto : 'no',
      meCorresponde: showShared ? round2(Math.max(0, amt - (per.length ? debtSum : ajeno))) : round2(amt),
      viaje: showShared ? viaje.trim() : '',
      proyectoId,
    };

    if (isEdit && editExpense) {
      updateExpense(editExpense.id, data);
    } else {
      addExpense(data);
    }
    onSaved();
  };

  const upP = (id: number, patch: Partial<Row>) => setRows(rs => rs.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const addP = (n = '') => {
    // Un nombre sugerido rellena la primera fila vacía antes de crear otra
    const empty = n ? rows.find(x => !x.n.trim()) : undefined;
    if (empty) return upP(empty.id, { n });
    const row = toRow({ n, r: 'deb', repaid: false, method: 'Bizum' });
    if (!n) setFocusId(row.id);
    setRows(rs => [...rs, row]);
  };
  const delP = (id: number) => setRows(rs => rs.filter(x => x.id !== id));
  // Escribir un importe pasa a "a mano" conservando lo que ya había repartido
  const typeAmount = (id: number, v: string) => {
    if (shares) setRows(rs => rs.map((x, i) => ({ ...x, txt: x.id === id ? v : numTxt(shares[i]) })));
    else upP(id, { txt: v });
    setEqual(false);
  };
  const setMode = (eq: boolean) => {
    if (!eq && shares) setRows(rs => rs.map((x, i) => ({ ...x, txt: numTxt(shares[i]) })));
    setEqual(eq);
  };
  const setAllRoles = (r: Persona['r']) => setRows(rs => rs.map(x => ({ ...x, r })));

  const taken = new Set(rows.map(x => x.n.trim().toLocaleLowerCase()));
  const suggestions = frequent.filter(n => !taken.has(n.toLocaleLowerCase())).slice(0, 8);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${isEdit ? 'modal-edit' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? t('expense.editLabel') : t('nav.newExpense')}</h2>
          <button className="modal-close" onClick={onClose} type="button" title={t('common.close')} aria-label={t('common.close')}>
            <IconX size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-section">
            <div className="form-section-title">{t('expense.general')}</div>
            <div className="form-row three">
              <div className="form-group required">
                <label>{t('common.date')}</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="form-group required">
                <label>{t('common.amountEur')}</label>
                <div className="amount-input-wrap">
                  <span className="cur">€</span>
                  <input
                    type="number" step="0.01" min="0.01" value={amount || ''}
                    onChange={e => setAmount(Number(e.target.value))}
                    placeholder="0,00" autoFocus={!isEdit}
                    className={errors.amount ? 'input-error' : ''}
                  />
                </div>
                {errors.amount && <span className="field-error">{errors.amount}</span>}
              </div>
              <div className="form-group">
                <label>{t('expense.type')}</label>
                <select value={tipo} onChange={e => setTipo(e.target.value)}>
                  {REF.tipos.map(x => <option key={x} value={x}>{refLabel('types', x, t)}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group required" style={{ marginBottom: 12 }}>
              <label>{t('common.description')}</label>
              <input
                type="text" value={desc} onChange={e => setDesc(e.target.value)}
                placeholder={t('expense.placeholder')} className={errors.desc ? 'input-error' : ''}
              />
              {errors.desc && <span className="field-error">{errors.desc}</span>}
              {sug && !errors.desc && (
                <div className="sug-bar">
                  <span className="sug-icon"><IconSparkle size={14} /></span>
                  <span className="sug-text">
                    {fill(t('expense.suggestion'), { m: sug.match })} <b>{sug.proposito ? refLabel('categories', sug.proposito, t) : '—'}</b> · {refLabel('types', sug.tipo, t)} · {sug.motivo ? refLabel('motives', sug.motivo, t) : t('expense.noMotive')} · {refLabel('methods', sug.metodo, t)}
                  </span>
                  <button type="button" className="btn sm" onClick={applySug}>{t('common.use')}</button>
                </div>
              )}
            </div>

            <div className="form-row three">
              <div className="form-group">
                <label>{t('expense.categoryPurpose')}</label>
                <select value={proposito} onChange={e => setProposito(e.target.value)}>
                  <option value="">{t('expense.chooseCategory')}</option>
                  {REF.propositos.map(p => <option key={p} value={p}>{refLabel('categories', p, t)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('expense.motiveEvent')}</label>
                <select value={motivo} onChange={e => setMotivo(e.target.value)}>
                  <option value="">{t('common.none')}</option>
                  {REF.motivos.map(m => <option key={m} value={m}>{refLabel('motives', m, t)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('expense.payMethod')}</label>
                <select value={metodo} onChange={e => setMetodo(e.target.value)}>
                  <option value="">—</option>
                  {REF.metodos.map(m => <option key={m} value={m}>{refLabel('methods', m, t)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="invit-check" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  <input type="checkbox" checked={!!invitacion} onChange={e => setInvitacion(e.target.checked ? 1 : 0)} />
                  {t('expense.invitationFull')}
                </label>
              </div>
            </div>

            <div className="form-group">
              <label>{t('expense.projectOptional')}</label>
              <select value={proyectoId} onChange={e => setProyectoId(e.target.value)}>
                <option value="">{t('expense.noProjectGeneral')}</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div className="form-section">
            <label className="toggle-row">
              <input
                type="checkbox" checked={showShared}
                onChange={e => setShowShared(e.target.checked)}
              />
              {t('expense.shared')}
            </label>

            {showShared && (
              <>
                {rows.length === 0 ? (
                  <div className="hint" style={{ margin: '4px 0 10px' }}>
                    <RichText text={t('expense.sharedHint')} />
                  </div>
                ) : (
                  <>
                    <div className="split-mode">
                      <button type="button" className={`split-chip ${equal ? 'on' : ''}`} aria-pressed={equal} onClick={() => setMode(true)}>{t('expense.splitEqual')}</button>
                      <button type="button" className={`split-chip ${!equal ? 'on' : ''}`} aria-pressed={!equal} onClick={() => setMode(false)}>{t('expense.splitManual')}</button>
                    </div>
                    {equal && (
                      <label className="split-me">
                        <input type="checkbox" checked={withMe} onChange={e => setWithMe(e.target.checked)} />
                        <span>{t('expense.splitWithMe')}</span>
                        {shares && total > 0 && <span className="per-person">{fill(t('expense.perPerson'), { v: eur(shares[0]) })}</span>}
                      </label>
                    )}
                    {equal && !total && <div className="hint" style={{ margin: '0 0 10px' }}>{t('expense.enterTotal')}</div>}
                  </>
                )}

                {rows.map((x, i) => {
                  const name = x.n.trim();
                  return (
                    <div key={x.id} className="persona-card">
                      <div className="persona-line">
                        <span className={`persona-avatar ${name ? catColor(name) : ''}`} aria-hidden="true">{name ? name.charAt(0).toUpperCase() : '?'}</span>
                        <input type="text" value={x.n} placeholder={t('common.name')} autoFocus={x.id === focusId}
                          onChange={e => upP(x.id, { n: e.target.value })} />
                        <div className={`persona-amt ${equal ? 'auto' : ''}`}>
                          <input type="text" inputMode="decimal" value={shares ? numTxt(shares[i]) : x.txt} placeholder="0,00"
                            aria-label={`${t('common.amountEur')} · ${x.n}`}
                            onFocus={e => e.target.select()} onChange={e => typeAmount(x.id, e.target.value)} />
                          <span>€</span>
                        </div>
                        <button type="button" className="btn ghost x" onClick={() => delP(x.id)} title={t('common.remove')} aria-label={`${t('common.remove')} ${x.n}`}><IconX size={16} /></button>
                      </div>
                      <div className="persona-opts">
                        <div className="role-toggle">
                          <button type="button" className={x.r === 'deb' ? 'on deb' : ''} aria-pressed={x.r === 'deb'} onClick={() => upP(x.id, { r: 'deb' })}>{t('expense.owes')}</button>
                          <button type="button" className={x.r === 'inv' ? 'on inv' : ''} aria-pressed={x.r === 'inv'} onClick={() => upP(x.id, { r: 'inv' })}>{t('expense.invited')}</button>
                        </div>
                        {x.r === 'deb' && (
                          <label className="persona-repaid">
                            <input type="checkbox" checked={x.repaid} onChange={e => upP(x.id, { repaid: e.target.checked, method: x.method || 'Bizum' })} />
                            {t('expense.repaid')}
                          </label>
                        )}
                      </div>
                      {x.r === 'deb' && x.repaid && (
                        <div className="persona-methods">
                          <span className="persona-lbl">{t('expense.how')}</span>
                          {REF.refundMethods.map(m => (
                            <button key={m} type="button" className={`split-chip sm ${(x.method || 'Bizum') === m ? 'on' : ''}`}
                              aria-pressed={(x.method || 'Bizum') === m} onClick={() => upP(x.id, { method: m })}>{refLabel('methods', m, t)}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {suggestions.length > 0 && (
                  <div className="persona-frequent">
                    <span className="persona-lbl">{t('expense.frequent')}</span>
                    <div className="persona-chips">
                      {suggestions.map(n => (
                        <button key={n} type="button" className="split-chip sug" onClick={() => addP(n)} aria-label={`${t('expense.addPerson')} ${n}`}>+ {n}</button>
                      ))}
                    </div>
                  </div>
                )}
                <button type="button" className="persona-add" onClick={() => addP()}>{t('expense.addPerson')}</button>
                {rows.length > 1 && (
                  <div className="persona-all">
                    <button type="button" onClick={() => setAllRoles('deb')}>{t('expense.allOwe')}</button>
                    <button type="button" onClick={() => setAllRoles('inv')}>{t('expense.inviteAll')}</button>
                  </div>
                )}
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('expense.tripOptional')}</label>
                    <input type="text" value={viaje} onChange={e => setViaje(e.target.value)} placeholder={t('expense.tripName')} />
                  </div>
                </div>
                <div className="split-sum">
                  {rows.length > 0 && (
                    <>
                      <div><span>{t('expense.total')}</span><span>{eur(total)}</span></div>
                      {debtSum > 0 && <div><span>{t('expense.owedToYou')}</span><span className="owed">{eur(debtSum)}</span></div>}
                      {invSum > 0 && <div><span>{t('expense.youTreat')}</span><span className="treat">{eur(invSum)}</span></div>}
                      <hr />
                    </>
                  )}
                  <div className="mine"><span>{t('expense.yourPart')}</span><span>{eur(meCorresponde)}</span></div>
                  {rows.length > 0 && over > 0 && <p className="field-error">{fill(t('expense.overTotal'), { v: eur(over) })}</p>}
                </div>
                {errors.people && <p className="field-error">{errors.people}</p>}
              </>
            )}
          </div>

          <div className="form-actions" style={{ marginTop: 6 }}>
            <button type="submit" className="btn primary">
              {isEdit ? t('common.saveChanges') : t('expense.addBtn')}
            </button>
            <button type="button" className="btn outline" onClick={onClose}>{t('common.cancel')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
