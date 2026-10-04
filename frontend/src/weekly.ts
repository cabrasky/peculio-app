// Plan semanal del objetivo de gasto: lo gastado por semana y, a partir de ahí, cuánto
// se puede gastar de aquí a fin de año, cómo se acabará al ritmo actual y qué objetivo
// sería alcanzable. Sin dependencias de la interfaz; el mismo fichero en la web y en la app.

export interface WeeklyExpense { date: string; proyectoId?: string; proposito?: string }
export interface WeeklyProject { id: string; name: string; budget?: number | null }

export interface WeekRow { num: number; spent: number; accSpent: number; accGoal: number; avail: number }
export interface ProjectBudget { id: string; name: string; budget: number; spent: number; left: number; pct: number }
export interface ExcludedCategory { name: string; spent: number }

export interface WeeklyPlan {
  year: number;
  week: number;              // semana en curso (1–52)
  weeksLeft: number;         // semanas que quedan, contando la actual
  weeks: WeekRow[];
  weeklyGoal: number;
  annualGoal: number;
  firstWeek: number;         // primera semana del año con gastos apuntados (o la actual)
  periodGoal: number;        // objetivo desde esa semana hasta fin de año: lo que se compara de verdad
  totalSpent: number;        // todo el año, incluidos gastos con fecha futura
  spentSoFar: number;        // hasta la semana en curso incluida
  thisWeek: { spent: number; left: number; pct: number };
  adjustedGoal: number;      // lo que se puede gastar por semana para cumplir el objetivo del periodo
  pace: number;              // media de las últimas semanas completas
  paceWeeks: number;         // cuántas semanas entran en esa media
  projection: number;        // gasto del año si se sigue a ese ritmo
  projectionDiff: number;    // objetivo del periodo − proyección (positivo: sobra)
  suggestedGoal: number | null;
  projects: ProjectBudget[]; // proyectos con presupuesto
  excluded: number;          // gasto del año en esos proyectos que no cuenta en el objetivo
  excludedCats: ExcludedCategory[]; // categorías apartadas del objetivo, con lo gastado este año
  excludedByCats: number;    // suma de lo anterior
}

export const WEEKS_IN_YEAR = 52;
// Categorías que no cuentan contra el objetivo mientras el usuario no elija otras:
// lo que se ahorra o se invierte no es gasto del día a día
export const DEFAULT_EXCLUDED = ['Ahorro/Inversion'];
export const excludedOf = (saved?: string[] | null): string[] => saved ?? DEFAULT_EXCLUDED;
const PACE_WEEKS = 8;
const r2 = (n: number) => Math.round(n * 100) / 100;

// Semana ISO (lunes a domingo) y el año al que pertenece: los primeros días de enero
// pueden ser de la última semana del año anterior, y los últimos de diciembre, de la primera del siguiente.
export function isoWeek(date: string | Date): { year: number; week: number } {
  const d = typeof date === 'string' ? new Date(date.slice(0, 10) + 'T12:00:00') : new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); // jueves de esa semana
  const year = d.getFullYear();
  const week1 = new Date(year, 0, 4, 12);
  const week = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return { year, week };
}

export const weekOfYear = (date: string | Date) => isoWeek(date).week;

/**
 * `realistic`: los gastos de un proyecto con presupuesto se controlan en su proyecto y no
 * cuentan contra el objetivo semanal, y tampoco los de las categorías de `excluded`
 * (ahorro, inversión…). Sin él cuenta todo.
 * `costOf`: lo que le cuesta el gasto al usuario (su parte en los compartidos).
 */
