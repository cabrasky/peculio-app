/* ── API service for gastos-app backend ─────────────────────────────────────── */
import { tNow } from './i18n';

export const BASE = import.meta.env.VITE_API_URL || '/api';

/* ── Token helpers ─────────────────────────────────────────────────────────── */

export function getToken(): string | null {
  return localStorage.getItem('gastos_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('gastos_token', token);
  else localStorage.removeItem('gastos_token');
}

export function getStoredUser(): any | null {
  try {
    const raw = localStorage.getItem('gastos_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setStoredUser(user: any | null) {
  if (user) localStorage.setItem('gastos_user', JSON.stringify(user));
  else localStorage.removeItem('gastos_user');
}

/* ── Generic request ───────────────────────────────────────────────────────── */

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function request<T>(method: string, path: string, body?: unknown, auth = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = typeof err.detail === 'string' ? err.detail : 'Request failed';
    throw new ApiError(detail, res.status, err.error_code, err.request_id || res.headers.get('X-Request-ID') || undefined);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* ── Auth API ──────────────────────────────────────────────────────────────── */

// Preferencias de la cuenta (compartidas con la app móvil)
export interface AccountPreferences {
  locale: '' | 'es' | 'en' | 'pt';   // '' = aún sin elegir
  theme: '' | 'system' | 'light' | 'dark';
  weekly_goal: number | null;
  weekly_excluded: string[] | null; // null = aún sin elegir
  setup_done: boolean;
  mobile_tour_done: boolean;
}

export interface AuthResponse {
  token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
    is_admin: boolean;
    is_developer: boolean;
    is_demo?: boolean;
  } & Partial<AccountPreferences>;
}

export async function register(email: string, password: string, name: string): Promise<AuthResponse> {
  return request<AuthResponse>('POST', '/auth/register', { email, password, name });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('POST', '/auth/login', { email, password });
}

/** Elimina la cuenta y TODOS sus datos (se confirma escribiendo el propio email). */
export async function deleteAccount(confirmEmail: string): Promise<void> {
  await request<void>('DELETE', '/auth/me', { confirm_email: confirmEmail }, true);
}

/** Entra con la cuenta demo pública (solo lectura, datos de ejemplo). */
export async function demoLogin(): Promise<AuthResponse> {
  return request<AuthResponse>('POST', '/auth/demo');
}

export async function getMe(): Promise<AuthResponse['user']> {
  // Backend /auth/me returns the user object directly (UserOut), not wrapped in {user: ...}
  return request('GET', '/auth/me', undefined, true);
}

export function getGoogleAuthUrl(): string {
  return `${BASE}/auth/google`;
}

/* ── Password Recovery ─────────────────────────────────────────────────────── */

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return request('POST', '/auth/forgot-password', { email });
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return request('POST', '/auth/reset-password', { token, password });
}

/* ── Admin API ─────────────────────────────────────────────────────────────── */

export interface OAuthConfig {
  provider: string;
  client_id: string;
  client_secret?: string;
  redirect_uri: string;
  enabled: boolean;
}

export async function getOAuthConfig(): Promise<{ configs: OAuthConfig[] }> {
  return request('GET', '/auth/admin/oauth', undefined, true);
}

export async function updateOAuthConfig(config: {
  provider: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  enabled: boolean;
}): Promise<{ status: string }> {
  return request('PUT', '/auth/admin/oauth', config, true);
}

/* ── SMTP Admin ──────────────────────────────────────────────────────────────── */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  from_email: string;
  from_name: string;
  password_set: boolean;
}

export async function getSmtpConfig(): Promise<SmtpConfig> {
  return request('GET', '/auth/admin/smtp', undefined, true);
}

export interface SmtpConfigInput {
  host: string;
  port: number;
  user: string;
  password: string;
  from_email: string;
  from_name: string;
}

export async function updateSmtpConfig(config: SmtpConfigInput): Promise<{ status: string }> {
  return request('PUT', '/auth/admin/smtp', config, true);
}

/** Paso de la prueba SMTP, en el orden en que se hacen. */
export type SmtpStep = 'connect' | 'starttls' | 'auth' | 'sender' | 'send';

/** Resultado de probar el SMTP: se para en el primer paso que falla y dice por qué (`error.code`). */
export interface SmtpTestResult {
  ok: boolean;
  mode: 'tls' | 'starttls' | 'none';
  server: string;
  user: string;
  from_email: string;
  sent_to: string | null;
  steps: { step: SmtpStep; ok: boolean; ms: number | null }[];
  error: { step: SmtpStep; code: string; detail: string } | null;
}

/** Prueba la configuración del formulario sin guardarla (sin contraseña usa la guardada). */
export async function testSmtpConfig(config: SmtpConfigInput & { send?: boolean; to?: string }): Promise<SmtpTestResult> {
  return request('POST', '/auth/admin/smtp/test', config, true);
}

/* ── Expenses API (sync UI ↔ backend, multi-dispositivo) ─────────────────── */

export interface ServerExpense {
  id: string;
  user_id: string;
  date: string;            // YYYY-MM-DD
  description: string;
  amount: number;
  purpose: string;
  motive: string;
  type: string;
  method: string;
  is_shared: boolean;
  is_invitation: boolean;
  debtors: string;
  participants: string;
  cc_reference: string;
  repayment_method: string;
  repaid: boolean;
  personal_share: number;
  trip: string;
  project_id: string;
  has_photo?: boolean;
  created_at: string;
}

export type ExpenseCreateBody = Omit<ServerExpense, 'id' | 'user_id' | 'created_at'>;

export async function apiListExpenses(): Promise<ServerExpense[]> {
  return request<ServerExpense[]>('GET', '/expenses?limit=5000', undefined, true);
}

export async function apiCreateExpense(body: ExpenseCreateBody): Promise<ServerExpense> {
  return request<ServerExpense>('POST', '/expenses', body, true);
}

export async function apiUpdateExpense(id: string, body: Partial<ExpenseCreateBody>): Promise<ServerExpense> {
  return request<ServerExpense>('PUT', `/expenses/${id}`, body, true);
}

export async function apiDeleteExpense(id: string): Promise<void> {
  await request<void>('DELETE', `/expenses/${id}`, undefined, true);
}

/* ── Foto del ticket (multipart + descarga binaria) ──────────────────────────── */

export async function apiUploadExpensePhoto(id: string, file: Blob, filename: string, contentType: string): Promise<void> {
  const form = new FormData();
  form.append('file', new File([file], filename, { type: contentType }));
  const token = getToken();
  const res = await fetch(`${BASE}/expenses/${id}/photo`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || tNow('error.photoUpload'));
  }
}

