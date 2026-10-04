import { useState, useMemo } from 'react';
import { REF } from '../types';
import { useLocale, refLabel } from '../i18n';
import type { Subscription } from '../types';
import { addSubscription, updateSubscription, deleteSubscription, advanceSubscription, addExpense } from '../store';
import {
  IconPlus, IconX, IconEdit, IconTrash, IconCheckCircle
} from './Icons';
import { eur } from '../format';

interface Props {
  subscriptions: Subscription[];
  onRefresh: () => void;
}

const CYCLE_MONTH_FACTOR: Record<string, number> = {
  weekly: 4.33,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

export default function SubscriptionsPage({ subscriptions, onRefresh }: Props) {
  const { t } = useLocale();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly' | 'weekly' | 'quarterly'>('monthly');
  const [nextBilling, setNextBilling] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [metodo, setMetodo] = useState('Tarjeta');
  const [notes, setNotes] = useState('');
  const [autoCharge, setAutoCharge] = useState(false);
  const [formError, setFormError] = useState('');

  const active = subscriptions.filter(s => s.active);
  const inactive = subscriptions.filter(s => !s.active);

  const totals = useMemo(() => {
    let monthly = 0;
    active.forEach(s => {
      monthly += s.amount * CYCLE_MONTH_FACTOR[s.billingCycle];
    });
    return { monthly, yearly: monthly * 12 };
  }, [active]);

  const upcoming = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return active
      .filter(s => {
        const d = new Date(s.nextBilling + 'T12:00:00');
        const diff = (d.getTime() - now.getTime()) / 86400000;
        return diff >= 0 && diff <= 30;
      })
      .sort((a, b) => a.nextBilling.localeCompare(b.nextBilling));
  }, [active]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setAmount(0);
    setBillingCycle('monthly');
    setNextBilling(new Date().toISOString().slice(0, 10));
    setCategory('');
    setMetodo('Tarjeta');
    setNotes('');
    setAutoCharge(false);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (s: Subscription) => {
    setEditing(s);
    setName(s.name);
    setAmount(s.amount);
    setBillingCycle(s.billingCycle);
    setNextBilling(s.nextBilling);
    setCategory(s.category);
    setMetodo(s.metodo || 'Tarjeta');
    setNotes(s.notes);
    setAutoCharge(!!s.autoCharge);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount || amount <= 0) {
      setFormError(!name.trim() ? t('error.nameRequired') : t('error.amountPositive'));
      return;
    }
    setFormError('');
    if (editing) {
      updateSubscription(editing.id, { name: name.trim(), amount, billingCycle, nextBilling, category: category.trim(), metodo, notes: notes.trim(), autoCharge });
    } else {
      addSubscription({ name: name.trim(), amount, billingCycle, nextBilling, category: category.trim(), metodo, notes: notes.trim(), autoCharge });
    }
    setShowForm(false);
    onRefresh();
  };

  const handleMarkPaid = (s: Subscription) => {
    const today = new Date().toISOString().slice(0, 10);
    addExpense({
      date: today,
      desc: s.name + (s.category ? ` (${s.category})` : ''),
      amount: s.amount,
      proposito: REF.propositos.includes(s.category) ? s.category : 'Ocio',
      metodo: s.metodo || 'Tarjeta',
      motivo: '',
      tipo: 'Recurrente',
    });
    advanceSubscription(s);
    onRefresh();
  };

  const handleDelete = (id: string) => {
    if (!confirm(t('sub.confirmDelete'))) return;
    deleteSubscription(id);
    onRefresh();
  };

  const daysUntil = (dateStr: string): number => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T12:00:00');
    return Math.round((d.getTime() - now.getTime()) / 86400000);
  };

  return (
    <div>
      <div className="stats">
        <div className="stat">
          <div className="label">{t('sub.active')}</div>
          <div className="value primary">{active.length}</div>
        </div>
        <div className="stat">
          <div className="label">{t('sub.monthlyCost')}</div>
          <div className="value negative">{eur(totals.monthly)}</div>
        </div>
        <div className="stat">
          <div className="label">{t('sub.yearlyCost')}</div>
          <div className="value negative">{eur(totals.yearly)}</div>
        </div>
        <div className="stat">
          <div className="label">{t('sub.upcoming30')}</div>
          <div className="value warning">{upcoming.length}</div>
        </div>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="card">
          <h3>{t('sub.upcoming')}</h3>
          <div className="upcoming-grid">
            {upcoming.map(s => {
              const days = daysUntil(s.nextBilling);
              return (
                <div key={s.id} className={`upcoming-card ${days <= 3 ? 'urgent' : ''}`}>
                  <div className="upcoming-name">{s.name}</div>
                  <div className="upcoming-amount">{eur(s.amount)}</div>
                  <div className="upcoming-meta">
                    {days === 0 ? t('sub.today') : days === 1 ? t('sub.tomorrow') : `${t('sub.in')} ${days} ${t('sub.days')}`}
                    {' '}· {s.nextBilling}
                  </div>
                  <div className="upcoming-actions">
                    {s.autoCharge ? <span className="pill pill-ok">{t('sub.auto')}</span> : (
                      <button className="btn sm primary" onClick={() => handleMarkPaid(s)} title={t('sub.markPaidTitle')}>
                        <IconCheckCircle size={14} /> {t('sub.markPaid')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active list */}
      <div className="card">
        <div className="card-header">
          <h3>{t('sub.active')}</h3>
          <button className="btn primary sm" onClick={openNew}>
            <IconPlus size={14} /> {t('common.new')}
          </button>
        </div>
        {active.length === 0 ? (
          <div className="empty">{t('sub.noActive')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('sub.name')}</th>
                  <th>{t('common.amount')}</th>
                  <th>{t('sub.cycle')}</th>
                  <th>{t('sub.nextCharge')}</th>
                  <th>{t('sub.category')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {active.map(s => {
                  const days = daysUntil(s.nextBilling);
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong>{s.autoCharge && <span className="pill pill-ok" style={{ marginLeft: 8 }}>{t('sub.auto')}</span>}</td>
                      <td style={{ fontWeight: 700 }}>{eur(s.amount)}</td>
                      <td>{t(`sub.per.${s.billingCycle}`)}</td>
                      <td>
                        <span className={`pill ${days <= 3 ? 'pill-danger' : days <= 7 ? 'pill-warning' : 'pill-ok'}`}>
                          {days === 0 ? t('sub.today') : days === 1 ? t('sub.tomorrow') : `${s.nextBilling} (${days}d)`}
                        </span>
                      </td>
                      <td style={{ fontSize: '.8rem' }}>{s.category ? refLabel('categories', s.category, t) : '-'}</td>
                      <td>
                        <div className="row-actions">
                          {!s.autoCharge && (
                            <button className="btn sm primary" onClick={() => handleMarkPaid(s)} title={t('sub.pay')}>
                              <IconCheckCircle size={14} />
                            </button>
                          )}
                          <button className="btn sm outline" onClick={() => openEdit(s)} title={t('common.edit')}>
                            <IconEdit size={14} />
                          </button>
                          <button className="btn sm outline" onClick={() => handleDelete(s.id)} title={t('common.delete')}>
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inactive */}
      {inactive.length > 0 && (
        <div className="card">
          <h3>{t('sub.inactive')}</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t('sub.name')}</th><th>{t('common.amount')}</th><th>{t('sub.cycle')}</th><th></th></tr>
              </thead>
              <tbody>
                {inactive.map(s => (
                  <tr key={s.id} style={{ opacity: 0.5 }}>
                    <td>{s.name}</td>
                    <td>{eur(s.amount)}</td>
                    <td>{t(`sub.per.${s.billingCycle}`)}</td>
                    <td>
                      <button className="btn sm outline" onClick={() => updateSubscription(s.id, { active: true })}>{t('sub.reactivate')}</button>
                      <button className="btn sm danger" onClick={() => handleDelete(s.id)} title={t('common.delete')}>
                        <IconTrash size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? t('sub.edit') : t('sub.add')}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>
                <IconX size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>{t('sub.name')}</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('sub.placeholder')} autoFocus />
              </div>
              <div className="form-row three">
                <div className="form-group">
                  <label>{t('common.amountEur')}</label>
                  <input type="number" step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>{t('sub.cycle')}</label>
                  <select value={billingCycle} onChange={e => setBillingCycle(e.target.value as any)}>
                    {REF.billingCycles.map(c => <option key={c} value={c}>{t(`ref.cycles.${c}`)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('sub.nextCharge')}</label>
                  <input type="date" value={nextBilling} onChange={e => setNextBilling(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('expense.categoryPurpose')}</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="">{t('sub.unassigned')}</option>
                    {REF.propositos.map(c => <option key={c} value={c}>{refLabel('categories', c, t)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('expense.payMethod')}</label>
                  <select value={metodo} onChange={e => setMetodo(e.target.value)}>
                    {REF.metodos.map(m => <option key={m} value={m}>{refLabel('methods', m, t)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('common.notes')}</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('common.optional')} />
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                  <input type="checkbox" checked={autoCharge} onChange={e => setAutoCharge(e.target.checked)} />
                  {t('sub.autoCharge')}
                </label>
                <p style={{ margin: '4px 0 0', fontSize: '.8rem', color: 'var(--text-muted)' }}>{t('sub.autoChargeHint')}</p>
              </div>
              {formError && <p className="field-error">{formError}</p>}
              <div className="form-actions">
                <button type="submit" className="btn primary">{editing ? t('common.save') : t('common.add')}</button>
                <button type="button" className="btn outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
