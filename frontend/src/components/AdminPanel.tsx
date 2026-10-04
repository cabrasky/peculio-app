/* ── Panel de admin: uso, usuarios, soporte, sistema y configuración ──────────
   Pestañas en la URL (?tab=users…) para poder enlazarlas (p. ej. desde el email
   de una consulta nueva: /admin?tab=support). */
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useLocale } from '../i18n';
import { IconChart, IconUsers, IconLifeBuoy, IconServer, IconSettings, IconSmartphone } from './Icons';
import AdminOverview from './admin/AdminOverview';
import AdminUsers from './admin/AdminUsers';
import AdminSupport from './admin/AdminSupport';
import AdminSystem from './admin/AdminSystem';
import AdminConfig from './admin/AdminConfig';
import AdminApk from './admin/AdminApk';

const TABS = [
  { key: 'overview', icon: <IconChart size={16} />, label: 'admin.tabOverview' },
  { key: 'users', icon: <IconUsers size={16} />, label: 'admin.tabUsers' },
  { key: 'support', icon: <IconLifeBuoy size={16} />, label: 'admin.tabSupport' },
  { key: 'system', icon: <IconServer size={16} />, label: 'admin.tabSystem' },
  { key: 'apk', icon: <IconSmartphone size={16} />, label: 'admin.tabApk' },
  { key: 'config', icon: <IconSettings size={16} />, label: 'admin.tabConfig' },
] as const;
type TabKey = typeof TABS[number]['key'];

export default function AdminPanel() {
  const { user } = useAuth();
  const { t } = useLocale();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabKey = TABS.some(x => x.key === raw) ? raw as TabKey : 'overview';

  if (!user?.is_admin) {
    return <div className="admin-panel"><p>{t('admin.denied')}</p></div>;
  }

  const go = (key: TabKey) => setParams(key === 'overview' ? {} : { tab: key });

  return (
    <div className="adm">
      <div className="adm-tabs" role="tablist" aria-label={t('admin.title')}>
        {TABS.map(x => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key}
            className={tab === x.key ? 'active' : undefined} onClick={() => go(x.key)}>
            {x.icon}<span>{t(x.label)}</span>
          </button>
        ))}
      </div>
      {tab === 'overview' && <AdminOverview onOpenSupport={() => go('support')} />}
      {tab === 'users' && <AdminUsers />}
      {tab === 'support' && <AdminSupport />}
      {tab === 'system' && <AdminSystem />}
      {tab === 'apk' && <AdminApk />}
      {tab === 'config' && <AdminConfig />}
    </div>
  );
}
