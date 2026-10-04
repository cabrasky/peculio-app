import { useMemo } from 'react';
import { expenseCost } from '../types';
import type { Expense } from '../types';
import { WeeklyProgressChart } from './Charts';
import { useLocale, fill } from '../i18n';
import { eur } from '../format';
import { IconCalendar } from './Icons';

function weekOfYear(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

interface Props {
  expenses: Expense[];
  weeklyGoal: number;
  onGoalChange: (v: number) => void;
}

export default function WeeklyBudget({ expenses, weeklyGoal, onGoalChange }: Props) {
  const { t } = useLocale();
  const { weeks, totalSpent, totalGoal, onTrack } = useMemo(() => {
    const weekMap: Record<number, number> = {};
    expenses.forEach(e => {
      if (!e.date) return;
      const wk = weekOfYear(e.date);
      weekMap[wk] = (weekMap[wk] || 0) + expenseCost(e);
    });

    const weeks = [];
    for (let w = 1; w <= 52; w++) {
      const spent = weekMap[w] || 0;
      const accGoal = weeklyGoal * w;
      const accSpent = Object.entries(weekMap).filter(([k]) => Number(k) <= w).reduce((s, [, v]) => s + v, 0);
      weeks.push({ num: w, spent, accGoal, accSpent, avail: accGoal - accSpent });
    }

    const totalSpent = weeks.reduce((s, w) => s + w.spent, 0);
    const totalGoal = weeklyGoal * 52;
    return { weeks, totalSpent, totalGoal, onTrack: totalSpent <= totalGoal };
  }, [expenses, weeklyGoal]);

  const pct = totalGoal > 0 ? Math.min(100, (totalSpent / totalGoal) * 100) : 0;

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="label">{t('weekly.goal')}</div><div className="value primary">{weeklyGoal} €</div></div>
        <div className="stat"><div className="label">{t('weekly.annualGoal')}</div><div className="value">{eur(totalGoal)}</div></div>
        <div className="stat"><div className="label">{t('weekly.spent')}</div><div className={`value ${onTrack ? 'positive' : 'negative'}`}>{eur(totalSpent)}</div></div>
        <div className="stat"><div className="label">{t('weekly.diff')}</div><div className={`value ${onTrack ? 'positive' : 'negative'}`}>{eur((totalGoal - totalSpent))}</div></div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 className="h3-icon"><IconCalendar size={16} />{t('weekly.progress')}</h3>
          <label style={{ fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: 4 }}>
            {t('weekly.goalInput')}
            <input type="number" value={weeklyGoal} onChange={e => onGoalChange(Number(e.target.value))}
              style={{ width: 70, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)' }} />
            €
          </label>
        </div>
        <div className="progress-wrap" style={{ margin: '12px 0', height: 12 }}>
          <div className={`progress-fill ${onTrack ? 'success' : 'danger'}`} style={{ width: `${pct}%` }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          {eur(totalSpent)} / {eur(totalGoal)} ({pct.toFixed(1)}%)
        </div>
        <div className="week-grid">
          {weeks.map(w => {
            const wpct = w.accGoal > 0 ? Math.min(100, (w.accSpent / w.accGoal) * 100) : 0;
            return (
              <div key={w.num} className="week-item">
                <div className="wk-num">{fill(t('weekly.weekShort'), { n: w.num })}</div>
                <div className="wk-meta">{eur(w.spent)}</div>
                <div className={`wk-amount ${w.avail >= 0 ? 'positive' : 'negative'}`}>{eur(w.avail)}</div>
                <div className="progress-wrap" style={{ height: 4, marginTop: 4 }}>
                  <div className={`progress-fill ${wpct > 100 ? 'danger' : 'success'}`} style={{ width: `${Math.min(100, wpct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <WeeklyProgressChart weeks={weeks} goal={weeklyGoal} />
    </>
  );
}
