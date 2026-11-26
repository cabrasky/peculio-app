import type { Expense, Income, Goal, Subscription, Project, AppData } from './types';
import { REF } from './types';
import {
  apiListExpenses, apiCreateExpense, apiUpdateExpense, apiDeleteExpense,
  apiListIncomes, apiCreateIncome, apiUpdateIncome, apiDeleteIncome,
  apiListGoals, apiCreateGoal, apiUpdateGoal, apiDeleteGoal,
  apiListSubscriptions, apiCreateSubscription, apiUpdateSubscription, apiDeleteSubscription,
  apiListProjects, apiCreateProject, apiUpdateProject, apiDeleteProject,
  apiListCategories,
} from './api';
import type {
  ServerExpense, ExpenseCreateBody,
  ServerIncome, IncomeCreateBody,
  ServerGoal, GoalCreateBody,
  ServerSubscription, SubscriptionCreateBody,
  ServerProject, ProjectCreateBody,
} from './api';
import { tNow } from './i18n';
import { blockedInDemo } from './demo';
import {
  readOperations, saveOperations, deletedIds, markDeleted, clearSyncData,
  getSyncStatus, recordSyncError, resetSyncError,
} from './syncQueue';
import type { SyncKind, SyncOperation } from './syncQueue';
export { getSyncStatus } from './syncQueue';

const STORAGE_KEY = 'gastos_app_data';

const EMPTY_DATA: AppData = { expenses: [], incomes: [], goals: [], subscriptions: [], projects: [] };

/* ── Categorías propias del usuario (servidor) ───────────────────────────── */
export interface UserCategory { id: string; name: string; color: string }

let catCache: { expense: UserCategory[]; income: UserCategory[] } = { expense: [], income: [] };

export function cats(kind: 'expense' | 'income'): UserCategory[] { return catCache[kind]; }
export function catsNames(kind: 'expense' | 'income'): string[] { return catCache[kind].map(c => c.name); }
export function catsOr(kind: 'expense' | 'income', fallback: string[]): string[] {
  const n = catsNames(kind);
  return n.length ? n : fallback;
}

export async function refreshCategories(): Promise<void> {
  try {
    const all = await apiListCategories();
    const toCat = (c: { id: string; kind: string; name: string; color: string }): UserCategory =>
      ({ id: c.id, name: c.name, color: c.color });
    catCache = {
      expense: all.filter(c => c.kind === 'expense').map(toCat),
      income: all.filter(c => c.kind === 'income').map(toCat),
    };
    // Los selects leen REF.propositos / REF.incomeCategories: actualízalos en sitio
    const fill = (arr: string[], names: string[]) => { arr.splice(0, arr.length, ...names); };
    if (catCache.expense.length) fill(REF.propositos, catCache.expense.map(c => c.name));
    if (catCache.income.length) fill(REF.incomeCategories, catCache.income.map(c => c.name));
  } catch (e) {
    console.warn('[sync] carga de categorías falló:', e);
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_DATA };
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...EMPTY_DATA, ...parsed,
      expenses: parsed.expenses || [],
      incomes: parsed.incomes || [],
      goals: parsed.goals || [],
      subscriptions: parsed.subscriptions || [],
      projects: parsed.projects || [],
    };
  } catch {
    return { ...EMPTY_DATA };
  }
}

/** Al cerrar sesión o entrar a la demo: olvida los datos de la cuenta anterior
 *  (si no, al entrar en una cuenta vacía se subirían como "datos locales"). */
export function clearLocalData() {
  localStorage.removeItem(STORAGE_KEY);
  clearSyncData();
  catCache = { expense: [], income: [] };
}

function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function isServerId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// actionKey: clave i18n de la acción (sync.addExpense…)
function syncError(actionKey: string) {
  console.warn(`[sync] ${actionKey} falló en el servidor`);
  try {
    alert(tNow('sync.error', { a: tNow(actionKey) }));
  } catch { /* noop */ }
}

/* ===== SUGERENCIA INTELIGENTE DE CATEGORÍA/TIPO ===== */

export interface Suggestion { proposito: string; tipo: string; motivo: string; metodo: string; proyectoId: string; match: string; }

const normDesc = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\wáéíóúñ\s]/g, ' ').replace(/\s+/g, ' ').trim();

