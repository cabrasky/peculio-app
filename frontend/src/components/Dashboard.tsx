import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Expense, Income, Goal, Subscription } from '../types';
import { expenseCost, getMonth } from '../types';
import { useLocale, LOCALE_TAG, fill, refLabel } from '../i18n';
import { catColor } from '../categoryColors';
import { eurFmt, capFirst } from '../format';
import { IconArrowUpRight } from './Icons';

interface Props {
  expenses: Expense[];
  incomes: Income[];
  goals: Goal[];
  subscriptions: Subscription[];
}

export default function Dashboard({ expenses, incomes, goals, subscriptions }: Props) {
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const tag = LOCALE_TAG[locale];
  const eur = (n: number, digits = 2) => eurFmt(tag, digits)(n);
  const signed = (n: number, digits = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${eur(Math.abs(n), digits)}`;
  const now = new Date();
  const monthTitle = capFirst(now.toLocaleDateString(tag, { month: 'long', year: 'numeric' }));
  const shortDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(tag, { day: 'numeric', month: 'short' });
  };
  const thisMonth = now.getMonth() + 1;
  const thisYear = now.getFullYear();

  const stats = useMemo(() => {
    const totalExpenses = expenses.reduce((s, e) => s + expenseCost(e), 0);
    const totalIncomes = incomes.reduce((s, i) => s + i.amount, 0);
    const balance = totalIncomes - totalExpenses;

    const monthExpenses = expenses
      .filter(e => getMonth(e.date) === thisMonth && e.date.startsWith(String(thisYear)))
      .reduce((s, e) => s + expenseCost(e), 0);
    const monthIncomes = incomes
      .filter(i => getMonth(i.date) === thisMonth && i.date.startsWith(String(thisYear)))
      .reduce((s, i) => s + i.amount, 0);

    const activeSubs = subscriptions.filter(s => s.active);
    const subMonthly = activeSubs.reduce((s, sub) => {
      const factor: Record<string, number> = { weekly: 4.33, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };
      return s + sub.amount * (factor[sub.billingCycle] || 0);
    }, 0);

    const goalTotal = goals.reduce((s, g) => s + g.targetAmount, 0);
    const goalSaved = goals.reduce((s, g) => s + g.currentAmount, 0);

    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const weekExpenses = expenses.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d >= weekAgo && d <= now;
    }).reduce((s, e) => s + expenseCost(e), 0);

    return {
      totalExpenses, totalIncomes, balance, monthExpenses, monthIncomes,
      monthBalance: monthIncomes - monthExpenses,
      weekExpenses, subMonthly, goalTotal, goalSaved,
      goalPct: goalTotal > 0 ? Math.min(100, (goalSaved / goalTotal) * 100) : 0,
      expenseCount: expenses.length,
      incomeCount: incomes.length,
    };
  }, [expenses, incomes, goals, subscriptions, thisMonth, thisYear, now]);

  const recentExpenses = useMemo(() =>
    [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [expenses]
  );

  const upcomingSubs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return subscriptions
      .filter(s => s.active)
      .map(s => {
        const d = new Date(s.nextBilling + 'T12:00:00');
        const days = Math.round((d.getTime() - today.getTime()) / 86400000);
        return { ...s, days };
      })
      .filter(s => s.days >= 0 && s.days <= 15)
      .sort((a, b) => a.days - b.days)
      .slice(0, 5);
  }, [subscriptions]);

  return (
    <div className="dashboard">
      <div className="xg-title">
        <h1>{t('nav.dashboard')}</h1>
        <p>{monthTitle}</p>
      </div>

      <div className="xg-tiles">
        <div className="xg-tile hero">
          <span className="xg-tile-label">{t('dashboard.balance')}</span>
          <span className="xg-tile-value num">{signed(stats.balance)}</span>
          <span className="xg-tile-sub">{eur(stats.totalIncomes, 0)} {t('dashboard.earned')} · {eur(stats.totalExpenses, 0)} {t('dashboard.spent')}</span>
        </div>
        <button type="button" className="xg-tile clickable" onClick={() => navigate('/incomes')}>
          <span className="xg-tile-label">{t('dashboard.incomes')}</span>
          <span className="xg-tile-value num">{eur(stats.monthIncomes)}</span>
          <span className="xg-tile-sub">{t('dashboard.thisMonth')}</span>
        </button>
        <button type="button" className="xg-tile clickable" onClick={() => navigate('/expenses')}>
          <span className="xg-tile-label">{t('dashboard.expenses')}</span>
          <span className="xg-tile-value num">{eur(stats.monthExpenses)}</span>
          <span className="xg-tile-sub">{fill(t('expense.days7'), { v: eur(stats.weekExpenses) })}</span>
        </button>
        <button type="button" className="xg-tile clickable" onClick={() => navigate('/subs')}>
          <span className="xg-tile-label">{t('dashboard.subsMonth')}</span>
          <span className="xg-tile-value num">{eur(stats.subMonthly, 0)}</span>
          <span className="xg-tile-sub">{fill(t('dashboard.nActiveSubs'), { n: subscriptions.filter(s => s.active).length })}</span>
        </button>
      </div>

      {/* Monthly snapshot */}
      <div className="card clickable" onClick={() => navigate('/more/monthly')}>
        <div className="card-header">
          <h3>{t('dashboard.cashFlow')} · {t(`ref.months.${thisMonth}`)}</h3>
          <IconArrowUpRight size={16} />
        </div>
        <div className="month-snapshot">
          <div className="ms-item">
            <span className="ms-label">{t('dashboard.incomes')}</span>
            <span className="ms-value positive num">{signed(stats.monthIncomes)}</span>
          </div>
          <div className="ms-item">
            <span className="ms-label">{t('dashboard.expenses')}</span>
            <span className="ms-value negative num">{signed(-stats.monthExpenses)}</span>
          </div>
          <div className="ms-item ms-total">
            <span className="ms-label">{t('dashboard.balanceLabel')}</span>
            <span className={`ms-value num ${stats.monthBalance >= 0 ? 'positive' : 'negative'}`}>{signed(stats.monthBalance)}</span>
          </div>
        </div>
        {stats.monthIncomes > 0 && (
          <div className="progress-wrap" style={{ height: 10, marginTop: 14 }}>
            <div
              className={`progress-fill ${stats.monthExpenses > stats.monthIncomes ? 'danger' : 'warning'}`}
              style={{ width: `${Math.min(100, (stats.monthExpenses / stats.monthIncomes) * 100)}%` }}
            />
          </div>
        )}
        <div className="xg-muted" style={{ marginTop: 8, textAlign: 'center' }}>
          {stats.monthIncomes > 0
            ? `${((stats.monthExpenses / stats.monthIncomes) * 100).toFixed(0)}% ${t('dashboard.spent')}`
            : t('income.noData')}
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-col">
      {/* Recent expenses */}
      {recentExpenses.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>{t('dashboard.recentExpenses')}</h3>
            <button className="btn sm outline" onClick={() => navigate('/expenses')}>{t('dashboard.viewAll')}</button>
          </div>
          <div className="recent-list">
            {recentExpenses.map(e => (
              <div key={e.id} className="recent-item">
                <div className="recent-left">
                  <span className={`xg-initial ${catColor(e.proposito || e.desc)}`} aria-hidden="true">{(e.proposito || e.desc || '?').charAt(0).toUpperCase()}</span>
                  <span className="recent-text">
                    <span className="recent-desc">{e.desc}</span>
                    <span className="recent-meta">{[shortDate(e.date), e.proposito && refLabel('categories', e.proposito, t)].filter(Boolean).join(' · ')}</span>
                  </span>
                </div>
                <span className="recent-amount">{eur(e.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

        </div>
        <div className="dash-col">
      {/* Goals progress */}
      {goals.length > 0 && (
        <div className="card clickable" onClick={() => navigate('/goals')}>
          <div className="card-header">
            <h3>{t('dashboard.goalProgress')}</h3>
            <IconArrowUpRight size={16} />
          </div>
          <div className="progress-wrap" style={{ height: 12 }}>
            <div className={`progress-fill ${stats.goalPct >= 100 ? 'success' : ''}`} style={{ width: `${stats.goalPct}%` }} />
          </div>
          <div className="goal-amounts" style={{ marginTop: 12 }}>
            <span className="goal-current">{eur(stats.goalSaved, 0)}</span>
            <span className="goal-sep">/</span>
            <span className="goal-target">{eur(stats.goalTotal, 0)} · {stats.goalPct.toFixed(0)}%</span>
          </div>
        </div>
      )}

      {/* Upcoming subscriptions */}
      {upcomingSubs.length > 0 && (
        <div className="card clickable" onClick={() => navigate('/subs')}>
          <div className="card-header">
            <h3>{t('dashboard.upcomingCharges')}</h3>
            <IconArrowUpRight size={16} />
          </div>
          {upcomingSubs.map(s => (
            <div key={s.id} className="recent-item">
              <div className="recent-left">
                <span className={`recent-date ${s.days <= 3 ? 'urgent' : ''}`}>
                  {s.days === 0 ? t('dashboard.today') : s.days === 1 ? t('dashboard.tomorrow') : `${s.days} ${t('dashboard.days')}`}
                </span>
                <span className="recent-desc">{s.name}</span>
              </div>
              <span className="recent-amount">{eur(s.amount)}</span>
            </div>
          ))}
        </div>
      )}

        </div>
      </div>
    </div>
  );
}