export async function apiDeleteExpensePhoto(id: string): Promise<void> {
  await request<void>('DELETE', `/expenses/${id}/photo`, undefined, true);
}

/** La foto exige Bearer → fetch con header + createObjectURL (no <img src=…token>). */
export async function fetchExpensePhotoUrl(id: string): Promise<{ url: string; revoke: () => void }> {
  const token = getToken();
  const res = await fetch(`${BASE}/expenses/${id}/photo`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(tNow('error.photoLoad'));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/* ── Projects API (proyectos a los que enlazar gastos) ───────────────────── */

export interface ServerProject {
  id: string;
  user_id: string;
  name: string;
  budget?: number | null;
  created_at: string;
}

export type ProjectCreateBody = Omit<ServerProject, 'id' | 'user_id' | 'created_at'>;

export async function apiListProjects(): Promise<ServerProject[]> {
  return request<ServerProject[]>('GET', '/projects', undefined, true);
}
export async function apiCreateProject(body: ProjectCreateBody): Promise<ServerProject> {
  return request<ServerProject>('POST', '/projects', body, true);
}
export async function apiUpdateProject(id: string, body: Partial<ProjectCreateBody>): Promise<ServerProject> {
  return request<ServerProject>('PUT', `/projects/${id}`, body, true);
}
export async function apiDeleteProject(id: string): Promise<void> {
  await request<void>('DELETE', `/projects/${id}`, undefined, true);
}

/* ── Incomes API (sync UI ↔ backend) ─────────────────────────────────────── */

export interface ServerIncome {
  id: string;
  user_id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  notes: string;
  created_at: string;
}

export type IncomeCreateBody = Omit<ServerIncome, 'id' | 'user_id' | 'created_at'>;

export async function apiListIncomes(): Promise<ServerIncome[]> {
  return request<ServerIncome[]>('GET', '/incomes?limit=5000', undefined, true);
}
export async function apiCreateIncome(body: IncomeCreateBody): Promise<ServerIncome> {
  return request<ServerIncome>('POST', '/incomes', body, true);
}
export async function apiUpdateIncome(id: string, body: Partial<IncomeCreateBody>): Promise<ServerIncome> {
  return request<ServerIncome>('PUT', `/incomes/${id}`, body, true);
}
export async function apiDeleteIncome(id: string): Promise<void> {
  await request<void>('DELETE', `/incomes/${id}`, undefined, true);
}

/* ── Goals API (sync UI ↔ backend) ───────────────────────────────────────── */

export interface ServerGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  category: string;
  notes: string;
  created_at: string;
}

export type GoalCreateBody = Omit<ServerGoal, 'id' | 'user_id' | 'created_at'>;

export async function apiListGoals(): Promise<ServerGoal[]> {
  return request<ServerGoal[]>('GET', '/goals?limit=5000', undefined, true);
}
export async function apiCreateGoal(body: GoalCreateBody): Promise<ServerGoal> {
  return request<ServerGoal>('POST', '/goals', body, true);
}
export async function apiUpdateGoal(id: string, body: Partial<GoalCreateBody>): Promise<ServerGoal> {
  return request<ServerGoal>('PUT', `/goals/${id}`, body, true);
}
export async function apiDeleteGoal(id: string): Promise<void> {
  await request<void>('DELETE', `/goals/${id}`, undefined, true);
}

/* ── Subscriptions API (sync UI ↔ backend) ───────────────────────────────── */

export interface ServerSubscription {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  billing_cycle: string; // weekly | monthly | quarterly | yearly
  next_billing: string;
  category: string;
  method: string;
  notes: string;
  active: boolean;
  auto_charge?: boolean;
  created_at: string;
}

export type SubscriptionCreateBody = Omit<ServerSubscription, 'id' | 'user_id' | 'created_at'>;

export async function apiListSubscriptions(): Promise<ServerSubscription[]> {
  return request<ServerSubscription[]>('GET', '/subscriptions?limit=5000', undefined, true);
}
export async function apiCreateSubscription(body: SubscriptionCreateBody): Promise<ServerSubscription> {
  return request<ServerSubscription>('POST', '/subscriptions', body, true);
}
export async function apiUpdateSubscription(id: string, body: Partial<SubscriptionCreateBody>): Promise<ServerSubscription> {
  return request<ServerSubscription>('PUT', `/subscriptions/${id}`, body, true);
}
export async function apiDeleteSubscription(id: string): Promise<void> {
  await request<void>('DELETE', `/subscriptions/${id}`, undefined, true);
}

/* ── Profile (editar mi usuario) ─────────────────────────────────────────── */

export async function updateMe(body: { name?: string; avatar_url?: string }): Promise<AuthResponse['user']> {
  return request<AuthResponse['user']>('PUT', '/auth/me', body, true);
}

export async function updatePreferences(body: Partial<AccountPreferences>): Promise<AuthResponse['user']> {
  return request<AuthResponse['user']>('PUT', '/auth/me/preferences', body, true);
}

export async function changePassword(current_password: string, new_password: string): Promise<{ message: string }> {
  return request('PUT', '/auth/me/password', { current_password, new_password }, true);
}

/* ── Categorías propias (gastos/ingresos) ────────────────────────────────── */
export interface ServerCategory { id: string; kind: 'expense' | 'income'; name: string; color: string; created_at: string; }

export async function apiListCategories(kind?: 'expense' | 'income'): Promise<ServerCategory[]> {
  const q = kind ? `?kind=${kind}` : '';
  return request<ServerCategory[]>('GET', `/categories${q}`, undefined, true);
}
export async function apiCreateCategory(body: { kind: string; name: string }): Promise<ServerCategory> {
  return request<ServerCategory>('POST', '/categories', body, true);
}
export async function apiUpdateCategory(id: string, body: { name?: string }): Promise<ServerCategory> {
  return request<ServerCategory>('PUT', `/categories/${id}`, body, true);
}
export async function apiDeleteCategory(id: string): Promise<void> {
  await request<void>('DELETE', `/categories/${id}`, undefined, true);
}

export async function apiSendToCC(id: string): Promise<any> {
  return request('POST', `/expenses/${id}/split`, undefined, true);
}

/* ── Developer / API keys ──────────────────────────────────────────────────── */

export interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export interface ApiKeyCreated {
  id: string;
  name: string;
  prefix: string;
  key: string;
  created_at: string;
}

export async function apiGetDeveloperStatus(): Promise<{ is_developer: boolean }> {
  return request('GET', '/developer', undefined, true);
}

export async function apiToggleDeveloper(): Promise<{ is_developer: boolean }> {
  return request('PUT', '/developer/toggle', {}, true);
}

export async function apiListApiKeys(): Promise<ApiKeyItem[]> {
  return request<ApiKeyItem[]>('GET', '/developer/keys', undefined, true);
}

export async function apiCreateApiKey(name: string): Promise<ApiKeyCreated> {
  return request<ApiKeyCreated>('POST', '/developer/keys', { name }, true);
}

export async function apiRevokeApiKey(id: string): Promise<void> {
  await request<void>('DELETE', `/developer/keys/${id}`, undefined, true);
}
