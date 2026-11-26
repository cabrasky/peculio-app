import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiListInvestments, apiCreateInvestment, apiDeleteInvestment, type InvestmentMovement, type InvestmentDraft } from '../api';
import { investmentTotals } from '../investmentTotals';

const names = { contribution: 'Aportación', withdrawal: 'Retirada de capital', sale: 'Venta', transfer: 'Traspaso interno' };
const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
const empty = (): InvestmentDraft => ({
  date: new Date().toLocaleDateString('en-CA'), asset: '', kind: 'contribution', amount: 0,
  fee: 0, cost_basis: null, notes: '',
});

export default function InvestmentsPage() {
  const [rows, setRows] = useState<InvestmentMovement[]>([]);
  const [draft, setDraft] = useState<InvestmentDraft>(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { void apiListInvestments().then(setRows).catch(() => setError('No se pudieron cargar las inversiones.')); }, []);
  const totals = investmentTotals(rows);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const result = await apiCreateInvestment(draft);
      setRows(old => [result, ...old]); setDraft(empty());
    } catch { setError('No se pudo guardar el movimiento. Revísalo e inténtalo de nuevo.'); }
    finally { setSaving(false); }
  };
  const remove = async (row: InvestmentMovement) => {
    if (!window.confirm('¿Eliminar este movimiento de inversión?')) return;
    try { await apiDeleteInvestment(row.id); setRows(old => old.filter(x => x.id !== row.id)); }
    catch { setError('No se pudo eliminar el movimiento.'); }
  };
  return <div className="page-content" style={{ maxWidth: 840, margin: '0 auto', padding: 20 }}>
    <h1>Inversiones y transferencias</h1>
    <p>Movimientos de capital separados de los ingresos ganados y gastos de consumo. No son un saldo bancario ni una posición valorada.</p>
    <div className="card" style={{ padding: 20 }}>
      <h2>Resumen de movimientos nuevos</h2>
      <p>Aportado: {eur(totals.contributed)} · Retirado: {eur(totals.withdrawn)} · Ventas netas: {eur(totals.netSales)}</p>
      <p>Resultado realizado con base declarada: {eur(totals.realizedGain)}{totals.unpricedSales ? ` (${totals.unpricedSales} venta(s) sin base de coste, no incluidas)` : ''}.</p>
    </div>
    <div className="card" style={{ padding: 20, marginTop: 16 }}>
      <h2>Registrar movimiento</h2>
      <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <label>Fecha <input type="date" required value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label>
        <label>Activo o cuenta <input required maxLength={128} value={draft.asset} onChange={e => setDraft({ ...draft, asset: e.target.value })} /></label>
        <label>Tipo <select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as InvestmentDraft['kind'], fee: 0, cost_basis: null })}>
          {Object.entries(names).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>{draft.kind === 'sale' ? 'Venta bruta (€)' : 'Importe (€)'} <input type="number" min="0.01" step="0.01" required value={draft.amount || ''} onChange={e => setDraft({ ...draft, amount: Number(e.target.value) })} /></label>
        {draft.kind === 'sale' && <>
          <label>Comisión (€) <input type="number" min="0" step="0.01" value={draft.fee} onChange={e => setDraft({ ...draft, fee: Number(e.target.value) })} /></label>
          <label>Base de coste de la parte vendida (€; opcional) <input type="number" min="0" step="0.01" value={draft.cost_basis ?? ''} onChange={e => setDraft({ ...draft, cost_basis: e.target.value === '' ? null : Number(e.target.value) })} /></label>
          <small>Sin base de coste no se calcula plusvalía. En una venta parcial introduce solo la base de las participaciones vendidas.</small>
        </>}
        <label>Notas <input maxLength={2000} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>
        <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar movimiento'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </div>
    <h2>Movimientos</h2>
    {rows.map(row => <div className="card" key={row.id} style={{ padding: 16, marginBottom: 10 }}>
      <strong>{row.asset} · {names[row.kind]}</strong> · {row.date} · {eur(row.amount)}
      {row.kind === 'sale' && <p>Recibido neto: {eur(row.net_received ?? 0)} · Comisión: {eur(row.fee)} · Resultado: {row.realized_gain === null ? 'desconocido (sin base de coste)' : eur(row.realized_gain)}</p>}
      {row.notes && <p>{row.notes}</p>}
      <button type="button" onClick={() => void remove(row)} aria-label={`Eliminar ${row.asset} ${row.date}`}>Eliminar</button>
    </div>)}
    <p>Los movimientos históricos en <Link to="/expenses">Gastos</Link> y <Link to="/incomes">Ingresos</Link> permanecen sin modificar. Revisa sus categorías manualmente antes de reclasificarlos; no se emparejan automáticamente.</p>
  </div>;
}
