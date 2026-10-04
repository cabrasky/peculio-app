import { useMemo, useState } from 'react';
import { expenseCost } from '../types';
import type { Expense } from '../types';
import { loadData } from '../store';
import { weeklyPlan } from '../weekly';
import { WeeklyProgressChart } from './Charts';
import BudgetBar from './BudgetBar';
import { useLocale, fill } from '../i18n';
import { eur } from '../format';
import { IconCalendar } from './Icons';

interface Props {
  expenses: Expense[];
  weeklyGoal: number;
  onGoalChange: (v: number) => void;
}

type Mode = 'real' | 'all';
const MODE_KEY = 'peculio.weekly.mode';

// El modo elegido se recuerda en este navegador (puede no haber almacenamiento: modo privado)
function loadMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === 'all' ? 'all' : 'real'; } catch { return 'real'; }
}

export default function WeeklyBudget({ expenses, weeklyGoal, onGoalChange }: Props) {
  const { t } = useLocale();
  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* sin almacenamiento */ }
  };
  const real = mode === 'real';
  const projects = loadData().projects;
  const plan = useMemo(
    () => weeklyPlan(expenses, projects, weeklyGoal, new Date(), real, expenseCost),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, weeklyGoal, real, projects.map(p => `${p.id}:${p.budget || 0}`).join()],
  );
  const { weeks, totalSpent, annualGoal: totalGoal, thisWeek } = plan;
  const onTrack = totalSpent <= totalGoal;
  const pct = totalGoal > 0 ? Math.min(100, (totalSpent / totalGoal) * 100) : 0;

  return (
    <>
      <div className="pp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={real} className={real ? 'on' : ''} onClick={() => setMode('real')}>{t('weekly.modeReal')}</button>
        <button type="button" role="tab" aria-selected={!real} className={!real ? 'on' : ''} onClick={() => setMode('all')}>{t('weekly.modeAll')}</button>
      </div>

      {real ? (
        <>
          <div className="stats">
            <div className="stat">
              <div className="label">{t('weekly.thisWeek')}</div>
              <div className={`value ${thisWeek.left >= 0 ? 'positive' : 'negative'}`}>{eur(thisWeek.spent)}</div>
              <div className="stat-sub">{fill(t('weekly.ofAdjusted'), { v: eur(plan.adjustedGoal) })}</div>
            </div>
            <div className="stat">
              <div className="label">{t('weekly.adjusted')}</div>
              <div className="value primary">{eur(plan.adjustedGoal)}</div>
              <div className="stat-sub">{t('weekly.goal')}: {eur(weeklyGoal)}</div>
            </div>
            <div className="stat">
              <div className="label">{t('weekly.pace')}</div>
              <div className={`value ${plan.pace <= weeklyGoal ? 'positive' : 'negative'}`}>{eur(plan.pace)}</div>
              <div className="stat-sub">{t('weekly.pacePeriod')}</div>
            </div>
            <div className="stat">
              <div className="label">{t('weekly.endOfYear')}</div>
              <div className={`value ${plan.projectionDiff >= 0 ? 'positive' : 'negative'}`}>{eur(plan.projection)}</div>
              <div className="stat-sub">{t('weekly.periodGoal')}: {eur(plan.periodGoal)}</div>
            </div>
          </div>

          <div className="card">
            <h3 className="h3-icon"><IconCalendar size={16} />{t('weekly.thisWeek')}</h3>
            <div className="progress-wrap" style={{ margin: '12px 0 8px', height: 12 }}>
              <div className={`progress-fill ${thisWeek.left >= 0 ? 'success' : 'danger'}`} style={{ width: `${Math.min(100, thisWeek.pct)}%` }} />
            </div>
            <p className={`wk-line ${thisWeek.left >= 0 ? 'positive' : 'negative'}`}>
              {fill(t(thisWeek.left >= 0 ? 'weekly.leftThisWeek' : 'weekly.overThisWeek'), { v: eur(Math.abs(thisWeek.left)) })}
            </p>
            <ul className="wk-plan">
              <li>
                <strong>{t('weekly.adjusted')}</strong>
                <span>{plan.adjustedGoal > 0
                  ? fill(t('weekly.adjustedText'), { v: eur(plan.adjustedGoal), n: plan.weeksLeft })
                  : t('weekly.adjustedZero')}</span>
              </li>
              <li>
                <strong>{t('weekly.projection')}</strong>
                <span>{plan.paceWeeks === 0
                  ? t('weekly.projectionNoData')
                  : fill(t(plan.projectionDiff >= 0 ? 'weekly.projectionUnder' : 'weekly.projectionOver'),
                    { p: eur(plan.pace), y: eur(plan.projection), z: eur(Math.abs(plan.projectionDiff)) })}</span>
              </li>
              {plan.suggestedGoal !== null && (
                <li>
                  <strong>{t('weekly.suggested')}</strong>
                  <span>{fill(t('weekly.suggestedText'), { v: eur(plan.suggestedGoal) })}</span>
                  <button type="button" className="btn outline small" onClick={() => onGoalChange(plan.suggestedGoal!)}>{t('weekly.useSuggested')}</button>
                </li>
              )}
            </ul>
            <p className="form-hint">{t('weekly.realHint')}</p>
          </div>

          {plan.projects.length > 0 && (
            <div className="card">
              <h3>{t('weekly.projects')}</h3>
              <div className="wk-projects">
                {plan.projects.map(p => (
                  <div key={p.id}>
                    <div className="wk-project-name">{p.name}</div>
                    <BudgetBar spent={p.spent} budget={p.budget} />
                  </div>
                ))}
              </div>
              <p className="form-hint" style={{ marginTop: 10 }}>{fill(t('weekly.projectsNote'), { v: eur(plan.excluded) })}</p>
            </div>
          )}
        </>
      ) : (
        <div className="stats">
          <div className="stat"><div className="label">{t('weekly.goal')}</div><div className="value primary">{weeklyGoal} €</div></div>
          <div className="stat"><div className="label">{t('weekly.annualGoal')}</div><div className="value">{eur(totalGoal)}</div></div>
          <div className="stat"><div className="label">{t('weekly.spent')}</div><div className={`value ${onTrack ? 'positive' : 'negative'}`}>{eur(totalSpent)}</div></div>
          <div className="stat"><div className="label">{t('weekly.diff')}</div><div className={`value ${onTrack ? 'positive' : 'negative'}`}>{eur((totalGoal - totalSpent))}</div></div>
        </div>
      )}

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
              <div key={w.num} className={`week-item${w.num === plan.week ? ' current' : ''}`}>
                <div className="wk-num">{fill(t('weekly.weekShort'), { n: w.num })}</div>
                <div className="wk-meta">{eur(w.spent)}</div>
                <div className={`wk-amount ${w.avail >= 0 ? 'positive' : 'negative'}`}>{eur(w.avail)}</div>
                <div className="progress-wrap" style={{ height: 4, marginTop: 4 }}>
                  <div className={`progress-fill ${w.accSpent > w.accGoal ? 'danger' : 'success'}`} style={{ width: `${Math.min(100, wpct)}%` }} />
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
