import { useMemo } from 'react';
import { expenseCost, getMonth, bucketOf } from '../types';
import { useLocale } from '../i18n';
import type { Expense } from '../types';
import { eur } from '../format';
import { CHART, SERIES } from '../palette';

interface Props {
  expenses: Expense[];
}

export default function MonthlySummary({ expenses }: Props) {
  const { t } = useLocale();
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const name = t(`ref.months.${m}`);
      const exps = expenses.filter(e => getMonth(e.date) === m);
      const total = exps.reduce((s, e) => s + expenseCost(e), 0);
      const fijo = exps.filter(e => bucketOf(e) === 'fijo').reduce((s, e) => s + expenseCost(e), 0);
      const puntual = exps.filter(e => bucketOf(e) === 'puntual').reduce((s, e) => s + expenseCost(e), 0);
      const viajes = exps.filter(e => bucketOf(e) === 'viajes').reduce((s, e) => s + expenseCost(e), 0);
      const inversion = exps.filter(e => bucketOf(e) === 'inversion').reduce((s, e) => s + expenseCost(e), 0);
      const vida = fijo + puntual + viajes;
      return { name, total, fijo, puntual, viajes, vida, inversion, count: exps.length };
    });
  }, [expenses, t]);

  const grandTotal = months.reduce((s, m) => s + m.total, 0);
  const avg = grandTotal / 12;

  const totals = {
    fijo: months.reduce((s, m) => s + m.fijo, 0),
    puntual: months.reduce((s, m) => s + m.puntual, 0),
    viajes: months.reduce((s, m) => s + m.viajes, 0),
    vida: months.reduce((s, m) => s + m.vida, 0),
    inversion: months.reduce((s, m) => s + m.inversion, 0),
  };

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="label">{t('monthly.yearTotal')}</div><div className="value primary">{eur(grandTotal)}</div></div>
        <div className="stat"><div className="label">{t('monthly.avgMonth')}</div><div className="value">{eur(avg)}</div></div>
        <div className="stat"><div className="label">{t('monthly.count')}</div><div className="value">{expenses.length}</div></div>
        <div className="stat"><div className="label">{t('monthly.avgSpend')}</div><div className="value">{eur(expenses.length ? grandTotal / expenses.length : 0)}</div></div>
      </div>

      <div className="card">
        <h3>{t('monthly.summary')}</h3>
        <div className="table-wrap">
          <table className="table-compact">
            <thead>
              <tr><th>{t('common.month')}</th><th>{t('ref.purposes.fijo')}</th><th>{t('ref.purposes.puntual')}</th><th>{t('ref.purposes.viajes')}</th><th>{t('monthly.lifeShort')}</th><th>{t('ref.purposes.inversion')}</th><th>{t('common.total')}</th><th>#</th></tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={i}>
                  <td><strong>{m.name}</strong></td>
                  <td>{m.fijo.toFixed(2)}</td>
                  <td>{m.puntual.toFixed(2)}</td>
                  <td>{m.viajes.toFixed(2)}</td>
                  <td>{m.vida.toFixed(2)}</td>
                  <td>{m.inversion.toFixed(2)}</td>
                  <td className="td-amount">{m.total.toFixed(2)}</td>
                  <td>{m.count}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>{t('common.total')}</td>
                <td>{totals.fijo.toFixed(2)}</td>
                <td>{totals.puntual.toFixed(2)}</td>
                <td>{totals.viajes.toFixed(2)}</td>
                <td>{totals.vida.toFixed(2)}</td>
                <td>{totals.inversion.toFixed(2)}</td>
                <td className="td-amount">{grandTotal.toFixed(2)}</td>
                <td>{expenses.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>{t('monthly.distribution')}</h3>
        <div className="bar-list">
          {[
            { label: t('ref.purposes.fijo'), val: totals.fijo, color: CHART.neutral },
            { label: t('ref.purposes.puntual'), val: totals.puntual, color: SERIES[5] },
            { label: t('ref.purposes.viajes'), val: totals.viajes, color: SERIES[6] },
            { label: t('ref.purposes.nivel'), val: totals.vida, color: SERIES[0] },
            { label: t('ref.purposes.inversion'), val: totals.inversion, color: SERIES[4] },
          ].map(({ label, val, color }) => {
            const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : 0;
            return (
              <div key={label} className="bar-row">
                <span className="bar-label">{label}</span>
                <div className="progress-wrap">
                  <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="bar-value">{eur(val)} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