export function suggestExpense(desc: string, limit = 30): Suggestion | null {
  const q = normDesc(desc);
  if (q.length < 3) return null;
  const words = q.split(' ').filter(w => w.length > 3);
  if (!words.length) return null;
  const hits = loadData().expenses
    .map(e => ({ e, n: normDesc(e.desc) }))
    .filter(x => x.n.length >= 3 && words.every(w => x.n.includes(w)))
    .sort((a, b) => (b.e.createdAt || '').localeCompare(a.e.createdAt || ''))
    .slice(0, limit);
  if (!hits.length) return null;
  const mode = (pick: (x: typeof hits[0]) => string, skip = (v: string) => !v) => {
    const c: Record<string, { n: number; last: number }> = {};
    hits.forEach((h, i) => { const v = pick(h); if (skip(v)) return; c[v] = c[v] || { n: 0, last: i }; c[v].n++; c[v].last = Math.min(c[v].last, i); });
    const best = Object.entries(c).sort((a, b) => b[1].n - a[1].n || a[1].last - b[1].last)[0];
    return best ? best[0] : '';
  };
  return {
    proposito: mode(h => h.e.proposito),
    tipo: mode(h => h.e.tipo) || 'Puntual',
    motivo: mode(h => h.e.motivo),
    metodo: mode(h => h.e.metodo) || 'Tarjeta',
    proyectoId: mode(h => h.e.proyectoId || ''),
    match: hits[0].e.desc,
  };
}

/* ===== Durable expense / income outbox ===== */
const active = new Set<string>();
const adoptedIds = new Set<string>();
let processing: Promise<void> | null = null;
const rowFor = (kind: SyncKind, id: string): Expense | Income | undefined =>
  loadData()[kind].find(row => row.id === id);
const operationKey = (op: SyncOperation) => `${op.kind}:${op.localId}:${op.action}`;

function enqueueCreate(kind: SyncKind, id: string) {
  const row = rowFor(kind, id);
  const snapshot = row ? (kind === 'expenses' ? toServerExpense(row as Expense) : toServerIncome(row as Income)) : {};
  const op: SyncOperation = { kind, action: 'create', localId: id, clientId: crypto.randomUUID(), snapshot: { ...snapshot }, attempts: 0, nextRetry: 0 };
  saveOperations([...readOperations(), op]);
  void retryPending();
}
function enqueueChange(kind: SyncKind, id: string, action: 'update' | 'delete') {
  const ops = readOperations();
  const create = ops.find(op => op.kind === kind && op.localId === id && op.action === 'create');
  if (action === 'delete') markDeleted(id);
  if (create && !active.has(operationKey(create))) {
    if (action === 'delete') saveOperations(ops.filter(op => op !== create));
    // Until a create is sent its payload is always read from the current local row.
    return;
  }
  if (!create && action === 'delete' && !isServerId(id) && !adoptedIds.has(id)) return;
  const prior = ops.find(op => op.kind === kind && op.localId === id && op.action !== 'create');
  if (prior) {
    if (action === 'delete') prior.action = 'delete';
    prior.nextRetry = 0;
  } else {
    ops.push({ kind, action, localId: id, clientId: create?.clientId || id, attempts: 0, nextRetry: 0 });
  }
  saveOperations(ops);
  void retryPending();
}
function bodyFor(op: SyncOperation): ExpenseCreateBody | IncomeCreateBody | undefined {
  const row = rowFor(op.kind, op.localId);
  if (!row) return op.action === 'create' ? { ...op.snapshot, client_id: op.clientId } as ExpenseCreateBody : undefined;
  return op.kind === 'expenses'
    ? { ...toServerExpense(row as Expense), client_id: op.clientId }
    : { ...toServerIncome(row as Income), client_id: op.clientId };
}
function removeOperation(op: SyncOperation) {
  saveOperations(readOperations().filter(item => !(item.kind === op.kind && item.localId === op.localId && item.action === op.action)));
}
async function sendOperation(op: SyncOperation) {
  const body = bodyFor(op);
  if (op.action === 'create') {
    // A deletion in flight still requires the idempotent create to resolve first.
    if (!body && !readOperations().some(x => x.kind === op.kind && x.localId === op.localId && x.action === 'delete')) {
      removeOperation(op); return;
    }
    const saved = op.kind === 'expenses'
      ? await apiCreateExpense(body as ExpenseCreateBody)
      : await apiCreateIncome(body as IncomeCreateBody);
    const pending = readOperations();
    const follow = pending.find(x => x.kind === op.kind && x.localId === op.localId && x.action !== 'create');
    if (follow) { follow.serverId = saved.id; follow.localId = saved.id; }
    saveOperations(pending.filter(x => !(x.kind === op.kind && x.localId === op.localId && x.action === 'create')));
    adoptedIds.add(saved.id);
    if (rowFor(op.kind, op.localId)) adoptServerId(op.kind, op.localId, saved.id);
    return;
  }
  const id = op.serverId || op.localId;
  if (op.action === 'update' && body) {
    if (op.kind === 'expenses') await apiUpdateExpense(id, body as ExpenseCreateBody);
    else await apiUpdateIncome(id, body as IncomeCreateBody);
  }
  if (op.action === 'delete') {
    try {
      if (op.kind === 'expenses') await apiDeleteExpense(id);
      else await apiDeleteIncome(id);
    } catch (error) {
      if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error;
    }
    markDeleted(id);
  }
  removeOperation(op);
}
export async function retryPending(force = false): Promise<void> {
  if (processing) return processing;
  if (getSyncStatus().authRequired && !force) return;
  processing = (async () => {
    for (;;) {
      const op = readOperations().find(item => force || item.nextRetry <= Date.now());
      if (!op) break;
      const key = operationKey(op);
      if (active.has(key)) continue;
      active.add(key);
      try { await sendOperation(op); }
      catch (error) {
        const ops = readOperations();
        const current = ops.find(x => x.kind === op.kind && x.localId === op.localId && x.action === op.action);
        if (current) {
          current.attempts += 1;
          current.nextRetry = recordSyncError(error, current.attempts);
          saveOperations(ops);
        }
        break;
      } finally { active.delete(key); }
    }
  })();
  try { await processing; } finally { processing = null; }
}
export function resumeSync(): void { resetSyncError(); void retryPending(true); }

