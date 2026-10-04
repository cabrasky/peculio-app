import type { Expense } from './types';

// Descarga todos los gastos en CSV (antes era un botón de la cabecera; ahora vive en Configuración)
export function exportExpensesCsv(expenses: Expense[]) {
  const headers = ['Fecha', 'Descripcion', 'Importe', 'Proposito', 'Motivo', 'Tipo', 'Metodo', 'Gasto Ajeno', 'Deudores', 'Metodo Devolucion', 'Devuelto', 'Me Corresponde', 'Viaje'];
  const rows: unknown[][] = [headers];
  expenses.forEach(e => {
    rows.push([e.date, e.desc, e.amount, e.proposito, e.motivo, e.tipo, e.metodo, e.ajeno, e.deudores, e.deudaMetodo, e.devuelto, e.meCorresponde, e.viaje]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `gastos_${new Date().getFullYear()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
