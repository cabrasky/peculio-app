/* ── Barra de un presupuesto: gastado frente a lo previsto ───────────────── */
import { useLocale, fill } from '../i18n';
import { eur } from '../format';

interface Props {
  spent: number;
  budget: number;
  compact?: boolean; // en tablas: sin la línea de «quedan / superado»
}

export default function BudgetBar({ spent, budget, compact = false }: Props) {
  const { t } = useLocale();
  const left = budget - spent;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  return (
    <div className="budget-bar">
      <div className="budget-line">
        <span>{fill(t('proj.budgetOf'), { s: eur(spent), b: eur(budget) })}</span>
        {!compact && (
          <span className={left >= 0 ? 'positive' : 'negative'}>
            {fill(t(left >= 0 ? 'proj.budgetLeft' : 'proj.budgetOver'), { v: eur(Math.abs(left)) })}
          </span>
        )}
      </div>
      <div className="progress-wrap" style={{ height: 6 }}>
        <div className={`progress-fill ${left >= 0 ? 'success' : 'danger'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