/* ===== EXPENSES ===== */
interface ExpenseInput {
  date: string; desc: string; amount: number;
  proposito?: string; metodo?: string; motivo?: string; tipo?: string;
  ajeno?: number; invitacion?: number; deudores?: string; personas?: string; ref_cc?: string; deudaMetodo?: string;
  devuelto?: 'yes' | 'no'; meCorresponde?: number; viaje?: string; proyectoId?: string;
}

export function addExpense(input: ExpenseInput): Expense | null {
  if (blockedInDemo()) return null;
  const data = loadData();
  const expense: Expense = {
    id: genId(), date: input.date, desc: input.desc, amount: input.amount,
    proposito: input.proposito || '', metodo: input.metodo || 'Tarjeta',
    motivo: input.motivo || '', tipo: input.tipo || 'Puntual', ajeno: input.ajeno || 0, invitacion: input.invitacion ? 1 : 0,
    deudores: input.deudores || '', personas: input.personas || '', ref_cc: input.ref_cc || '', deudaMetodo: input.deudaMetodo || 'Bizum',
    devuelto: input.devuelto || 'no', meCorresponde: input.meCorresponde || 0,
    viaje: input.viaje || '', proyectoId: input.proyectoId || '',
    createdAt: new Date().toISOString(),
  };
  data.expenses.push(expense);
  saveData(data);
  enqueueCreate('expenses', expense.id);
  return expense;
}

export function updateExpense(id: string, updates: Partial<ExpenseInput>) {
  if (blockedInDemo()) return;
  const data = loadData();
  const idx = data.expenses.findIndex(e => e.id === id);
  if (idx === -1) return;
  data.expenses[idx] = { ...data.expenses[idx], ...updates };
  saveData(data);
  syncUpdatedExpense(id);
}

export function deleteExpense(id: string) {
  if (blockedInDemo()) return;
  const data = loadData();
  data.expenses = data.expenses.filter(e => e.id !== id);
  saveData(data);
  syncDeletedExpense(id);
}

/* ===== SYNC EXPENSES CON BACKEND ===== */

function toServerExpense(e: Expense): ExpenseCreateBody {
  return {
    date: e.date,
    description: e.desc,
    amount: e.amount,
    purpose: e.proposito,
    motive: e.motivo,
    type: e.tipo,
    method: e.metodo,
    is_shared: !!e.ajeno,
    is_invitation: !!e.invitacion,
    debtors: e.deudores || '',
    participants: e.personas || '',
    cc_reference: e.ref_cc || '',
    repayment_method: e.deudaMetodo,
    repaid: e.devuelto === 'yes',
    personal_share: e.meCorresponde,
    trip: e.viaje,
    project_id: e.proyectoId,
  };
}

