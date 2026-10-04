import type { Expense } from './types';

// Personas de un gasto compartido (JSON "participants", claves en inglés):
// [{n: nombre, m: importe, r: 'deb'|'inv', repaid: bool, method: tipo devolución}]
export type Persona = { n: string; m: number; r: 'deb' | 'inv'; repaid: boolean; method: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function parsePersonas(raw?: string | null): Persona[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    if (!Array.isArray(a)) return [];
    return a.filter((x: any) => x && typeof x.n === 'string').map((x: any) => ({
      n: x.n, m: Number(x.m) || 0,
      r: x.r === 'inv' ? 'inv' as const : 'deb' as const,
      repaid: !!x.repaid,
      method: typeof x.method === 'string' ? x.method : '',
    }));
  } catch { return []; }
}

export function serializePersonas(ps: Persona[]): string {
  return JSON.stringify(ps.map(p => ({ n: p.n.trim(), m: r2(Number(p.m) || 0), r: p.r, repaid: !!p.repaid, method: p.method || '' })));
}

// Personas de un gasto con fallback legacy: si no hay JSON se derivan de "deudores"
// repartiendo "ajeno", y el flag global "devuelto" se propaga a cada deudor.
export function personasOf(e: Pick<Expense, 'personas' | 'deudores' | 'ajeno' | 'devuelto' | 'deudaMetodo'>): Persona[] {
  let ps = e.personas ? parsePersonas(e.personas) : (() => {
    const raw = (e.deudores || '').trim();
    if (!raw) return [];
    const names = raw.split(/\s*(?:,|;|\s+y\s+|\s+e\s+)\s*/).map(x => x.trim()).filter(Boolean);
    if (!names.length) return [];
    const tot = Number(e.ajeno) || 0;
    const per = r2(tot / names.length);
    return names.map((n, i) => ({ n, m: i === names.length - 1 ? r2(tot - per * (names.length - 1)) : per, r: 'deb' as const, repaid: false, method: '' }));
  })();
  if (ps.length && e.devuelto === 'yes') {
    ps = ps.map(p => (p.r === 'deb' ? { ...p, repaid: true, method: p.method || e.deudaMetodo || 'Bizum' } : p));
  }
  return ps;
}

// Invitación de verdad: con personas apuntadas, solo si todas van invitadas (nadie debe nada);
// sin personas, lo que diga la casilla. Así un gasto con deudores nunca sale como invitación.
export function isInvitation(e: Pick<Expense, 'invitacion' | 'personas' | 'deudores' | 'ajeno' | 'devuelto' | 'deudaMetodo'>): boolean {
  const ps = personasOf(e).filter(p => p.n.trim());
  return ps.length ? ps.every(p => p.r === 'inv') : !!e.invitacion;
}

// Campos globales derivados de las devoluciones por persona (todos devueltos / primer método devuelto).
export function repaySummary(ps: Persona[]): { devuelto: 'yes' | 'no'; deudaMetodo: string } {
  const debtors = ps.filter(p => p.r === 'deb');
  const all = debtors.length > 0 && debtors.every(p => p.repaid);
  return { devuelto: all ? 'yes' : 'no', deudaMetodo: debtors.find(p => p.repaid)?.method || 'Bizum' };
}

// Deudores con devolución pendiente (para contadores/badges).
export function pendingDebtCount(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + personasOf(e).filter(p => p.r === 'deb' && !p.repaid && p.n.trim()).length, 0);
}

// Reparto a partes iguales en céntimos: con "yo" incluido, los céntimos que sobran
// son para mí (mi parte = total − lo de los demás); sin mí, van a los primeros.
export function equalShares(total: number, count: number, includeMe: boolean): number[] {
  if (count <= 0) return [];
  const cents = Math.max(0, Math.round((Number(total) || 0) * 100));
  const parts = count + (includeMe ? 1 : 0);
  const base = Math.floor(cents / parts);
  const rem = cents - base * parts;
  return Array.from({ length: count }, (_, i) => (base + (!includeMe && i < rem ? 1 : 0)) / 100);
}

// Modo de reparto de un gasto guardado: 'me' / 'others' si coincide con un reparto
// igual (conmigo o sin mí), 'manual' si no. Tolera el redondeo de datos antiguos.
export function detectSplit(total: number, ps: Pick<Persona, 'm'>[]): 'me' | 'others' | 'manual' {
  if (!ps.length || !(total > 0)) return 'manual';
  const near = (xs: number[]) => xs.every((x, i) => Math.abs(x - ps[i].m) <= 0.011);
  if (near(equalShares(total, ps.length, true))) return 'me';
  if (near(equalShares(total, ps.length, false))) return 'others';
  return 'manual';
}

// Personas con las que más compartes gastos (para añadirlas con un clic).
export function frequentPeople(expenses: Pick<Expense, 'personas' | 'deudores' | 'ajeno' | 'devuelto' | 'deudaMetodo'>[], limit = 8): string[] {
  const seen = new Map<string, { n: string; c: number }>();
  for (const e of expenses) {
    for (const p of personasOf(e)) {
      const n = p.n.trim();
      if (!n) continue;
      const k = n.toLocaleLowerCase();
      const cur = seen.get(k);
      if (cur) cur.c++; else seen.set(k, { n, c: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.c - a.c).slice(0, limit).map(x => x.n);
}
