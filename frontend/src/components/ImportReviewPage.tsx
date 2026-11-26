import { useMemo, useState } from 'react';
import type { Expense } from '../types';
import { addExpense, deleteExpense, loadData } from '../store';
import { blockedInDemo } from '../demo';
import { useLocale } from '../i18n';
import { importPlan, parseReceiptsCsv, reviewReceipts, type Receipt } from '../importReview';

const TEXT = {
  es: { title: 'Importar compras con revisión', intro: 'Carga un CSV de recibos: fecha,comercio,importe,referencia (opcional). Se analiza en tu navegador; nada se guarda hasta confirmar.', choose: 'Seleccionar CSV', existing: 'Ya existe un gasto similar — no se importará', possible: 'Posible duplicado: comprueba antes de seleccionar', receipts: 'recibos', save: 'Confirmar selección', empty: 'No hay operaciones seleccionadas para crear.', error: 'No se pudo leer el archivo', saved: 'Compras creadas', undo: 'Deshacer esta importación', confirm: '¿Crear las compras seleccionadas? Revisa primero los posibles duplicados.', undone: 'Importación deshecha', limit: 'Máximo 1 MB por archivo.' },
  en: { title: 'Review purchase imports', intro: 'Upload a receipts CSV: date,merchant,amount,reference (optional). Review locally; nothing is saved until you confirm.', choose: 'Select CSV', existing: 'Similar expense exists — will not import', possible: 'Possible duplicate: check before selecting', receipts: 'receipts', save: 'Confirm selection', empty: 'No purchases selected for creation.', error: 'Could not read file', saved: 'Purchases created', undo: 'Undo this import', confirm: 'Create selected purchases? Review possible duplicates first.', undone: 'Import undone', limit: 'Maximum file size: 1 MB.' },
  pt: { title: 'Importar compras com revisão', intro: 'Carrega um CSV de recibos: data,comercio,importe,referencia (opcional). Nada é guardado antes da confirmação.', choose: 'Selecionar CSV', existing: 'Já existe uma despesa semelhante — não será importada', possible: 'Possível duplicado: verifica antes de selecionar', receipts: 'recibos', save: 'Confirmar seleção', empty: 'Nenhuma compra selecionada.', error: 'Não foi possível ler o ficheiro', saved: 'Compras criadas', undo: 'Desfazer esta importação', confirm: 'Criar as compras selecionadas? Verifica possíveis duplicados.', undone: 'Importação desfeita', limit: 'Máximo 1 MB por ficheiro.' },
};

export default function ImportReviewPage({ expenses, onImported }: { expenses: Expense[]; onImported: () => void }) {
  const { locale } = useLocale();
  const text = TEXT[locale];
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [batch, setBatch] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => reviewReceipts(receipts, expenses), [receipts, expenses]);
  const planned = importPlan(rows, selected);

  const openCsv = async (file: File | undefined) => {
    setError(''); setMessage(''); setReceipts([]); setSelected(new Set()); setBatch([]);
    if (!file) return;
    if (file.size > 1048576) { setError(text.limit); return; }
    try { setReceipts(parseReceiptsCsv(await file.text())); }
    catch (cause) { setError(cause instanceof Error ? cause.message : text.error); }
  };
  const save = async () => {
    if (!planned.length || busy || blockedInDemo()) return;
    if (!window.confirm(text.confirm)) return;
    setBusy(true); setError('');
    const created: string[] = [];
    try {
      for (const index of selected) {
        const row = rows[index];
        if (!row || row.existingIds.length) continue;
        // Re-evaluate after every insert; another tab or previous row might already have created it.
        const [fresh] = reviewReceipts(row.receipts, loadData().expenses);
        if (fresh.existingIds.length) continue;
        const [input] = importPlan([fresh], new Set([0]));
        if (!input) continue;
        const expense = addExpense(input);
        if (expense) created.push(expense.id);
      }
      setBatch(created);
      setSelected(new Set());
      setMessage(`${text.saved}: ${created.length}`);
      onImported();
    } catch (cause) { setError(cause instanceof Error ? cause.message : text.error); }
    finally { setBusy(false); }
  };
  const undo = () => {
    if (busy || blockedInDemo()) return;
    for (const id of batch) deleteExpense(id);
    setBatch([]); setMessage(text.undone); onImported();
  };

  return <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
    <section className="card" style={{ padding: 22 }}>
      <h2>{text.title}</h2><p>{text.intro}</p>
      <input type="file" accept=".csv,text/csv" aria-label={text.choose} onChange={e => { void openCsv(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {batch.length > 0 && <button className="btn outline" onClick={undo}>{text.undo}</button>}
    </section>
    {rows.length > 0 && <section className="card" style={{ padding: 22 }}>
      <ul className="sanity-list">{rows.map((row, index) => <li key={`${row.date}-${row.merchant}-${index}`} className="sanity-item">
        <label style={{ display: 'grid', gap: 4 }}>
          <span><input type="checkbox" checked={selected.has(index)} disabled={!!row.existingIds.length || busy} onChange={e => setSelected(previous => { const next = new Set(previous); if (e.target.checked) next.add(index); else next.delete(index); return next; })} /> {row.date} · {row.merchant} · {row.amount.toFixed(2)} €</span>
          <small>{row.receipts.length > 1 && `${row.receipts.length} ${text.receipts}: ${row.receipts.map(r => r.merchant).join(', ')}. `}{row.existingIds.length > 0 ? text.existing : row.possibleDuplicate ? text.possible : ''}</small>
        </label>
      </li>)}</ul>
      <button className="btn primary" disabled={busy || !planned.length} onClick={() => { void save(); }}>{text.save} ({planned.length})</button>
      {!planned.length && <p>{text.empty}</p>}
    </section>}
  </div>;
}