function fromServerExpense(s: ServerExpense): Expense {
  return {
    id: s.id,
    date: s.date,
    desc: s.description,
    amount: s.amount,
    proposito: s.purpose,
    metodo: s.method,
    motivo: s.motive,
    tipo: s.type,
    ajeno: s.is_shared ? 1 : 0,
    invitacion: s.is_invitation ? 1 : 0,
    deudores: s.debtors,
    personas: s.participants || '',
    deudaMetodo: s.repayment_method,
    devuelto: s.repaid ? 'yes' : 'no',
    meCorresponde: s.personal_share,
    viaje: s.trip,
    proyectoId: s.project_id || '',
    ref_cc: s.cc_reference || '',
    hasPhoto: !!s.has_photo,
    createdAt: s.created_at,
  };
}

function syncUpdatedExpense(id: string) { enqueueChange('expenses', id, 'update'); }
function syncDeletedExpense(id: string) { enqueueChange('expenses', id, 'delete'); }

/* ===== INCOMES ===== */
interface IncomeInput {
  date: string; desc: string; amount: number;
  category?: string; notes?: string;
}

export function addIncome(input: IncomeInput): Income | null {
  if (blockedInDemo()) return null;
  const data = loadData();
  const income: Income = {
    id: genId(), date: input.date, desc: input.desc, amount: input.amount,
    category: input.category || 'Otro', notes: input.notes || '',
    createdAt: new Date().toISOString(),
  };
  data.incomes.push(income);
  saveData(data);
  enqueueCreate('incomes', income.id);
  return income;
}

export function updateIncome(id: string, updates: Partial<IncomeInput>) {
  if (blockedInDemo()) return;
  const data = loadData();
  const idx = data.incomes.findIndex(i => i.id === id);
  if (idx === -1) return;
  data.incomes[idx] = { ...data.incomes[idx], ...updates };
  saveData(data);
  syncUpdatedIncome(id);
}

export function deleteIncome(id: string) {
  if (blockedInDemo()) return;
  const data = loadData();
  data.incomes = data.incomes.filter(i => i.id !== id);
  saveData(data);
  syncDeletedIncome(id);
}

/* ===== SYNC INCOMES CON BACKEND ===== */

function toServerIncome(i: Income): IncomeCreateBody {
  return { date: i.date, description: i.desc, amount: i.amount, category: i.category, notes: i.notes };
}

function fromServerIncome(s: ServerIncome): Income {
  return {
    id: s.id, date: s.date, desc: s.description, amount: s.amount,
    category: s.category, notes: s.notes || '', createdAt: s.created_at,
  };
}

function syncUpdatedIncome(id: string) { enqueueChange('incomes', id, 'update'); }
function syncDeletedIncome(id: string) { enqueueChange('incomes', id, 'delete'); }

/* ===== GOALS ===== */
interface GoalInput {
  name: string; targetAmount: number; currentAmount?: number;
  deadline?: string; category?: string; notes?: string;
}

export function addGoal(input: GoalInput): Goal | null {
  if (blockedInDemo()) return null;
  const data = loadData();
  const goal: Goal = {
    id: genId(), name: input.name, targetAmount: input.targetAmount,
    currentAmount: input.currentAmount || 0, deadline: input.deadline || '',
    category: input.category || '', notes: input.notes || '',
    createdAt: new Date().toISOString(),
  };
  data.goals.push(goal);
  saveData(data);
  syncNewGoal(goal);
  return goal;
}

export function updateGoal(id: string, updates: Partial<GoalInput & { currentAmount?: number }>) {
  if (blockedInDemo()) return;
  const data = loadData();
  const idx = data.goals.findIndex(g => g.id === id);
  if (idx === -1) return;
  data.goals[idx] = { ...data.goals[idx], ...updates };
  saveData(data);
  syncUpdatedGoal(id);
}

export function deleteGoal(id: string) {
  if (blockedInDemo()) return;
  const data = loadData();
  data.goals = data.goals.filter(g => g.id !== id);
  saveData(data);
  syncDeletedGoal(id);
}

