import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Expense } from '../types';
import { useLocale } from '../i18n';
import { useAuth } from '../AuthContext';
import {
  IconPlus, IconList, IconTarget,
  IconTrendingUp, IconRefresh, IconHome, IconGrid, IconUsers, IconSettings, IconLogOut, IconShield, BrandMark,
} from './Icons';
import { pendingDebtCount } from '../personas';

export type Tab = 'dashboard' | 'expenses' | 'incomes' | 'goals' | 'subs' | 'projects' | 'pending' | 'more';

function pathToTab(pathname: string): Tab | null {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname === '/expenses') return 'expenses';
  if (pathname === '/incomes') return 'incomes';
  if (pathname === '/goals') return 'goals';
  if (pathname === '/subs') return 'subs';
  if (pathname === '/projects' || pathname.startsWith('/projects/')) return 'projects';
  if (pathname === '/pending') return 'pending';
  if (pathname === '/more' ||pathname.startsWith('/more/')) return 'more';
  return null;
}

// Título de página (Fraunces) para las secciones que no pintan el suyo propio
const PAGE_TITLES: Record<string, string> = {
  '/incomes': 'nav.incomes',
  '/goals': 'nav.goals',
  '/subs': 'nav.subs',
  '/more/subs': 'nav.subs',
  '/projects': 'nav.projects',
  '/pending': 'nav.debts',
  '/more': 'nav.more',
  '/more/monthly': 'nav.monthly',
  '/more/weekly': 'nav.weekly',
  '/more/sanity': 'nav.check',
  '/categories': 'more.categories',
  '/excel': 'more.excel',
  '/help': 'more.help',
  '/developer': 'more.developer',
  '/settings': 'settings.title',
  '/support': 'support.title',
  '/admin': 'admin.title',
};

const NAV_ITEMS: { key: Tab; icon: React.ReactNode; i18nKey: string; path: string }[] = [
  { key: 'dashboard', icon: <IconHome size={18} />, i18nKey: 'nav.dashboard', path: '/dashboard' },
  { key: 'expenses', icon: <IconList size={18} />, i18nKey: 'nav.expenses', path: '/expenses' },
  { key: 'incomes', icon: <IconTrendingUp size={18} />, i18nKey: 'nav.incomes', path: '/incomes' },
  { key: 'goals', icon: <IconTarget size={18} />, i18nKey: 'nav.goals', path: '/goals' },
  { key: 'subs', icon: <IconRefresh size={18} />, i18nKey: 'nav.subs', path: '/subs' },
  {
    key: 'projects', icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
    ), i18nKey: 'nav.projects', path: '/projects',
  },
  { key: 'pending', icon: <IconUsers size={18} />, i18nKey: 'nav.debts', path: '/pending' },
  { key: 'more', icon: <IconGrid size={18} />, i18nKey: 'nav.more', path: '/more' },
];

interface Props {
  children: React.ReactNode;
  expenses: Expense[];
  onAddClick: () => void;
}

export default function DesktopLayout({
  children, expenses, onAddClick,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const currentTab = pathToTab(location.pathname);

  const pendingCount = useMemo(() => pendingDebtCount(expenses), [expenses]);
  const { t } = useLocale();

  return (
    <div className="layout-desktop">
      <nav className="desktop-sidebar" aria-label={t('nav.main')}>
        <div className="header-brand">
          <BrandMark size={44} bare />
          <span className="header-title">Peculio</span>
        </div>
        <button className="btn primary sidebar-addbtn" onClick={onAddClick}>
          <IconPlus size={18} />{t('nav.newExpense')}
        </button>
        <div className="sidebar-section">
          {NAV_ITEMS.map(item => {
            const active = currentTab === item.key;
            const badge = item.key === 'pending' && pendingCount > 0;
            return (
              <button
                key={item.key}
                className={`sidebar-item ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.path)}
              >
                {item.icon}<span>{t(item.i18nKey)}</span>
                {badge ? <span className="sidebar-badge">{pendingCount}</span> : active && <span className="nav-dot" aria-hidden="true" />}
              </button>
            );
          })}
          {user?.is_admin && (
            <button
              className={`sidebar-item ${location.pathname === '/admin' ? 'active' : ''}`}
              aria-current={location.pathname === '/admin' ? 'page' : undefined}
              onClick={() => navigate('/admin')}
            >
              <IconShield size={18} /><span>{t('admin.title')}</span>
              {location.pathname === '/admin' && <span className="nav-dot" aria-hidden="true" />}
            </button>
          )}
        </div>
        <div className="sidebar-footer">
          {user && (
            <button className="user-card" onClick={() => navigate('/settings')} title={t('settings.title')} aria-current={location.pathname === '/settings' ? 'page' : undefined}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="user-avatar" />
              ) : (
                <span className="user-avatar user-avatar-fallback">{(user.name || '?').charAt(0).toUpperCase()}</span>
              )}
              <span className="user-meta">
                <span className="user-name">{user.name}</span>
                <span className="user-email">{user.email}</span>
              </span>
              <span className="user-card-gear" aria-hidden="true"><IconSettings size={18} /></span>
            </button>
          )}
          {user && (
            <button type="button" className="sidebar-logout" onClick={logout}>
              <IconLogOut size={18} />{t('more.logout')}
            </button>
          )}
        </div>
      </nav>
      <div className="desktop-main">
        <main className="desktop-content">
          {PAGE_TITLES[location.pathname] && (
            <div className="xg-title page-title-block"><h1>{t(PAGE_TITLES[location.pathname])}</h1></div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
