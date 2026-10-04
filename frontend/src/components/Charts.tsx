import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line
} from 'recharts';
import { expenseCost, getMonth, bucketOf } from '../types';
import type { Expense, Income } from '../types';
import { useLocale, fill, refLabel, LOCALE_TAG } from '../i18n';
import { CHART, SERIES } from '../palette';
import { eur } from '../format';

const COLORS = SERIES;
type T = (key: string) => string;
const shortMonths = (t: T) => Array.from({ length: 12 }, (_, i) => t(`ref.months.short.${i + 1}`));

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--text)',
  fontSize: 13,
};

const formatEuro = (v: number | string) => eur(Number(v), 0);

/* ── Daily trend line charts (semana y mes) ─────────────────────── */
function isoDay(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

export function DailyTrendCharts({ expenses }: { expenses: Expense[] }) {
  const { t, locale } = useLocale();
  const { week, month } = useMemo(() => {
    const wd = (d: Date) => d.toLocaleDateString(LOCALE_TAG[locale], { weekday: 'short' }).replace('.', '');
    const byDay = new Map<string, number>();
    expenses.forEach(e => byDay.set(e.date, (byDay.get(e.date) || 0) + expenseCost(e)));
    const today = new Date();
    const weekData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const k = isoDay(d);
      weekData.push({ label: `${wd(d)} ${d.getDate()}`, total: +(byDay.get(k) || 0) });
    }
    const monthData = [];
    for (let dnum = 1; dnum <= today.getDate(); dnum++) {
      const d = new Date(today.getFullYear(), today.getMonth(), dnum);
      const k = isoDay(d);
      monthData.push({ label: `${dnum}`, total: +(byDay.get(k) || 0) });
    }
    return { week: weekData, month: monthData };
  }, [expenses, locale]);

  return (
    <>
      <div className="card">
        <h3>{t('chart.dailyWeek')}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={week} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v) => `${v}`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [eur(Number(v)), t('chart.spend')]} />
            <Line type="monotone" dataKey="total" stroke={CHART.income} strokeWidth={2.5} dot={{ r: 3 }} name={t('chart.spend')} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="card">
        <h3>{fill(t('chart.dailyMonth'), { m: t(`ref.months.${new Date().getMonth() + 1}`) })}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={month} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v) => `${v}`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [eur(Number(v)), t('chart.spend')]} />
            <Line type="monotone" dataKey="total" stroke={CHART.expense} strokeWidth={2.5} dot={{ r: 3 }} name={t('chart.spend')} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ── Monthly Expense Bar Chart (existing) ────────────────────────── */
