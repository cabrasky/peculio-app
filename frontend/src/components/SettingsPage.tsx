/* ── Configuración: preferencias, perfil, datos, legal y baja ──────────────────
   Reúne lo que antes estaba suelto en la cabecera (idioma, tema, exportar CSV)
   y el perfil (nombre, avatar, contraseña). */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Expense } from '../types';
import { useLocale } from '../i18n';
import { usePreferences } from '../PreferencesContext';
import { exportExpensesCsv } from '../exportCsv';
import PreferencesForm from './PreferencesForm';
import Profile from './Profile';
import { IconSettings, IconDownload, IconLogOut, IconInfo, IconTrash, IconLifeBuoy } from './Icons';
import LegalLinks from './LegalLinks';
import DeleteAccountModal from './DeleteAccountModal';
import { useAuth } from '../AuthContext';

export default function SettingsPage({ expenses }: { expenses: Expense[] }) {
  const { t } = useLocale();
  const prefs = usePreferences();
  const { user, logout } = useAuth();
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="settings-page">
      <section className="admin-section">
        <h3 className="h3-icon"><IconSettings size={18} />{t('settings.prefs')}</h3>
        <p className="hint">{t('settings.prefsHint')}</p>
        <PreferencesForm value={prefs} onChange={p => prefs.setPrefs(p)} />
      </section>

      <Profile />

      <section className="admin-section">
        <h3 className="h3-icon"><IconDownload size={18} />{t('settings.data')}</h3>
        <p className="hint">{t('settings.dataHint')}</p>
        <div className="row-actions">
          <button type="button" className="btn outline" onClick={() => exportExpensesCsv(expenses)}>
            <IconDownload size={16} />{t('common.exportCsv')}
          </button>
          <Link to="/excel" className="btn outline">{t('more.excel')}</Link>
        </div>
      </section>

      <section className="admin-section">
        <h3 className="h3-icon"><IconLifeBuoy size={18} />{t('support.title')}</h3>
        <p className="hint">{t('support.desc')}</p>
        <div className="row-actions">
          <Link to="/support" className="btn outline">{t('support.open')}</Link>
          <Link to="/help" className="btn outline">{t('more.help')}</Link>
        </div>
      </section>

      <section className="admin-section">
        <h3 className="h3-icon"><IconInfo size={18} />{t('legal.title')}</h3>
        <p className="hint">{t('settings.legalHint')}</p>
        <LegalLinks className="settings-legal" />
      </section>

      <div>
        <button type="button" className="btn outline danger-text" onClick={logout}>
          <IconLogOut size={16} />{t('more.logout')}
        </button>
      </div>

      {/* La demo pública no se puede eliminar */}
      {!user?.is_demo && (
        <section className="admin-section danger-zone">
          <h3 className="h3-icon"><IconTrash size={18} />{t('account.deleteTitle')}</h3>
          <p className="hint">{t('account.deleteText')}</p>
          <p className="hint">{t('account.deleteCc')}</p>
          <div>
            <button type="button" className="btn danger" onClick={() => setDeleting(true)}>
              <IconTrash size={16} />{t('account.deleteBtn')}
            </button>
          </div>
        </section>
      )}
      {deleting && <DeleteAccountModal onClose={() => setDeleting(false)} />}
    </div>
  );
}