/* ===== SYNC GOALS CON BACKEND ===== */

function toServerGoal(g: Goal): GoalCreateBody {
  return {
    name: g.name, target_amount: g.targetAmount, current_amount: g.currentAmount,
    deadline: g.deadline || null, category: g.category, notes: g.notes,
  };
}

function fromServerGoal(s: ServerGoal): Goal {
  return {
    id: s.id, name: s.name, targetAmount: s.target_amount, currentAmount: s.current_amount,
    deadline: s.deadline || '', category: s.category, notes: s.notes || '',
    createdAt: s.created_at,
  };
}

function syncNewGoal(goal: Goal) {
  apiCreateGoal(toServerGoal(goal))
    .then(srv => {
      if (srv && srv.id && srv.id !== goal.id) adoptServerId('goals', goal.id, srv.id);
    })
    .catch(() => syncError('sync.addGoal'));
}

function syncUpdatedGoal(id: string) {
  const data = loadData();
  const g = data.goals.find(x => x.id === id);
  if (!g) return;
  if (isServerId(id)) {
    apiUpdateGoal(id, toServerGoal(g)).catch(err => {
      if (!String(err?.message || '').includes('not found')) syncError('sync.updGoal');
    });
  } else {
    syncNewGoal(g);
  }
}

function syncDeletedGoal(id: string) {
  if (!isServerId(id)) return;
  apiDeleteGoal(id).catch(err => {
    if (!String(err?.message || '').includes('not found')) syncError('sync.delGoal');
  });
}

/* ===== SUBSCRIPTIONS ===== */
interface SubscriptionInput {
  name: string; amount: number;
  billingCycle: 'monthly' | 'yearly' | 'weekly' | 'quarterly';
  nextBilling: string; category?: string; metodo?: string;
  active?: boolean; autoCharge?: boolean; notes?: string;
}

export function addSubscription(input: SubscriptionInput): Subscription | null {
  if (blockedInDemo()) return null;
  const data = loadData();
  const sub: Subscription = {
    id: genId(), name: input.name, amount: input.amount,
    billingCycle: input.billingCycle, nextBilling: input.nextBilling,
    category: input.category || '', metodo: input.metodo || 'Tarjeta',
    active: input.active ?? true, autoCharge: input.autoCharge ?? false, notes: input.notes || '',
    createdAt: new Date().toISOString(),
  };
  data.subscriptions.push(sub);
  saveData(data);
  syncNewSubscription(sub);
  return sub;
}

export function updateSubscription(id: string, updates: Partial<SubscriptionInput>) {
  if (blockedInDemo()) return;
  const data = loadData();
  const idx = data.subscriptions.findIndex(s => s.id === id);
  if (idx === -1) return;
  data.subscriptions[idx] = { ...data.subscriptions[idx], ...updates };
  saveData(data);
  syncUpdatedSubscription(id);
}

export function deleteSubscription(id: string) {
  if (blockedInDemo()) return;
  const data = loadData();
  data.subscriptions = data.subscriptions.filter(s => s.id !== id);
  saveData(data);
  syncDeletedSubscription(id);
}

export function advanceSubscription(sub: Subscription): Subscription {
  if (blockedInDemo()) return sub;
  const next = new Date(sub.nextBilling + 'T12:00:00');
  switch (sub.billingCycle) {
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'monthly': next.setMonth(next.getMonth() + 1); break;
    case 'quarterly': next.setMonth(next.getMonth() + 3); break;
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
  }
  const updated = { ...sub, nextBilling: next.toISOString().slice(0, 10) };
  updateSubscription(sub.id, { nextBilling: updated.nextBilling });
  return updated;
}

/* ===== SYNC SUBSCRIPTIONS CON BACKEND ===== */

function toServerSubscription(s: Subscription): SubscriptionCreateBody {
  return {
    name: s.name, amount: s.amount, billing_cycle: s.billingCycle,
    next_billing: s.nextBilling, category: s.category,
    method: s.metodo, notes: s.notes, active: s.active, auto_charge: s.autoCharge,
  };
}

function fromServerSubscription(s: ServerSubscription): Subscription {
  return {
    id: s.id, name: s.name, amount: s.amount,
    billingCycle: (s.billing_cycle || 'monthly') as Subscription['billingCycle'],
    nextBilling: s.next_billing, category: s.category,
    metodo: s.method || 'Tarjeta', active: s.active, autoCharge: !!s.auto_charge,
    notes: s.notes || '', createdAt: s.created_at,
  };
}

