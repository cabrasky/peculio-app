import { useState, useMemo, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { loadData, deleteExpense, loadAllFromServer } from './store';
import { tNow } from './i18n';
import AddExpense from './components/AddExpense';
import SettingsPage from './components/SettingsPage';
import SetupModal from './components/SetupModal';
import DemoBanner from './components/DemoBanner';
import { blockedInDemo } from './demo';
import { PreferencesProvider, usePreferences } from './PreferencesContext';
import Dashboard from './components/Dashboard';
import ExpenseList from './components/ExpenseList';
import IncomesPage from './components/Incomes';
import GoalsPage from './components/Goals';
import MoreMenu from './components/MoreMenu';
import MonthlySummary from './components/MonthlySummary';
import ProjectsPage from './components/Projects';
import ProjectDetail from './components/ProjectDetail';
import WeeklyBudget from './components/WeeklyBudget';
import PendingPayments from './components/PendingPayments';
import SanityCheck from './components/SanityCheck';
import SubscriptionsPage from './components/Subscriptions';
import DesktopLayout from './components/DesktopLayout';
import MobileLayout from './components/MobileLayout';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import AdminPanel from './components/AdminPanel';
import Landing from './components/Landing';
import LegalPage from './components/LegalPage';
import SupportPage from './components/SupportPage';
import CategoriesPage from './components/CategoriesPage';
import ExcelPage from './components/ExcelPage';
import HelpPage from './components/HelpPage';
import DeveloperPage from './components/DeveloperPage';
import { MonthlyChart, CashFlowChart, BalanceEvolution, IncomeExpenseComparison, SankeyChart, DailyTrendCharts, CategoryFilter, CategoryCompare } from './components/Charts';
import { catDot } from './categoryColors';
import { BrandMark } from './components/Icons';
import PeriodCompare from './components/CompareCharts';
import './App.css';

const LAYOUT_BREAK = 1024;
const autoLayout = (): 'desktop' | 'mobile' => (window.innerWidth < LAYOUT_BREAK ? 'mobile' : 'desktop');
// Limpieza: el antiguo selector manual escritorio/móvil ya no existe
try { localStorage.removeItem('gastos_layout_pin'); } catch { /* sin localStorage */ }

function MonthlyCharts({ expenses, incomes }: { expenses: any[]; incomes: any[] }) {
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    expenses.forEach((e: any) => m.set(e.proposito, (m.get(e.proposito) || 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [expenses]);
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = selected.length ? expenses.filter((e: any) => selected.includes(e.proposito)) : expenses;
  const selCats = (selected.length ? selected : cats).map((name: string) => ({ name, color: catDot(name) }));
  return (
    <>
      <CategoryFilter cats={cats.map((name: string) => ({ name, color: catDot(name) }))}
        selected={selected} onChange={setSelected} />
      {selCats.length > 0 && <CategoryCompare expenses={expenses} cats={selCats} />}
      <CashFlowChart expenses={filtered} incomes={incomes} />
      <SankeyChart expenses={filtered} incomes={incomes} />
      <BalanceEvolution expenses={filtered} incomes={incomes} />
      <MonthlyChart expenses={filtered} />
      <DailyTrendCharts expenses={filtered} />
      <MonthlySummary expenses={filtered} />
      <IncomeExpenseComparison expenses={filtered} incomes={incomes} />
      <PeriodCompare expenses={filtered} incomes={incomes} />
    </>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [layout, setLayout] = useState<'desktop' | 'mobile'>(autoLayout);
  const { weeklyGoal, setPrefs } = usePreferences();
  const [setupLater, setSetupLater] = useState(false);
  const [data, setData] = useState(() => loadData());
  const [editId, setEditId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addPresetProject, setAddPresetProject] = useState('');
  // El layout se adapta solo al ancho de la pantalla
  useEffect(() => {
    const onResize = () => setLayout(autoLayout());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const refresh = useCallback(() => { setData(loadData()); setEditId(null); }, []);

  const handleDelete = (id: string) => {
    if (blockedInDemo()) return;
    if (!confirm(tNow('common.confirmDeleteExpense'))) return;
    deleteExpense(id);
    refresh();
  };

  const openAddFor = (projectId: string) => { setEditId(null); setAddPresetProject(projectId); setShowAddModal(true); };
  const handleAddClick = () => openAddFor('');
  const handleEdit = (id: string) => { setEditId(id); setAddPresetProject(''); setShowAddModal(true); };
  const handleCloseAdd = () => { setShowAddModal(false); setEditId(null); setAddPresetProject(''); };
  const handleSave = () => { refresh(); setShowAddModal(false); setEditId(null); setAddPresetProject(''); };

  // Al entrar con sesión, cargar todos los datos del servidor (multi-dispositivo)
  // (una vez por cuenta: al cambiar de cuenta, p. ej. demo → registro, se recarga)
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  useEffect(() => {
    if (user && syncedFor !== user.id) {
      setSyncedFor(user.id);
      refresh();
      loadAllFromServer().then(ok => { if (ok) refresh(); });
    }
  }, [user, syncedFor, refresh]);

  const editExpense = editId ? data.expenses.find((e: any) => e.id === editId) || null : null;

  // Show loading screen while checking auth
  if (loading) {
    return (
      <div className="loading-screen">
        <BrandMark size="lg" />
        <h2>Peculio</h2>
        <div className="loading-spinner" />
      </div>
    );
  }

  // Auth routes (always accessible)
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/legal" element={<Navigate to="/legal/privacidad" replace />} />
        <Route path="/legal/:doc" element={<LegalPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Main app routes
  const routes = (
    <Routes>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={
        <Dashboard expenses={data.expenses} incomes={data.incomes} goals={data.goals} subscriptions={data.subscriptions} />
      } />
      <Route path="/expenses" element={
        <ExpenseList expenses={data.expenses} onEdit={handleEdit} onDelete={handleDelete} compact={layout === 'mobile'} />
      } />
      <Route path="/incomes" element={
        <IncomesPage incomes={data.incomes} onRefresh={refresh} />
      } />
      <Route path="/goals" element={
        <GoalsPage goals={data.goals} onRefresh={refresh} />
      } />
      <Route path="/subs" element={
        <SubscriptionsPage subscriptions={data.subscriptions} onRefresh={refresh} />
      } />
      <Route path="/more" element={<MoreMenu />} />
      <Route path="/more/monthly" element={
        <MonthlyCharts expenses={data.expenses} incomes={data.incomes} />
      } />
      <Route path="/more/weekly" element={
        <WeeklyBudget expenses={data.expenses} weeklyGoal={weeklyGoal} onGoalChange={v => setPrefs({ weeklyGoal: v })} />
      } />
      <Route path="/pending" element={
        <PendingPayments expenses={data.expenses} onRefresh={refresh} />
      } />
      <Route path="/more/debts" element={<Navigate to="/pending" replace />} />
      <Route path="/more/subs" element={
        <SubscriptionsPage subscriptions={data.subscriptions} onRefresh={refresh} />
      } />
      <Route path="/more/sanity" element={
        <SanityCheck expenses={data.expenses} />
      } />
      <Route path="/admin" element={
        <AdminPanel />
      } />
      <Route path="/settings" element={<SettingsPage expenses={data.expenses} />} />
      <Route path="/profile" element={<Navigate to="/settings" replace />} />
      <Route path="/categories" element={
        <CategoriesPage expenses={data.expenses} incomes={data.incomes} subscriptions={data.subscriptions} />
      } />
      <Route path="/excel" element={<ExcelPage onImported={refresh} />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/legal" element={<Navigate to="/legal/privacidad" replace />} />
      <Route path="/legal/:doc" element={<LegalPage />} />
      <Route path="/developer" element={<DeveloperPage />} />
      <Route path="/projects" element={
        <ProjectsPage onRefresh={refresh} onAddToProject={openAddFor} />
      } />
      <Route path="/projects/:id" element={
        <ProjectDetail onRefresh={refresh} onEditExpense={handleEdit} onAddToProject={openAddFor} />
      } />
    </Routes>
  );

  // Primera vez en su espacio: ventana para elegir nombre, idioma, tema y presupuesto
  const setupModal = user.setup_done === false && !setupLater ? <SetupModal onLater={() => setSetupLater(true)} /> : null;

  if (layout === 'desktop') {
    return (
      <DesktopLayout expenses={data.expenses} onAddClick={handleAddClick}>
        <DemoBanner />
        {routes}
        <AddExpense isOpen={showAddModal} editExpense={editExpense} onClose={handleCloseAdd} onSaved={handleSave} presetProjectId={addPresetProject} />
        {setupModal}
      </DesktopLayout>
    );
  }

  return (
    <>
      <MobileLayout onAddClick={handleAddClick}>
        <DemoBanner />
        {routes}
      </MobileLayout>
      <AddExpense isOpen={showAddModal} editExpense={editExpense} onClose={handleCloseAdd} onSaved={handleSave} presetProjectId={addPresetProject} />
      {setupModal}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <AppContent />
      </PreferencesProvider>
    </AuthProvider>
  );
}