export function MonthlyChart({ expenses }: { expenses: Expense[] }) {
  const { t } = useLocale();
  const { months, totals } = useMemo(() => {
    const data = shortMonths(t).map((name, i) => {
      const exps = expenses.filter(e => getMonth(e.date) === i + 1);
      return { name, total: exps.reduce((s, e) => s + expenseCost(e), 0) };
    });
    const b = {
      fijo: expenses.filter(e => bucketOf(e) === 'fijo').reduce((s, e) => s + expenseCost(e), 0),
      puntual: expenses.filter(e => bucketOf(e) === 'puntual').reduce((s, e) => s + expenseCost(e), 0),
      viajes: expenses.filter(e => bucketOf(e) === 'viajes').reduce((s, e) => s + expenseCost(e), 0),
      inversion: expenses.filter(e => bucketOf(e) === 'inversion').reduce((s, e) => s + expenseCost(e), 0),
    };
    const vida = b.fijo + b.puntual + b.viajes;
    return { months: data, totals: { ...b, vida } };
  }, [expenses, t]);

  const pieData = [
    { name: t('ref.purposes.fijo'), value: totals.fijo },
    { name: t('ref.purposes.puntual'), value: totals.puntual },
    { name: t('ref.purposes.viajes'), value: totals.viajes },
    { name: t('ref.purposes.nivel'), value: totals.vida },
    { name: t('ref.purposes.inversion'), value: totals.inversion },
  ].filter(d => d.value > 0);

  return (
    <>
      <div className="card">
        <h3>{t('monthly.chart')}</h3>
        <div className="chart-container">
          <ResponsiveContainer>
            <BarChart data={months} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={formatEuro} />
              <Tooltip formatter={(v: any) => [eur(Number(v)), t('common.total')]} contentStyle={tooltipStyle} />
              <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {pieData.length > 0 && (
        <div className="card">
          <h3>{t('monthly.pieChart')}</h3>
          <div className="chart-container chart-pie">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                </Pie>
                <Tooltip formatter={(v: any) => [eur(Number(v))]} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Cash Flow: Income vs Expenses per month (grouped bar) ──────── */
export function CashFlowChart({ expenses, incomes }: { expenses: Expense[]; incomes: Income[] }) {
  const { t } = useLocale();
  const data = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return shortMonths(t).map((name, i) => {
      const m = i + 1;
      const exps = expenses.filter(e => getMonth(e.date) === m && e.date.startsWith(String(year)));
      const incs = incomes.filter(e => getMonth(e.date) === m && e.date.startsWith(String(year)));
      return {
        name,
        gastos: exps.reduce((s, e) => s + expenseCost(e), 0),
        ingresos: incs.reduce((s, i) => s + i.amount, 0),
      };
    });
  }, [expenses, incomes, t]);

  const totalIngresos = data.reduce((s, d) => s + d.ingresos, 0);
  const totalGastos = data.reduce((s, d) => s + d.gastos, 0);
  const balance = totalIngresos - totalGastos;

  return (
    <div className="card">
      <div className="card-header">
        <h3>{t('chart.cashFlow')}</h3>
        <span className={`card-total ${balance >= 0 ? 'positive' : 'negative'}`}>
          {balance >= 0 ? '+' : ''}{eur(balance, 0)}
        </span>
      </div>
      <div className="chart-container">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={formatEuro} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="ingresos" name={t('dashboard.incomes')} fill={CHART.income} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="gastos" name={t('dashboard.expenses')} fill={CHART.expense} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend-row">
        <span><span className="legend-dot" style={{ background: CHART.income }} /> {t('dashboard.incomes')}: {eur(totalIngresos, 0)}</span>
        <span><span className="legend-dot" style={{ background: CHART.expense }} /> {t('dashboard.expenses')}: {eur(totalGastos, 0)}</span>
      </div>
    </div>
  );
}

/* ── Cumulative Balance Line (year evolution) ────────────────────── */
export function BalanceEvolution({ expenses, incomes }: { expenses: Expense[]; incomes: Income[] }) {
  const { t } = useLocale();
  const data = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    let running = 0;
    return shortMonths(t).map((name, i) => {
      const m = i + 1;
      const exps = expenses.filter(e => getMonth(e.date) === m && e.date.startsWith(String(year)));
      const incs = incomes.filter(e => getMonth(e.date) === m && e.date.startsWith(String(year)));
      const monthInc = incs.reduce((s, i) => s + i.amount, 0);
      const monthExp = exps.reduce((s, e) => s + expenseCost(e), 0);
      running += (monthInc - monthExp);
      return { name, balance: running, ingresos: monthInc, gastos: monthExp };
    });
  }, [expenses, incomes, t]);

  const finalBalance = data.length > 0 ? data[data.length - 1].balance : 0;

  return (
    <div className="card">
      <div className="card-header">
        <h3>{t('chart.balanceEvolution')}</h3>
        <span className={`card-total ${finalBalance >= 0 ? 'positive' : 'negative'}`}>
          {eur(finalBalance, 0)}
        </span>
      </div>
      <div className="chart-container">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={formatEuro} />
            <Tooltip
              formatter={(v: any) => [eur(Number(v))]}
              contentStyle={tooltipStyle}
              labelFormatter={(l) => fill(t('chart.balanceAt'), { l: String(l) })}
            />
            <Area type="monotone" dataKey="balance" name={t('dashboard.balanceLabel')} stroke="var(--primary)" fill="url(#balanceGrad)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--primary)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Income vs Expense Distribution (horizontal comparison) ──────── */
export function IncomeExpenseComparison({ expenses, incomes }: { expenses: Expense[]; incomes: Income[] }) {
  const { t } = useLocale();
  const data = useMemo(() => {
    const expByCat: Record<string, number> = {};
    expenses.forEach(e => {
      const cat = e.proposito || t('ref.categories.other');
      expByCat[cat] = (expByCat[cat] || 0) + expenseCost(e);
    });
    const incByCat: Record<string, number> = {};
    incomes.forEach(i => {
      incByCat[i.category] = (incByCat[i.category] || 0) + i.amount;
    });

    const topExp = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topInc = Object.entries(incByCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxVal = Math.max(
      ...topExp.map(([, v]) => v),
      ...topInc.map(([, v]) => v),
      1
    );

    return { topExp, topInc, maxVal };
  }, [expenses, incomes, t]);

  return (
    <div className="card">
      <h3>{t('chart.comparison')}</h3>
      <div className="comparison-grid">
        <div>
          <h4 style={{ color: 'var(--danger)', marginBottom: 8 }}>{t('chart.expByPurpose')}</h4>
          {data.topExp.map(([name, val]) => (
            <div key={name} className="bar-row" style={{ marginBottom: 4 }}>
              <span className="bar-label" style={{ minWidth: 80, fontSize: '.75rem' }}>{refLabel('categories', name, t)}</span>
              <div className="progress-wrap" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: `${(val / data.maxVal) * 100}%`, background: CHART.expense }} />
              </div>
              <span className="bar-value" style={{ minWidth: 80, fontSize: 12 }}>{eur(val, 0)}</span>
            </div>
          ))}
        </div>
        <div>
          <h4 style={{ color: 'var(--success)', marginBottom: 8 }}>{t('chart.incByCategory')}</h4>
          {data.topInc.map(([name, val]) => (
            <div key={name} className="bar-row" style={{ marginBottom: 4 }}>
              <span className="bar-label" style={{ minWidth: 80, fontSize: '.75rem' }}>{refLabel('incomeCats', name, t)}</span>
              <div className="progress-wrap" style={{ flex: 1 }}>
                <div className="progress-fill" style={{ width: `${(val / data.maxVal) * 100}%`, background: CHART.income }} />
              </div>
              <span className="bar-value" style={{ minWidth: 80, fontSize: 12 }}>{eur(val, 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Weekly Progress (existing) ──────────────────────────────────── */
export function WeeklyProgressChart({ weeks, goal }: { weeks: { num: number; spent: number }[]; goal: number }) {
  const { t } = useLocale();
  const data = weeks.map(w => ({ name: fill(t('weekly.weekLetter'), { n: w.num }), spent: w.spent, goal }));
  return (
    <div className="card">
      <h3>{t('weekly.chart')}</h3>
      <div className="chart-container chart-small">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={formatEuro} />
            <Tooltip formatter={(v: any) => [eur(Number(v))]} contentStyle={tooltipStyle} />
            <Bar dataKey="goal" name={t('weekly.goal')} fill="var(--border)" radius={[2, 2, 0, 0]} maxBarSize={12} />
            <Bar dataKey="spent" name={t('weekly.spent')} fill="var(--primary)" radius={[2, 2, 0, 0]} maxBarSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ── Sankey Diagram: Income → Disponible → Destinations ──────────── */
export function SankeyChart({ expenses, incomes }: { expenses: Expense[]; incomes: Income[] }) {
  const { t } = useLocale();
  const sankey = useMemo(() => {
    // ── Sources: group small incomes ──
    const incMap: Record<string, number> = {};
    incomes.forEach(i => { const c = refLabel('incomeCats', i.category, t); incMap[c] = (incMap[c] || 0) + i.amount; });
    let rawSrc = Object.entries(incMap).sort((a, b) => b[1] - a[1]);
    const totalInc = rawSrc.reduce((s, [, v]) => s + v, 0);
    let sources: [string, number][] = [];
    if (rawSrc.length <= 2) {
      sources = rawSrc;
    } else {
      const top2 = rawSrc.slice(0, 2);
      const otherSum = rawSrc.slice(2).reduce((s, [, v]) => s + v, 0);
      sources = [...top2, [t('chart.otherIncome'), otherSum]];
    }
    sources.sort((a, b) => b[1] - a[1]);

    // ── Targets: separate into groups ──
    const expMap: Record<string, number> = {};
    expenses.forEach(e => { expMap[e.proposito] = (expMap[e.proposito] || 0) + expenseCost(e); });
    const totalExp = expenses.reduce((s, e) => s + expenseCost(e), 0);
    const remainder = Math.max(0, totalInc - totalExp);

    type TargetGroup = 'savings' | 'fixed' | 'disc' | 'other';
    const targets: { name: string; val: number; group: TargetGroup }[] = [];

    if (remainder > 0) targets.push({ name: t('chart.savings'), val: remainder, group: 'savings' });
    if (expMap['Inversión']) targets.push({ name: 'Inversión', val: expMap['Inversión'], group: 'savings' });

    for (const n of ['Fijo', 'Nivel de Vida'] as const) {
      if (expMap[n]) targets.push({ name: n, val: expMap[n], group: 'fixed' });
    }

    for (const n of ['Viajes', 'Puntual'] as const) {
      if (expMap[n]) targets.push({ name: n, val: expMap[n], group: 'disc' });
    }

    for (const [n, v] of Object.entries(expMap)) {
      if (!targets.find(t => t.name === n)) {
        targets.push({ name: n, val: v, group: 'other' });
      }
    }

    // Nombres visibles traducidos (los buckets heredados y las categorías guardadas)
    const BUCKET: Record<string, string> = { 'Inversión': 'ref.purposes.inversion', Fijo: 'ref.purposes.fijo', 'Nivel de Vida': 'ref.purposes.nivel', Viajes: 'ref.purposes.viajes', Puntual: 'ref.purposes.puntual' };
    targets.forEach(tg => { tg.name = BUCKET[tg.name] ? t(BUCKET[tg.name]) : tg.group === 'other' ? refLabel('categories', tg.name, t) : tg.name; });
    return { sources, targets, totalInc };
  }, [expenses, incomes, t]);

  const { sources, targets } = sankey;

  // ── Layout ──
  const W = 640, H = 440, PAD = 30, GAP = 8;
  const MIN_H = 8;
  const COL_W = 14;                       // node bar width
  const LEFT_X = 80, RIGHT_X = 395;       // node bar x positions
  const availH = H - 2 * PAD;
  const SRC_EDGE = LEFT_X + COL_W;        // right edge of source bars
  const TGT_EDGE = RIGHT_X;               // left edge of target bars

  // ── Colors ──
  const srcColors = [CHART.income, '#2F6A51', '#8CC7A5'];
  const grpColor: Record<string, string> = {
    savings: SERIES[6], fixed: SERIES[5], disc: CHART.expense, other: SERIES[4],
  };
  const grpOpacity: Record<string, number> = {
    savings: 0.20, fixed: 0.17, disc: 0.14, other: 0.15,
  };

  // ── Node geometry ──
  // Source nodes (left column)
  const srcTotal = sources.reduce((s, [, v]) => s + v, 0) || 1;
  const tgtTotal = targets.reduce((s, t) => s + t.val, 0) || 1;
  const srcAH = availH - (sources.length - 1) * GAP;
  const srcH = sources.map(([, v]) => Math.max(MIN_H, (v / srcTotal) * srcAH));
  let sy = PAD;
  const srcNodes = sources.map(([name, val], i) => {
    const y = sy; sy += srcH[i] + GAP;
    return { name, val, y, h: srcH[i], b: y + srcH[i], color: srcColors[i % srcColors.length] };
  });

  // Target nodes (right column)
  const tgtAH = availH - (targets.length - 1) * GAP;
  const tgtH = targets.map(t => Math.max(MIN_H, (t.val / tgtTotal) * tgtAH));
  let ty = PAD;
  const tgtNodes = targets.map((t, i) => {
    const y = ty; ty += tgtH[i] + GAP;
    return { name: t.name, val: t.val, y, h: tgtH[i], b: y + tgtH[i], color: grpColor[t.group] || SERIES[4], group: t.group };
  });

  // ── Build flows (port-based: each source→target pair gets a slice) ──
  // Cumulative proportions so each source distributes to all targets
  // and each target receives from all sources.
  let cumT = 0;
  const tgtProp = targets.map(t => { const s = cumT; cumT += t.val / tgtTotal; return { start: s, end: cumT }; });
  let cumS = 0;
  const srcProp = sources.map(([, v]) => { const s = cumS; cumS += v / srcTotal; return { start: s, end: cumS }; });

  const totalDisp = sankey.totalInc;
  const MIN_FLOW = totalDisp * 0.002;     // skip flows under 0.2%

  interface Link { si: number; ti: number; sT: number; sB: number; tT: number; tB: number; val: number; grp: string; }
  const links: Link[] = [];

  for (let si = 0; si < sources.length; si++) {
    for (let ti = 0; ti < targets.length; ti++) {
      const flow = (sources[si][1] / srcTotal) * targets[ti].val;
      if (flow < MIN_FLOW) continue;
      const sT = srcNodes[si].y + tgtProp[ti].start * srcH[si];
      const sB = srcNodes[si].y + tgtProp[ti].end * srcH[si];
      const tT = tgtNodes[ti].y + srcProp[si].start * tgtH[ti];
      const tB = tgtNodes[ti].y + srcProp[si].end * tgtH[ti];
      links.push({ si, ti, sT, sB, tT, tB, val: flow, grp: targets[ti].group });
    }
  }

  // ── Single continuous flow path: source-edge → target-edge ──
  // easeInOut-inspired control points at 40% / 60%
  const dx = TGT_EDGE - SRC_EDGE;
  const CP = dx * 0.40;
  const flowPath = (sT: number, sB: number, tT: number, tB: number) =>
    `M${SRC_EDGE} ${sT} C${SRC_EDGE + CP} ${sT}, ${TGT_EDGE - CP} ${tT}, ${TGT_EDGE} ${tT} L${TGT_EDGE} ${tB} C${TGT_EDGE - CP} ${tB}, ${SRC_EDGE + CP} ${sB}, ${SRC_EDGE} ${sB} Z`;

  // ── Group section dividers — positioned at exact gap midpoint ──
  const grpFirst: Record<string, number> = {};
  targets.forEach((t, i) => { if (grpFirst[t.group] === undefined) grpFirst[t.group] = i; });
  const groupDivs = Object.entries(grpFirst).map(([g, idx]) => {
    const node = tgtNodes[idx];
    // If it's the first group, divider is just above the first node
    const prevBottom = idx > 0 ? tgtNodes[idx - 1].b : PAD;
    const midY = Math.round((prevBottom + node.y) / 2);
    return {
      label: g === 'savings' ? t('chart.savingsGroup') : g === 'fixed' ? t('chart.fixedGroup') : g === 'disc' ? t('chart.variableGroup') : '',
      color: grpColor[g],
      y: midY,
    };
  }).filter(d => d.label);

  // ── Hub label — centered on the flow bounding box ──
  const labelMidX = Math.round((SRC_EDGE + TGT_EDGE) / 2);
  // Vertical center: weighted by flow volume, or just H/2
  const labelY = Math.round(H / 2);

  // ── Helpers ──
  const fmt = (v: number) => {
    const s = Math.round(v).toString();
    const parts: string[] = [];
    for (let i = s.length; i > 0; i -= 3) parts.unshift(s.slice(Math.max(0, i - 3), i));
    return parts.join('\u00A0') + '\u00A0€';
  };
  const pct = (v: number) => ((v / totalDisp) * 100).toFixed(0) + '\u00A0%';

  return (
    <div className="card">
      <div className="card-header">
        <h3 style={{fontSize:'.85rem'}}>{t('chart.moneyFlow')}</h3>
      </div>
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520, maxHeight: 440 }}>
          <defs>
            <filter id="hubShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx={0} dy={1} stdDeviation={1.5} floodColor="#000" floodOpacity={0.10} />
            </filter>
          </defs>

          {/* ═══ Direct source → target flows (port-based, single river) ═══ */}
          {links.map((lnk, i) => (
            <path key={`l${i}`}
              d={flowPath(lnk.sT, lnk.sB, lnk.tT, lnk.tB)}
              fill={grpColor[lnk.grp] || SERIES[4]} fillOpacity={grpOpacity[lnk.grp] || 0.15} stroke="none" />
          ))}

          {/* ═══ Hub label — no badge, text with outline over the flow ═══ */}
          <g filter="url(#hubShadow)">
            <text x={labelMidX} y={labelY - 8}
              textAnchor="middle" fill="var(--text)" fontSize={12} fontWeight={700}
              stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">{t('chart.available')}</text>
            <text x={labelMidX} y={labelY + 14}
              textAnchor="middle" fill="var(--primary)" fontSize={16} fontWeight={800}
              stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">{fmt(totalDisp)}</text>
          </g>

          {/* ═══ Source nodes (left) ═══ */}
          <text x={LEFT_X} y={PAD - 8} textAnchor="start" fill="var(--text-muted)"
            fontSize={9} fontWeight={700} letterSpacing="0.14em">{t('chart.incomesCaps')}</text>
          {srcNodes.map((s, i) => (
            <g key={`s${i}`}>
              <rect x={LEFT_X} y={s.y} width={COL_W} height={s.h} fill={s.color} rx={2} />
              <text x={LEFT_X - 4} y={s.y + s.h / 2 + 4} textAnchor="end" fill="var(--text)" fontSize={12} fontWeight={600}>{s.name}</text>
              <text x={LEFT_X - 4} y={s.y + s.h / 2 + 17} textAnchor="end" fill="var(--text-muted)" fontSize={10}>{fmt(s.val)}</text>
              <text x={LEFT_X - 4} y={s.y + s.h / 2 + 27} textAnchor="end" fill="var(--text-muted)" fontSize={9}>{pct(s.val)}</text>
            </g>
          ))}

          {/* ═══ Target nodes (right), grouped ═══ */}
          {groupDivs.map((d, i) => (
            <g key={`gd${i}`}>
              <line x1={RIGHT_X} y1={d.y} x2={RIGHT_X + COL_W + 80} y2={d.y}
                stroke={d.color} strokeWidth={0.5} opacity={0.30} />
              <text x={RIGHT_X + COL_W + 14} y={d.y + 14}
                textAnchor="start" fill={d.color} fontSize={9} fontWeight={700} letterSpacing="0.10em" opacity={0.65}>
                ─ {d.label}
              </text>
            </g>
          ))}
          {tgtNodes.map((t, i) => (
            <g key={`t${i}`}>
              <rect x={RIGHT_X} y={t.y} width={COL_W} height={t.h} fill={t.color} rx={2} />
              <text x={RIGHT_X + COL_W + 14} y={t.y + t.h / 2 + 4} textAnchor="start" fill="var(--text)" fontSize={12} fontWeight={600}>{t.name}</text>
              <text x={RIGHT_X + COL_W + 14} y={t.y + t.h / 2 + 17} textAnchor="start" fill="var(--text-muted)" fontSize={10} style={{fontVariantNumeric:'tabular-nums'}}>{fmt(t.val)}</text>
              <text x={RIGHT_X + COL_W + 14} y={t.y + t.h / 2 + 27} textAnchor="start" fill="var(--text-muted)" fontSize={9} style={{fontVariantNumeric:'tabular-nums'}}>{pct(t.val)}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}


/* ── Filtro por categorías (chips) ───────────────────────────────── */
export const CAT_COLORS = SERIES;

export function CategoryFilter({ cats, selected, onChange }: {
  cats: { name: string; color?: string }[];
  selected: string[];
  onChange: (s: string[]) => void;
}) {
  const { t } = useLocale();
  const toggle = (name: string) => {
    if (name === '__all__') { onChange([]); return; }
    onChange(selected.includes(name) ? selected.filter(c => c !== name) : [...selected, name]);
  };
  const chip = (label: string, active: boolean, color?: string, key?: string) => (
    <button key={key || label} onClick={() => toggle(key || label)} aria-pressed={active}
      className={`xg-chip${active ? ' on' : ''}`}>
      {color && <span className="xg-dot" style={{ background: color }} />}{label}
    </button>
  );
  return (
    <div className="card">
      <h3 style={{ marginBottom: 10 }}>{t('chart.categoryFilter')}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {chip(t('common.allF'), selected.length === 0, undefined, '__all__')}
        {cats.map((c, i) => chip(refLabel('categories', c.name, t), selected.includes(c.name), c.color || CAT_COLORS[i % CAT_COLORS.length], c.name))}
      </div>
      {selected.length > 0 && (
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>{fill(t('chart.showingOnly'), { l: selected.map(s => refLabel('categories', s, t)).join(' · ') })}</p>
      )}
    </div>
  );
}

/* ── Comparativa y media por categoría (meses y años) ────────────── */
function monthId(d: Date) { return d.getFullYear() * 12 + d.getMonth(); }
function fmtMonth(y: number, m: number, t: T) {
  return t(`ref.months.short.${m + 1}`) + ' ' + String(y).slice(2);
}


export function CategoryCompare({ expenses, cats }: { expenses: any[]; cats: { name: string; color?: string }[] }) {
  const { t, locale } = useLocale();
  const eur = (n: number) => n.toLocaleString(LOCALE_TAG[locale], { style: 'currency', currency: 'EUR' });
  const now = new Date();
  const curM = monthId(now), prevM = curM - 1, lastYM = curM - 12;
  const byCat: Record<string, any[]> = {};
  expenses.forEach(e => { (byCat[e.proposito] = byCat[e.proposito] || []).push(e); });

  const series: any[] = [];
  for (let k = curM - 17; k <= curM; k++) { series.push({ label: fmtMonth(Math.floor(k / 12), k % 12, t), k }); }

  const tot = (items: Expense[], ms: number) => items.filter(e => monthId(new Date(e.date)) === ms).reduce((s2, e) => s2 + expenseCost(e), 0);

  const statCats = cats.map((c, ci) => {
    const items = byCat[c.name] || [];
    const color = c.color || CAT_COLORS[ci % CAT_COLORS.length];
    const monthsMap = new Map<number, number>();
    items.forEach(e => { const k = monthId(new Date(e.date)); monthsMap.set(k, (monthsMap.get(k) || 0) + expenseCost(e)); });
    const vals = [...monthsMap.values()];
    return {
      name: c.name, color, items,
      _cur: tot(items, curM), _prev: tot(items, prevM), _lastY: tot(items, lastYM),
      _avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
    };
  });

  cats.forEach((c) => {
    series.forEach(p => { p[c.name] = Math.round(tot(byCat[c.name] || [], p.k) * 100) / 100; });
  });

  return (
    <div className="card">
      <h3>{t('chart.categoryCompare')}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
        {statCats.map(c => (
          <div key={c.name} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', background: 'var(--surface2)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: c.color, display: 'inline-block' }} />
              {refLabel('categories', c.name, t)}
            </div>
            <table style={{ width: '100%', marginTop: 8, fontSize: 12 }}>
              <tbody>
                <tr><td className="muted">{t('dashboard.thisMonth')}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{eur(c._cur)}</td></tr>
                <tr><td className="muted">{t('chart.lastMonth')}</td><td style={{ textAlign: 'right' }}>{eur(c._prev)}</td></tr>
                <tr><td className="muted">{t('chart.yearAgo')}</td><td style={{ textAlign: 'right' }}>{eur(c._lastY)}</td></tr>
                <tr><td className="muted">{t('chart.monthlyAvg')}</td><td style={{ textAlign: 'right' }}>{eur(Math.round(c._avg * 100) / 100)}</td></tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
      {statCats.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 13, marginBottom: 6 }}>{t('chart.evolution18')}</h4>
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={series} margin={{ top: 5, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => eur(Number(v) || 0)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {statCats.map(c => (
                <Line key={c.name} type="monotone" dataKey={c.name} name={refLabel('categories', c.name, t)} stroke={c.color} strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