function syncNewSubscription(sub: Subscription) {
  apiCreateSubscription(toServerSubscription(sub))
    .then(srv => {
      if (srv && srv.id && srv.id !== sub.id) adoptServerId('subscriptions', sub.id, srv.id);
    })
    .catch(() => syncError('sync.addSub'));
}

function syncUpdatedSubscription(id: string) {
  const data = loadData();
  const s = data.subscriptions.find(x => x.id === id);
  if (!s) return;
  if (isServerId(id)) {
    apiUpdateSubscription(id, toServerSubscription(s)).catch(err => {
      if (!String(err?.message || '').includes('not found')) syncError('sync.updSub');
    });
  } else {
    syncNewSubscription(s);
  }
}

function syncDeletedSubscription(id: string) {
  if (!isServerId(id)) return;
  apiDeleteSubscription(id).catch(err => {
    if (!String(err?.message || '').includes('not found')) syncError('sync.delSub');
  });
}

/* ===== PROJECTS ===== */

function toServerProject(p: Project): ProjectCreateBody {
  return { name: p.name, budget: p.budget || null };
}

function fromServerProject(s: ServerProject): Project {
  return { id: s.id, name: s.name, budget: s.budget || undefined, createdAt: s.created_at };
}

export function addProject(name: string, budget?: number): Project | null {
  if (blockedInDemo()) return null;
  const data = loadData();
  const project: Project = { id: genId(), name, budget: budget || undefined, createdAt: new Date().toISOString() };
  data.projects.push(project);
  saveData(data);
  apiCreateProject(toServerProject(project))
    .then(srv => {
      if (srv && srv.id && srv.id !== project.id) adoptServerId('projects', project.id, srv.id);
    })
    .catch(() => syncError('sync.addProject'));
  return project;
}

export function updateProject(id: string, name: string, budget?: number) {
  if (blockedInDemo()) return;
  const data = loadData();
  const p = data.projects.find(x => x.id === id);
  if (!p) return;
  p.name = name;
  p.budget = budget || undefined;
  saveData(data);
  if (isServerId(id)) {
    apiUpdateProject(id, { name, budget: budget || null }).catch(err => {
      if (!String(err?.message || '').includes('not found')) syncError('sync.updProject');
    });
  } else {
    addProject(name, budget); // id temporal: reintentar como alta
    data.projects = data.projects.filter(x => x.id !== id);
    saveData(data);
  }
}

export function deleteProject(id: string) {
  if (blockedInDemo()) return;
  const data = loadData();
  // Desvincular los gastos que apuntaban al proyecto
  const affected = data.expenses.filter(e => e.proyectoId === id).map(e => e.id);
  if (affected.length > 0) {
    data.expenses.forEach(e => { if (e.proyectoId === id) e.proyectoId = ''; });
    saveData(data);
    affected.forEach(syncUpdatedExpense);
  }
  data.projects = data.projects.filter(p => p.id !== id);
  saveData(data);
  if (isServerId(id)) {
    apiDeleteProject(id).catch(err => {
      if (!String(err?.message || '').includes('not found')) syncError('sync.delProject');
    });
  }
}

/* ===== HELPERS DE SYNC ===== */

/** Sustituye el id temporal local por el uuid real del servidor tras un create. */
function adoptServerId(kind: 'expenses' | 'incomes' | 'goals' | 'subscriptions' | 'projects', localId: string, serverId: string) {
  const d = loadData();
  const list = d[kind];
  const i = list.findIndex(x => x.id === localId);
  if (i >= 0) {
    (list[i] as { id: string }).id = serverId;
    saveData(d);
  }
}

type ListKind = 'expenses' | 'incomes' | 'goals' | 'subscriptions' | 'projects';

