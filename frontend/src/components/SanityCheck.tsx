import { useMemo } from 'react';
import type { Expense } from '../types';
import { useLocale } from '../i18n';
import { IconCheckCircle, IconAlertTriangle, IconAlertCircle, IconInfo } from './Icons';
import { eur } from '../format';

interface Props {
  expenses: Expense[];
}

export default function SanityCheck({ expenses }: Props) {
  const { t } = useLocale();
  const checks = useMemo(() => {
    const list: { text: string; cls: 'ok' | 'warn' | 'err' }[] = [];
    const seen: Record<string, number> = {};

    expenses.forEach(e => {
      if (!e.date) list.push({ text: `"${e.desc}" ${t('sanity.noDate')}`, cls: 'err' });
      if (!e.amount) list.push({ text: `"${e.desc}" ${t('sanity.noAmount')}`, cls: 'warn' });
      if (e.ajeno && e.deudores && !e.deudaMetodo) list.push({ text: `"${e.desc}" ${t('sanity.noMethod')}`, cls: 'warn' });
      if (e.ajeno && !e.deudores) list.push({ text: `"${e.desc}" ${t('sanity.noDebtors')}`, cls: 'warn' });
      if (e.amount > 1000) list.push({ text: `${t('sanity.highAmount')}: ${eur(e.amount)} — "${e.desc}"`, cls: 'warn' });
      if (e.amount < 0) list.push({ text: `${t('sanity.negative')}: "${e.desc}"`, cls: 'err' });

      const key = `${e.date}|${e.desc}|${e.amount}`;
      if (seen[key]) list.push({ text: `${t('sanity.duplicate')}: "${e.desc}" (${e.date})`, cls: 'warn' });
      seen[key] = (seen[key] || 0) + 1;
    });

    if (list.length === 0) list.push({ text: t('sanity.noIncidents'), cls: 'ok' });
    return list;
  }, [expenses, t]);

  const counts = { ok: checks.filter(c => c.cls === 'ok').length, warn: checks.filter(c => c.cls === 'warn').length, err: checks.filter(c => c.cls === 'err').length };

  const IconComponent = (cls: string) => {
    switch (cls) {
      case 'ok': return <IconCheckCircle size={16} className="icon-success" />;
      case 'warn': return <IconAlertTriangle size={16} className="icon-warning" />;
      case 'err': return <IconAlertCircle size={16} className="icon-danger" />;
      default: return <IconInfo size={16} />;
    }
  };

  return (
    <>
      <div className="stats">
        <div className="stat"><div className="label">{t('sanity.ok')}</div><div className="value positive">{counts.ok}</div></div>
        <div className="stat"><div className="label">{t('sanity.warnings')}</div><div className="value warning">{counts.warn}</div></div>
        <div className="stat"><div className="label">{t('sanity.errors')}</div><div className="value negative">{counts.err}</div></div>
        <div className="stat"><div className="label">{t('sanity.totalExpenses')}</div><div className="value primary">{expenses.length}</div></div>
      </div>
      <div className="card">
        <h3>{t('sanity.title')}</h3>
        {checks.length === 0 ? (
          <div className="empty">
            <IconCheckCircle size={24} className="icon-success" />
            <p>{t('sanity.noIncidents')}</p>
          </div>
        ) : (
          <ul className="sanity-list">
            {checks.map((c, i) => (
              <li key={i} className={`sanity-item sanity-${c.cls}`}>
                {IconComponent(c.cls)}
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
