/* ── Categorías propias: crear, renombrar, borrar (gasto e ingreso) ──────── */
import { useState } from 'react';
import { cats, refreshCategories, type UserCategory } from '../store';
import * as api from '../api';
import { useLocale, fill, localizeError } from '../i18n';
import type { Expense, Income, Subscription } from '../types';
import { blockedInDemo } from '../demo';

interface Props {
  expenses?: Expense[];
  incomes?: Income[];
  subscriptions?: Subscription[];
}

const KINDS: { key: 'expense' | 'income'; title: string; hint: string }[] = [
  { key: 'expense', title: 'cat.expenseTitle', hint: 'cat.expenseHint' },
  { key: 'income', title: 'cat.incomeTitle', hint: 'cat.incomeHint' },
];

export default function CategoriesPage({ expenses = [], incomes = [], subscriptions = [] }: Props) {
  const { t } = useLocale();
  const [, forceTick] = useState(0);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => { refreshCategories().then(() => forceTick(n => n + 1)); };

  const usedCount = (kind: 'expense' | 'income', name: string): number => {
    if (kind === 'expense') {
      return expenses.filter(e => e.proposito === name).length + subscriptions.filter(s => s.category === name).length;
    }
    return incomes.filter(i => i.category === name).length;
  };

  const add = async (kind: 'expense' | 'income') => {
    if (!adding.trim() || busy || blockedInDemo()) return;
    setBusy(true); setErr('');
    try {
      await api.apiCreateCategory({ kind, name: adding.trim() });
      setAdding(''); refresh();
    } catch (e: any) { setErr(localizeError(e, t)); } finally { setBusy(false); }
  };

  const rename = async (cat: UserCategory) => {
    if (!editingName.trim() || busy || blockedInDemo()) return;
    setBusy(true); setErr('');
    try {
      await api.apiUpdateCategory(cat.id, { name: editingName.trim() });
      setEditingId(null); refresh();
    } catch (e: any) { setErr(localizeError(e, t)); } finally { setBusy(false); }
  };

  const remove = async (kind: 'expense' | 'income', cat: UserCategory) => {
    if (blockedInDemo()) return;
    const used = usedCount(kind, cat.name);
    if (used > 0) { setErr(fill(t('cat.inUseBlock'), { name: cat.name, n: used })); return; }
    if (!confirm(fill(t('cat.confirmDelete'), { name: cat.name }))) return;
    setBusy(true); setErr('');
    try {
      await api.apiDeleteCategory(cat.id);
      refresh();
    } catch (e: any) { setErr(localizeError(e, t)); } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {KINDS.map(k => {
        const list = cats(k.key);
        return (
          <section key={k.key} className="card" style={{ padding: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 2px' }}>{t(k.title)}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: '0 0 12px' }}>{t(k.hint)}</p>

            {list.map(c => {
              const used = usedCount(k.key, c.name);
              const editing = editingId === c.id;
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 5, backgroundColor: c.color || 'var(--surface2)', flex: 'none' }} />
                  {editing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') rename(c); if (e.key === 'Escape') setEditingId(null); }}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 10, border: '1px solid var(--border-strong)' }}
                    />
                  ) : (
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                  )}
                  {used > 0 && <span title={fill(t('cat.usedBy'), { n: used })} style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{fill(t('cat.inUse'), { n: used })}</span>}
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => { setEditingId(c.id); setEditingName(c.name); setErr(''); }}
                  >
                    {t('common.rename')}
                  </button>
                  <button type="button" className="btn danger sm" onClick={() => remove(k.key, c)}>{t('common.delete')}</button>
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input
                value={adding}
                onChange={e => setAdding(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') add(k.key); }}
                placeholder={t('cat.newPh')}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 11, border: '1px solid var(--border-strong)', background: 'var(--bg)' }}
              />
              <button type="button" className="btn primary" onClick={() => add(k.key)} disabled={busy}>{t('common.add')}</button>
            </div>
          </section>
        );
      })}
      {err && <div style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600 }}>{err}</div>}
      <p style={{ color: 'var(--text-muted)', fontSize: 12.5, margin: 0 }}>
        {t('cat.footer')}
      </p>
    </div>
  );
}
