export interface Receipt { date: string; merchant: string; amount: number; reference: string }
export interface ExistingExpense { id: string; date: string; desc: string; amount: number }
export interface ReviewedReceipt extends Receipt {
  receipts: Receipt[];
  existingIds: string[];
  possibleDuplicate: boolean;
}

function csvRows(source: string): string[][] {
  const text = source.replace(/^\ufeff/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (!quoted && field) throw new Error('CSV: comillas incorrectas');
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(field.trim()); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('CSV: comillas sin cerrar');
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseAmount(value: string): number {
  let v = value.trim().replace(/\s|€/g, '');
  if (v.includes(',') && v.includes('.')) v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  else v = v.replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(v)) throw new Error('Importe inválido');
  const amount = Number(v);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Importe inválido');
  return amount;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** CSV de recibos revisado localmente; no ejecuta ninguna escritura. */
export function parseReceiptsCsv(source: string): Receipt[] {
  const [headers, ...rows] = csvRows(source);
  if (!headers) throw new Error('Falta la cabecera CSV');
  const canonical: Record<string, string> = { fecha: 'date', date: 'date', comercio: 'merchant', merchant: 'merchant', descripcion: 'merchant', description: 'merchant', importe: 'amount', amount: 'amount', referencia: 'reference', reference: 'reference' };
  const cols = headers.map(h => canonical[h.toLowerCase()]);
  for (const required of ['date', 'merchant', 'amount']) if (!cols.includes(required)) throw new Error(`Falta la columna ${required}`);
  if (rows.length > 1000) throw new Error('Máximo 1000 filas por archivo');
  return rows.map((row, index) => {
    const at = (key: string) => (row[cols.indexOf(key)] || '').trim();
    const date = at('date'); const merchant = at('merchant');
    if (!validDate(date)) throw new Error(`Fila ${index + 2}: fecha inválida`);
    if (!merchant) throw new Error(`Fila ${index + 2}: comercio vacío`);
    return { date, merchant, amount: parseAmount(at('amount')), reference: cols.includes('reference') ? at('reference') : '' };
  });
}

export function importPlan(rows: ReviewedReceipt[], selected: Set<number>): { date: string; desc: string; amount: number; motivo: string }[] {
  return rows.flatMap((row, index) => selected.has(index) && row.existingIds.length === 0
    ? [{ date: row.date, desc: row.merchant, amount: row.amount, motivo: 'Importado de CSV' }]
    : []);
}

export function normalizeMerchant(merchant: string): string {
  return merchant.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function nearby(a: string, b: string): boolean {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) <= 86400000;
}
function sameMerchant(a: string, b: string): boolean {
  const x = normalizeMerchant(a); const y = normalizeMerchant(b);
  return !!x && !!y && (x === y || (x.length >= 5 && y.includes(x)) || (y.length >= 5 && x.includes(y)));
}
function isPaymentProcessor(s: string): boolean { return /^(paypal|google pay|google payments|stripe|adyen|visa|mastercard)(\s|$)/.test(normalizeMerchant(s)); }

/** Agrupa solo referencias compartidas; el mismo importe sin referencia es una alerta, no una fusión. */
export function reviewReceipts(receipts: Receipt[], existing: ExistingExpense[]): ReviewedReceipt[] {
  const reviewed: ReviewedReceipt[] = [];
  for (const receipt of receipts) {
    const ref = receipt.reference.trim().toLowerCase();
    const previous = ref && reviewed.find(r => r.reference.trim().toLowerCase() === ref && r.amount === receipt.amount && nearby(r.date, receipt.date));
    if (previous) {
      if (!previous.receipts.some(r => r.date === receipt.date && r.merchant === receipt.merchant && r.amount === receipt.amount && r.reference === receipt.reference)) previous.receipts.push(receipt);
      if (isPaymentProcessor(previous.merchant) && !isPaymentProcessor(receipt.merchant)) previous.merchant = receipt.merchant;
      continue;
    }
    reviewed.push({ ...receipt, receipts: [receipt], existingIds: [], possibleDuplicate: false });
  }
  for (const row of reviewed) {
    row.existingIds = existing.filter(e => e.amount === row.amount && nearby(e.date, row.date) && row.receipts.some(r => sameMerchant(r.merchant, e.desc))).map(e => e.id);
    row.possibleDuplicate = reviewed.some(other => other !== row && other.amount === row.amount && nearby(other.date, row.date) && (isPaymentProcessor(other.merchant) || isPaymentProcessor(row.merchant) || sameMerchant(other.merchant, row.merchant)))
      || existing.some(e => e.amount === row.amount && nearby(e.date, row.date) && !row.existingIds.includes(e.id));
  }
  return reviewed;
}
