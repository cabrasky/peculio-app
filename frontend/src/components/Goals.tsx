import { useState, useMemo } from 'react';
import { REF } from '../types';
import { useLocale, fill, refLabel } from '../i18n';
import type { Goal } from '../types';
import { addGoal, updateGoal, deleteGoal } from '../store';
import { IconPlus, IconX, IconEdit, IconTrash, IconTrendingUp, IconTarget } from './Icons';
import { eur } from '../format';

interface Props {
  goals: Goal[];
  onRefresh: () => void;
}

export default function GoalsPage({ goals, onRefresh }: Props) {
  const { t } = useLocale();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState(0);
  const [currentAmount, setCurrentAmount] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [contribution, setContribution] = useState(0);
  const [contribGoal, setContribGoal] = useState<Goal | null>(null);
  const [formError, setFormError] = useState('');

  const active = goals;
  const totalTarget = useMemo(() => active.reduce((s, g) => s + g.targetAmount, 0), [active]);
  const totalSaved = useMemo(() => active.reduce((s, g) => s + g.currentAmount, 0), [active]);
  const completed = useMemo(() => active.filter(g => g.currentAmount >= g.targetAmount), [active]);
  const inProgress = useMemo(() => active.filter(g => g.currentAmount < g.targetAmount), [active]);

  const openNew = () => {
    setEditing(null);
    setName(''); setTargetAmount(0); setCurrentAmount(0);
    setDeadline(''); setCategory(''); setNotes('');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (g: Goal) => {
    setEditing(g);
    setName(g.name); setTargetAmount(g.targetAmount);
    setCurrentAmount(g.currentAmount); setDeadline(g.deadline);
    setCategory(g.category); setNotes(g.notes);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetAmount || targetAmount <= 0) {
      setFormError(!name.trim() ? t('error.nameRequired') : t('error.goalPositive'));
      return;
    }
    setFormError('');
    if (editing) {
      updateGoal(editing.id, { name: name.trim(), targetAmount, currentAmount, deadline, category: category.trim(), notes: notes.trim() });
    } else {
      addGoal({ name: name.trim(), targetAmount, currentAmount, deadline, category: category.trim(), notes: notes.trim() });
    }
    setShowForm(false);
    onRefresh();
  };

  const handleContribute = (g: Goal) => {
    const newAmount = Math.min(g.currentAmount + contribution, g.targetAmount);
    updateGoal(g.id, { currentAmount: newAmount });
    setContribGoal(null);
    setContribution(0);
    onRefresh();
  };

  const handleWithdraw = (g: Goal) => {
    const newAmount = Math.max(0, g.currentAmount - contribution);
    updateGoal(g.id, { currentAmount: newAmount });
    setContribGoal(null);
    setContribution(0);
    onRefresh();
  };

  const handleDelete = (id: string) => {
    if (!confirm(t('goal.confirmDelete'))) return;
    deleteGoal(id);
    onRefresh();
  };

  const pct = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0;

  const GoalCard = ({ goal }: { goal: Goal }) => {
    const gpct = goal.targetAmount > 0 ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100) : 0;
    const done = goal.currentAmount >= goal.targetAmount;
    const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
    const daysLeft = goal.deadline ? Math.round((new Date(goal.deadline + 'T12:00:00').getTime() - Date.now()) / 86400000) : null;
    const urgent = daysLeft !== null && daysLeft <= 30 && !done;

    return (
      <div className={`goal-card ${done ? 'goal-done' : ''} ${urgent ? 'goal-urgent' : ''}`}>
        <div className="goal-header">
          <span className="goal-name">{goal.name}</span>
          <div className="row-actions">
            <button className="btn sm outline" onClick={() => { setContribGoal(goal); setContribution(0); }} title={done ? t('goal.withdraw') : t('goal.contribute')}>
              {done ? <IconTrendingUp size={14} /> : <IconPlus size={14} />}
            </button>
            <button className="btn sm outline" onClick={() => openEdit(goal)} title={t('common.edit')}><IconEdit size={14} /></button>
            <button className="btn sm danger" onClick={() => handleDelete(goal.id)} title={t('common.delete')}><IconTrash size={14} /></button>
          </div>
        </div>
        <div className="goal-amounts">
          <span className="goal-current">{eur(goal.currentAmount)}</span>
          <span className="goal-sep">/</span>
          <span className="goal-target">{eur(goal.targetAmount)}</span>
        </div>
        <div className="progress-wrap goal-progress">
          <div className={`progress-fill ${done ? 'success' : urgent ? 'warning' : ''}`} style={{ width: `${gpct}%` }} />
        </div>
        <div className="goal-meta">
          <span>{gpct.toFixed(0)}% {t('goal.completed')}</span>
          {remaining > 0 && <span>{t('goal.remaining')} {eur(remaining)}</span>}
          {daysLeft !== null && (
            <span>
              {daysLeft <= 0 ? t('goal.expired') : `${daysLeft} ${t('goal.days')}`}
            </span>
          )}
        </div>
        {goal.category && <span className="goal-cat">{refLabel('goalCats', goal.category, t)}</span>}
        {goal.notes && <div className="goal-notes">{goal.notes}</div>}
      </div>
    );
  };

  return (
    <div>
      <div className="stats">
        <div className="stat">
          <div className="label">{t('goal.active')}</div>
          <div className="value primary">{active.length}</div>
        </div>
        <div className="stat">
          <div className="label">{t('goal.saved')}</div>
          <div className="value positive">{eur(totalSaved)}</div>
        </div>
        <div className="stat">
          <div className="label">{t('goal.target')}</div>
          <div className="value">{eur(totalTarget)}</div>
        </div>
        <div className="stat">
          <div className="label">{t('goal.globalProgress')}</div>
          <div className="value primary">{pct.toFixed(0)}%</div>
        </div>
      </div>

      <div className="card">
        <div className="progress-wrap" style={{ height: 16, marginBottom: 8 }}>
          <div className={`progress-fill ${pct >= 100 ? 'success' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <div style={{ textAlign: 'center', fontSize: '.82rem', color: 'var(--text-muted)' }}>
          {eur(totalSaved)} / {eur(totalTarget)} ({pct.toFixed(1)}%)
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn primary" onClick={openNew}>
          <IconPlus size={16} /> {t('goal.add')}
        </button>
      </div>

      <div className="goals-grid">
        {active.length === 0 ? (
          <div className="empty" style={{ gridColumn: '1/-1' }}>
            <IconTarget size={32} />
            <p>{t('goal.noGoals')}</p>
          </div>
        ) : (
          [...inProgress, ...completed].map(g => <GoalCard key={g.id} goal={g} />)
        )}
      </div>

      {/* Contribution modal */}
      {contribGoal && (
        <div className="modal-overlay" onClick={() => setContribGoal(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{fill(t(contribGoal.currentAmount >= contribGoal.targetAmount ? 'goal.withdrawFrom' : 'goal.contributeTo'), { name: contribGoal.name })}</h2>
              <button className="modal-close" onClick={() => setContribGoal(null)}><IconX size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                {t('goal.current')}: {eur(contribGoal.currentAmount)} / {eur(contribGoal.targetAmount)}
              </p>
              <div className="form-group">
                <label>{t('common.amountEur')}</label>
                <input type="number" step="0.01" value={contribution} onChange={e => setContribution(Number(e.target.value))} placeholder="0.00" autoFocus />
              </div>
              <div className="form-actions">
                {contribGoal.currentAmount >= contribGoal.targetAmount ? (
                  <button className="btn primary" onClick={() => handleWithdraw(contribGoal)}>{t('goal.withdraw')}</button>
                ) : (
                  <button className="btn primary" onClick={() => handleContribute(contribGoal)}>{t('goal.contribute')}</button>
                )}
                <button className="btn outline" onClick={() => setContribGoal(null)}>{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? t('goal.edit') : t('goal.add')}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><IconX size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>{t('goal.name')}</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('goal.placeholder')} autoFocus />
              </div>
              <div className="form-row three">
                <div className="form-group">
                  <label>{t('goal.targetAmount')} (€)</label>
                  <input type="number" step="0.01" value={targetAmount} onChange={e => setTargetAmount(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>{t('goal.savedAmount')} (€)</label>
                  <input type="number" step="0.01" value={currentAmount} onChange={e => setCurrentAmount(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>{t('goal.deadline')}</label>
                  <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('goal.category')}</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="">{t('goal.empty')}</option>
                    {REF.goalCategories.map(c => <option key={c} value={c}>{refLabel('goalCats', c, t)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('common.notes')}</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('common.optional')} />
                </div>
              </div>
              {formError && <p className="field-error">{formError}</p>}
              <div className="form-actions">
                <button type="submit" className="btn primary">{editing ? t('common.save') : t('goal.create')}</button>
                <button type="button" className="btn outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
