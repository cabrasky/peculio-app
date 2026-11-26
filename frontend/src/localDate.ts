/** Fecha ISO de calendario en la zona local del usuario, sin pasar por UTC. */
export function todayLocalISO(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Avanza la fecha de facturación sin desplazarla por una conversión UTC. */
export function advanceBillingDate(dateISO: string, cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly'): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const next = new Date(year, month - 1, day, 12);
  switch (cycle) {
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  return todayLocalISO(next);
}
