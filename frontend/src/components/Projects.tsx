/* ── Proyectos: gastos enlazables a proyectos (NAS, homelab…) vs uso general ── */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocale, fill } from '../i18n';
import { expenseCost } from '../types';
import type { Project } from '../types';
import { loadData, addProject, updateProject, deleteProject } from '../store';
import { IconPlus, IconX, IconEdit, IconTrash, IconArrowRight } from './Icons';
import { eur } from '../format';

interface Props {
  onRefresh: () => void;
  onAddToProject: (projectId: string) => void;
}

export default function ProjectsPage({ onRefresh, onAddToProject }: Props) {
  const { t } = useLocale();
  const data = loadData();
  const projects = data.projects;
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const statsFor = (id: string) => {
    const list = data.expenses.filter(e => e.proyectoId === id);
    return { count: list.length, total: list.reduce((s, e) => s + expenseCost(e), 0) };
  };
  const generalTotal = data.expenses.filter(e => !e.proyectoId).reduce((s, e) => s + expenseCost(e), 0);

  const openNew = () => {
    setEditing(null); setName(''); setError(''); setShowForm(true);
  };

  const openEdit = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    setEditing(p); setName(p.name); setError(''); setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('error.nameRequired')); return; }
    if (editing) {
      updateProject(editing.id, name.trim());
    } else {
      addProject(name.trim());
    }
    setShowForm(false);
    onRefresh();
  };

  const handleDelete = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    const s = statsFor(p.id);
    const extra = s.count > 0 ? '\n\n' + fill(t('proj.confirmDeleteExtra'), { n: s.count, v: `${eur(s.total)}` }) : '';
    if (!confirm(fill(t('proj.confirmDelete'), { name: p.name }) + extra)) return;
    deleteProject(p.id);
    onRefresh();
  };

  const handleAddExpense = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    onAddToProject(p.id);
  };

  return (
    <div>
      <div className="stats">
        <div className="stat">
          <div className="label">{t('nav.projects')}</div>
          <div className="value primary">{projects.length}</div>
        </div>
        <div className="stat">
          <div className="label">{t('proj.inProjects')}</div>
          <div className="value">{data.expenses.filter(e => e.proyectoId).length}</div>
        </div>
        <div className="stat">
          <div className="label">{t('proj.invested')}</div>
          <div className="value">{eur(data.expenses.filter(e => e.proyectoId).reduce((s, e) => s + expenseCost(e), 0))}</div>
        </div>
        <div className="stat">
          <div className="label">{t('proj.general')}</div>
          <div className="value">{eur(generalTotal)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>{t('nav.projects')} ({projects.length})</h3>
          <button className="btn primary sm" onClick={openNew}>
            <IconPlus size={14} /> {t('proj.new')}
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="empty">
            <p>{t('proj.empty')}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t('common.name')}</th><th>{t('nav.expenses')}</th><th>{t('common.total')}</th><th></th></tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const s = statsFor(p.id);
                  return (
                    <tr key={p.id} className="row-link" onClick={() => navigate(`/projects/${p.id}`)} title={t('proj.viewBreakdown')}>
                      <td>
                        <strong>{p.name}</strong>
                        <span className="td-meta td-link">{t('proj.viewBreakdown')}<IconArrowRight size={12} /></span>
                      </td>
                      <td>{s.count}</td>
                      <td className="td-amount">{eur(s.total)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn sm primary" onClick={e => handleAddExpense(e, p)} title={t('proj.addExpenseTitle')}>
                            <IconPlus size={14} /> {t('expense.addBtn')}
                          </button>
                          <button className="btn sm outline" onClick={e => openEdit(e, p)} title={t('common.rename')}><IconEdit size={14} /></button>
                          <button className="btn sm outline" onClick={() => navigate(`/projects/${p.id}`)} title={t('proj.viewBreakdown')}><IconArrowRight size={14} /></button>
                          <button className="btn sm danger" onClick={e => handleDelete(e, p)} title={t('common.delete')}><IconTrash size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint" style={{ padding: '6px 4px 0', color: 'var(--text-muted)', fontSize: '.78rem' }}>
          {t('proj.hint')}
        </p>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? t('proj.rename') : t('proj.new')}</h2>
              <button className="modal-close" onClick={() => setShowForm(false)} type="button" aria-label={t('common.close')}><IconX size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label>{t('common.name')}</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('proj.namePh')} autoFocus />
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '.85rem' }}>{error}</p>}
              <div className="form-actions">
                <button type="submit" className="btn primary">{editing ? t('common.save') : t('proj.create')}</button>
                <button type="button" className="btn outline" onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