export function weeklyPlan<E extends WeeklyExpense>(
  expenses: E[], projects: WeeklyProject[], weeklyGoal: number, today: string | Date,
  realistic: boolean, costOf: (e: E) => number, excluded: string[] = [],
): WeeklyPlan {
  const goal = Math.max(0, Number(weeklyGoal) || 0);
  const now = isoWeek(today);
  const week = Math.min(now.week, WEEKS_IN_YEAR);
  const budgeted = new Map(projects.filter(p => Number(p.budget) > 0).map(p => [p.id, p]));

  const byWeek = new Array<number>(WEEKS_IN_YEAR + 1).fill(0);
  const byProject = new Map<string, number>();
  const apart = new Map(excluded.map(c => [c, 0]));
  let inProjects = 0;
  for (const e of expenses) {
    if (!e.date) continue;
    const cost = Number(costOf(e)) || 0;
    const inBudget = !!e.proyectoId && budgeted.has(e.proyectoId);
    // El presupuesto de un proyecto no es anual: cuenta todo lo gastado en él
    if (inBudget) byProject.set(e.proyectoId!, (byProject.get(e.proyectoId!) || 0) + cost);
    const w = isoWeek(e.date);
    if (w.year !== now.year) continue;
    if (realistic && inBudget) { inProjects += cost; continue; }
    if (realistic && e.proposito && apart.has(e.proposito)) { apart.set(e.proposito, apart.get(e.proposito)! + cost); continue; }
    byWeek[Math.min(w.week, WEEKS_IN_YEAR)] += cost; // la semana 53, si la hay, va con la 52
  }

  const weeks: WeekRow[] = [];
  let acc = 0;
  for (let n = 1; n <= WEEKS_IN_YEAR; n++) {
    acc += byWeek[n];
    weeks.push({ num: n, spent: r2(byWeek[n]), accSpent: r2(acc), accGoal: r2(goal * n), avail: r2(goal * n - acc) });
  }
  const totalSpent = r2(acc);
  const spentBefore = week > 1 ? weeks[week - 2].accSpent : 0;
  const spentThis = weeks[week - 1].spent;
  const weeksLeft = WEEKS_IN_YEAR - week + 1;
  const annualGoal = r2(goal * WEEKS_IN_YEAR);
  // Quien empieza a apuntar a mitad de año no tiene «ahorradas» las semanas anteriores:
  // el objetivo cuenta desde la primera semana con gastos, no desde enero
  const first = Math.min(weeks.find(w => w.spent > 0)?.num ?? week, week);
  const periodGoal = r2(goal * (WEEKS_IN_YEAR - first + 1));
  const adjustedGoal = r2(Math.max(0, (periodGoal - spentBefore) / weeksLeft));

  // Ritmo: media de las últimas semanas completas, sin contar las anteriores al primer gasto del año
  const from = Math.max(first, week - PACE_WEEKS);
  const done = weeks.slice(from - 1, week - 1);
  const paceWeeks = done.length;
  const pace = paceWeeks ? r2(done.reduce((s, w) => s + w.spent, 0) / paceWeeks) : spentThis;

  // La semana en curso cuenta como mínimo lo que ya lleva gastado
  const projection = r2(spentBefore + Math.max(spentThis, pace) + pace * (weeksLeft - 1));
  const rounded = Math.max(5, Math.round((pace * 0.9) / 5) * 5);
  const suggestedGoal = paceWeeks >= 2 && pace > 0 && rounded !== goal ? rounded : null;

  const projectRows: ProjectBudget[] = [...budgeted.values()].map(p => {
    const budget = Number(p.budget);
    const spent = r2(byProject.get(p.id) || 0);
    return { id: p.id, name: p.name, budget, spent, left: r2(budget - spent), pct: Math.round((spent / budget) * 100) };
  }).sort((a, b) => b.pct - a.pct);

  return {
    year: now.year, week, weeksLeft, weeks, weeklyGoal: goal, annualGoal, firstWeek: first, periodGoal, totalSpent,
    spentSoFar: r2(spentBefore + spentThis),
    thisWeek: { spent: spentThis, left: r2(adjustedGoal - spentThis), pct: adjustedGoal > 0 ? Math.round((spentThis / adjustedGoal) * 100) : (spentThis > 0 ? 100 : 0) },
    adjustedGoal, pace, paceWeeks, projection, projectionDiff: r2(periodGoal - projection), suggestedGoal,
    projects: projectRows, excluded: r2(inProjects),
    excludedCats: realistic ? [...apart].map(([name, spent]) => ({ name, spent: r2(spent) })) : [],
    excludedByCats: realistic ? r2([...apart.values()].reduce((s, v) => s + v, 0)) : 0,
  };
}
