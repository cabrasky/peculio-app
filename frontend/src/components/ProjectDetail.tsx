/* ── Desglose de un proyecto: todos los gastos que lo componen ─────────────── */
import { useParams, Link, useNavigate } from 'react-router-dom';
import { expenseCost } from '../types';
import { loadData, deleteExpense, updateExpense } from '../store';
import { useLocale, fill, refLabel } from '../i18n';
import { IconArrowLeft, IconPlus, IconTrash } from './Icons';
import { eur } from '../format';

interface Props {
  onRefresh: () => void;
  onEditExpense: (id: string) => void;
  onAddToProject: (projectId: string) => void;
}

export default function ProjectDetail({ onRefresh, onEditExpense, onAddToProject }: Props) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useLocale();
  const data = loadData();
  const project = data.projects.find(p => p.id === id);
  const items = data.expenses
    .filter(e => e.proyectoId === id)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!project) {
    return (
      <div className="card">
        <div className="empty">
          <p>{t('proj.notFound')}</p>
          <Link to="/projects" className="btn outline"><IconArrowLeft size={16} />{t('proj.backToList')}</Link>
        </div>
      </div>
    );
  }

  const total = items.reduce((s, e) => s + expenseCost(e), 0);
  const pending = items.filter(e => e.devuelto !== 'yes').reduce((s, e) => s + e.meCorresponde, 0);

  const handleUnlink = (expenseId: string) => {
    if (!confirm(t('proj.confirmUnlink'))) return;
    updateExpense(expenseId, { proyectoId: '' });
    onRefresh();
  };

  const handleDelete = (expenseId: string) => {
    if (!confirm(t('common.confirmDeleteExpense'))) return;
    deleteExpense(expenseId);
    onRefresh();
  };

  return (
    <div>
      <div className="page-head">
        <button className="back-btn" onClick={() => navigate('/projects')} title={t('proj.backTitle')} aria-label={t('proj.backTitle')}>
          <IconArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title">{project.name}</h1>
          <div className="page-sub">{fill(t('proj.subtitle'), { n: items.length })}</div>
        </div>
      </div>

      <div className="proj-hero">
        <div>
          <div className="hero-label">{fill(t('proj.investedIn'), { name: project.name })}</div>
          <div className="proj-total">{eur(total)}</div>
          <div className="proj-meta">{fill(t('proj.pendingByYou'), { v: `${eur(pending)}` })}</div>
        </div>
        <button className="btn on-hero" onClick={() => onAddToProject(project.id)}>
          <IconPlus size={16} /> {t('expense.addBtn')}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{t('proj.items')}</h3>
          <span className="card-total">{eur(total)}</span>
        </div>
        {items.length === 0 ? (
          <div className="empty">
            <p>{t('proj.noItems')}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t('common.date')}</th><th>{t('proj.item')}</th><th>{t('expense.purpose')}</th><th>{t('expense.method')}</th><th>{t('common.amount')}</th><th></th></tr>
              </thead>
              <tbody>
                {items.map(e => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>
                      <strong>{e.desc}</strong>
                      {e.motivo && <span className="td-meta">{refLabel('motives', e.motivo, t)}</span>}
                    </td>
                    <td>{e.proposito ? <span className={`tag tag-${e.proposito.toLowerCase().replace(/[\/\s]/g, '')}`}>{refLabel('categories', e.proposito, t)}</span> : '-'}</td>
                    <td className="td-muted">{e.metodo ? refLabel('methods', e.metodo, t) : '-'}</td>
                    <td className="td-amount">{eur(e.amount)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn sm outline" onClick={() => onEditExpense(e.id)} title={t('expense.editLabel')}>{t('common.edit')}</button>
                        <button className="btn sm outline" onClick={() => handleUnlink(e.id)} title={t('proj.unlinkTitle')}>{t('common.remove')}</button>
                        <button className="btn sm danger" onClick={() => handleDelete(e.id)} title={t('common.delete')}><IconTrash size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <p className="hint" style={{ color: 'var(--text-muted)', fontSize: '.78rem', padding: '0 4px' }}>
          {t('proj.tip')}
        </p>
      )}
    </div>
  );
}
