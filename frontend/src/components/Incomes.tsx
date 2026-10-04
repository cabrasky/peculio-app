import { useState, useMemo } from 'react';
import { REF, getMonth } from '../types';
import { useLocale, refLabel } from '../i18n';
import type { Income } from '../types';
import { addIncome, updateIncome, deleteIncome } from '../store';
import { IconPlus, IconX, IconEdit, IconTrash, IconSearch } from './Icons';
import { eur } from '../format';
import { CHART, SERIES } from '../palette';

interface Props {
  incomes: Income[];
  onRefresh: () => void;
}

export default function IncomesPage({ incomes, onRefresh }: Props) {
  const { t } = useLocale();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState('Salario');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState('');

  const total = useMemo(() => incomes.reduce((s, i) => s + i.amount, 0), [incomes]);

  const thisMonth = useMemo(() => {
    const now = new Date();
    return incomes
      .filter(i => getMonth(i.date) === now.getMonth() + 1 && i.date.startsWith(String(now.getFullYear())))
      .reduce((s, i) => s + i.amount, 0);
  }, [incomes]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    incomes.forEach(i => { map[i.category] = (map[i.category] || 0) + i.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [incomes]);

  const filtered = useMemo(() => {
    if (!search) return [...incomes].sort((a, b) => b.date.localeCompare(a.date));
    const q = search.toLowerCase();
    return incomes
      .filter(i => i.desc.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [incomes, search]);

  const openNew = () => {
    setEditing(null);
    setDate(new Date().toISOString().slice(0, 10));
    setDesc(''); setAmount(0); setCategory('Salario'); setNotes('');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (i: Income) => {
    setEditing(i);
    setDate(i.date); setDesc(i.desc); setAmount(i.amount);
    setCategory(i.category); setNotes(i.notes);
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim() || !amount || amount <= 0) {
      setFormError(!desc.trim() ? t('error.descriptionRequired') : t('error.amountPositive'));
      return;
    }
    setFormError('');
    if (editing) {
      updateIncome(editing.id, { date, desc: desc.trim(), amount, category: category.trim(), notes: notes.trim() });
    } else {
      addIncome({ date, desc: desc.trim(), amount, category: category.trim(), notes: notes.trim() });
    }
    setShowForm(false);
    onRefresh();
  };

  const handleDelete = (id: string) => {
    if (!confirm(t('income.confirmDelete'))) return;
    deleteIncome(id);
    onRefresh();
  };

  return (
    <div>
      <div className="stats">
        <div className="stat">
          <div className="label">{t('income.total')}</div>
          <div className="value positive">{eur(total)}</div>
        </div>
        <div className="stat">
          <div className="label">{t('income.thisMonth')}</div>
          <div className="value positive">{eur(thisMonth)}</div>
        </div>
        <div className="stat">
          <div className="label">{t('income.count')}</div>
          <div className="value primary">{incomes.length}</div>
        </div>
        <div className="stat">
          <div className="label">{t('income.average')}</div>
          <div className="value">{eur(incomes.length ? total / incomes.length : 0)}</div>
        </div>
      </div>

      {/* By category */}
      {byCategory.length > 0 && (
        <div className="card">
          <h3>{t('income.byCategory')}</h3>
          <div className="bar-list">
            {byCategory.map(([cat, val]) => {
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              const colors: Record<string, string> = {
                Salario: CHART.income, Freelance: SERIES[5], Inversion: SERIES[4],
                Regalo: SERIES[7], Venta: SERIES[2], Devolucion: SERIES[0], Otro: CHART.neutral,
              };
              return (
                <div key={cat} className="bar-row">
                  <span className="bar-label">{refLabel('incomeCats', cat, t)}</span>
                  <div className="progress-wrap">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: colors[cat] || CHART.neutral }} />
                  </div>
                  <span className="bar-value">{eur(val)} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List */}
      <div className="card">
        <div className="card-header">
          <h3>{t('income.title')} ({filtered.length})</h3>
          <button className="btn primary sm" onClick={openNew}>
            <IconPlus size={14} /> {t('common.new')}
          </button>
        </div>

        <div className="search-box" style={{ marginBottom: 12 }}>
          <div className="search-input-wrap">
            <IconSearch size={14} />
            <input type="text" placeholder={t('common.searchPh')} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">{t('income.noData')}</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t('common.date')}</th><th>{t('common.description')}</th><th>{t('common.amount')}</th><th>{t('income.category')}</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id}>
                    <td>{i.date}</td>
                    <td><strong>{i.desc}</strong>{i.notes && <span className="td-meta">{i.notes}</span>}</td>
                    <td className="td-amount" style={{ color: 'var(--success)' }}>+{eur(i.amount)}</td>
                    <td><span className="tag">{refLabel('incomeCats', i.category, t)}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn sm outline" onClick={() => openEdit(i)} title={t('common.edit')}><IconEdit size={14} /></button>
                        <button className="btn sm danger" onClick={() => handleDelete(i.id)} title={t('common.delete')}><IconTrash size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? t('income.edit') : t('income.new')}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><IconX size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-row three">
                <div className="form-group">
                  <label>{t('common.date')}</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>{t('common.amountEur')}</label>
                  <input type="number" step="0.01" value={amount} onChange={e => setAmount(Number(e.target.value))} placeholder="0.00" autoFocus />
                </div>
                <div className="form-group">
                  <label>{t('income.category')}</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}>
                    {REF.incomeCategories.map(c => <option key={c} value={c}>{refLabel('incomeCats', c, t)}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label>{t('common.description')}</label>
                <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('income.placeholder')} />
              </div>
              <div className="form-group">
                <label>{t('common.notes')}</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('common.optional')} />
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