function reconcileRows<L extends { id: string }, S extends { id: string; client_id?: string | null }>(
  kind: 'expenses' | 'incomes', remote: S[], fromServer: (row: S) => L,
): L[] {
  const d = loadData();
  const ops = readOperations().filter(op => op.kind === kind);
  const tombstones = new Set(deletedIds());
  const local = d[kind] as unknown as L[];
  const server = remote.filter(row => !tombstones.has(row.id)).map(row => {
    const created = ops.find(op => op.action === 'create' && op.clientId === row.client_id);
    if (created) {
      adoptedIds.add(row.id);
      const original = local.find(item => item.id === created.localId);
      const pending = readOperations().filter(op => op.kind !== kind || op.localId !== created.localId || op.action !== 'create');
      const follow = pending.find(op => op.kind === kind && op.localId === created.localId);
      if (follow) { follow.serverId = row.id; follow.localId = row.id; }
      saveOperations(pending);
      if (original) return { ...original, id: row.id };
    }
    const edited = ops.find(op => op.action === 'update' && (op.localId === row.id || op.serverId === row.id));
    return (edited && local.find(item => item.id === edited.localId)) || fromServer(row);
  });
  for (const op of ops) {
    if (op.action !== 'create') continue;
    if (remote.some(row => row.client_id === op.clientId)) continue;
    const item = local.find(x => x.id === op.localId);
    if (item) server.push(item);
  }
  return server.filter(item => !tombstones.has(item.id) && !ops.some(op => op.action === 'delete' && (op.localId === item.id || op.serverId === item.id)));
}

async function loadKindFromServer<L extends { id: string }, S extends { id: string; client_id?: string | null }>(
  kind: ListKind,
  apiList: () => Promise<S[]>,
  apiCreate: (body: any) => Promise<S>,
  toServer: (l: L) => any,
  fromServer: (s: S) => L,
  label: string,
): Promise<boolean> {
  try {
    const list = await apiList();
    const d = loadData();
    const local = d[kind] as unknown as L[];
    if (kind === 'incomes' && list.length === 0 && local.length > 0 && !readOperations().some(op => op.kind === 'incomes')) {
      // Migración: el servidor está vacío para esta entidad pero el navegador
      // tiene datos locales → subirlos (una vez) para no perderlos.
      const pushed: L[] = [];
      for (const item of local) {
        try {
          const srv = await apiCreate(toServer(item));
          pushed.push(srv ? fromServer(srv) : item);
        } catch (e) {
          console.warn(`[sync] no se pudo subir ${label} local:`, e);
          pushed.push(item);
        }
      }
      (d as any)[kind] = pushed;
      saveData(d);
      return true;
    }
    (d as any)[kind] = kind === 'incomes'
      ? reconcileRows('incomes', list as unknown as ServerIncome[], fromServer as unknown as (row: ServerIncome) => Income)
      : list.map(fromServer);
    saveData(d);
    return true;
  } catch (e) {
    console.warn(`[sync] carga inicial de ${label} desde servidor falló:`, e);
    return false;
  }
}

/**
 * Carga TODAS las entidades desde el servidor al entrar con sesión
 * (fuente de verdad = backend, multi-dispositivo). Los gastos se sustituyen
 * directamente (ya sincronizados); para ingresos/metas/suscripciones, si el
 * servidor está vacío y hay datos locales se suben primero (migración única).
 */
export async function loadAllFromServer(): Promise<boolean> {
  let ok = true;
  try {
    const expenses = await apiListExpenses();
    const d = loadData();
    d.expenses = reconcileRows('expenses', expenses, fromServerExpense);
    saveData(d);
  } catch (e) {
    console.warn('[sync] carga inicial de gastos desde servidor falló:', e);
    ok = false;
  }
  ok = (await loadKindFromServer<Income, ServerIncome>(
    'incomes', apiListIncomes, apiCreateIncome, toServerIncome, fromServerIncome, 'ingresos')) && ok;
  ok = (await loadKindFromServer<Goal, ServerGoal>(
    'goals', apiListGoals, apiCreateGoal, toServerGoal, fromServerGoal, 'metas')) && ok;
  ok = (await loadKindFromServer<Subscription, ServerSubscription>(
    'subscriptions', apiListSubscriptions, apiCreateSubscription, toServerSubscription, fromServerSubscription, 'suscripciones')) && ok;
  ok = (await loadKindFromServer<Project, ServerProject>(
    'projects', apiListProjects, apiCreateProject, toServerProject, fromServerProject, 'proyectos')) && ok;
  await refreshCategories();
  return ok;
}

/** Compatibilidad: la carga completa al entrar (sustituye a loadExpensesFromServer). */
export async function loadExpensesFromServer(): Promise<boolean> {
  return loadAllFromServer();
}
