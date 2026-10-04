/* ── Soporte técnico y panel de admin (uso, usuarios, soporte, sistema, APK) ─ */
import { request, BASE, getToken, type SmtpTestResult } from './api';

/* Soporte (usuario) */

export type TicketStatus = 'open' | 'answered' | 'closed';
export type TicketCategory = 'problem' | 'question' | 'suggestion';

export interface SupportMessage { id: string; author: 'user' | 'admin'; body: string; created_at: string }

export interface SupportTicket {
  id: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  platform: string;
  app_version: string;
  created_at: string;
  updated_at: string;
  messages: SupportMessage[];
  user?: { id: string; name: string; email: string };
  emailed?: boolean;
}

export const supportList = () => request<SupportTicket[]>('GET', '/support', undefined, true);

export const supportCreate = (body: { subject: string; category: TicketCategory; body: string }) =>
  request<SupportTicket>('POST', '/support', { ...body, platform: 'web', app_version: '' }, true);

export const supportReply = (id: string, body: string) =>
  request<SupportTicket>('POST', `/support/${id}/messages`, { body }, true);

/* Panel de admin */

export type RecordKind = 'expenses' | 'incomes' | 'goals' | 'subscriptions' | 'projects';
export const RECORD_KINDS: RecordKind[] = ['expenses', 'incomes', 'goals', 'subscriptions', 'projects'];

export interface AdminStats {
  days: number;
  kpis: {
    users: number; new_7d: number; new_30d: number;
    active_1d: number; active_7d: number; active_30d: number;
    google: number; admins: number; developers: number; suspended: number; mobile: number;
    api_keys_30d: number; photos: number; tickets_open: number; tickets_answered: number;
    records: Record<RecordKind, number>;
  };
  series: ({ day: string; signups: number; users: number } & Record<RecordKind, number>)[];
  last_login: { bucket: 'today' | 'week' | 'month' | 'quarter' | 'older'; users: number }[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  created_at: string;
  last_login: string | null;
  providers: ('email' | 'google')[];
  is_admin: boolean;
  is_developer: boolean;
  suspended_at: string | null;
  is_demo: boolean;
  mobile: boolean;
  counts: Record<RecordKind | 'photos' | 'tickets', number>;
  records: number;
}

export interface AdminUserDetail extends AdminUser {
  locale: string;
  theme: string;
  setup_done: boolean;
  api_keys: { active: number; last_used_at: string | null };
  tickets: { id: string; subject: string; status: TicketStatus; updated_at: string }[];
}

export interface AdminTicketRow {
  id: string; subject: string; category: TicketCategory; status: TicketStatus; platform: string;
  created_at: string; updated_at: string; messages: number; last_author: string; preview: string;
  user: { id: string; name: string; email: string };
}

export interface AdminSystem {
  api: { version: string; python: string; platform: string; host: string; pid: number; started_at: string; now: string };
  database: { ok: boolean; dialect: string; ms: number; size_bytes: number | null; tables: Record<string, number | null> };
  smtp: { host: string; port: number; from: string; configured: boolean };
  google: { enabled: boolean };
  cuentas_claras: { url: string; ok: boolean; status: number | null; ms: number | null; error?: string };
  demo: { enabled: boolean; email: string; seeded_on: string | null };
  errors: {
    last_24h: number; last_7d: number;
    recent: { created_at: string; method: string; path: string; status: number; request_id: string; error_type: string; message: string }[];
  };
}

export const adminStats = (days: number) => request<AdminStats>('GET', `/admin/stats?days=${days}`, undefined, true);

export const adminUsers = (q: string, sort: string) =>
  request<{ total: number; users: AdminUser[] }>('GET', `/admin/users?${new URLSearchParams({ q, sort, limit: '200' })}`, undefined, true);

export const adminUser = (id: string) => request<AdminUserDetail>('GET', `/admin/users/${id}`, undefined, true);

export const adminSetSuspended = (id: string, suspended: boolean) =>
  request<unknown>('POST', `/admin/users/${id}/${suspended ? 'suspend' : 'reactivate'}`, undefined, true);

export const adminSetAdmin = (id: string, isAdmin: boolean) =>
  request<unknown>('PUT', `/admin/users/${id}/admin`, { is_admin: isAdmin }, true);

export const adminPasswordReset = (id: string) => request<unknown>('POST', `/admin/users/${id}/password-reset`, undefined, true);

export const adminDeleteUser = (id: string, confirmEmail: string) =>
  request<void>('DELETE', `/admin/users/${id}`, { confirm_email: confirmEmail }, true);

export const adminTickets = (status: '' | TicketStatus) =>
  request<AdminTicketRow[]>('GET', `/admin/support${status ? `?status=${status}` : ''}`, undefined, true);

export const adminTicket = (id: string) => request<SupportTicket>('GET', `/admin/support/${id}`, undefined, true);

export const adminReply = (id: string, body: string) =>
  request<SupportTicket>('POST', `/admin/support/${id}/reply`, { body }, true);

export const adminSetTicketOpen = (id: string, open: boolean) =>
  request<SupportTicket>('POST', `/admin/support/${id}/${open ? 'reopen' : 'close'}`, undefined, true);

export const adminSystem = () => request<AdminSystem>('GET', '/admin/system', undefined, true);

export const adminTestEmail = () => request<SmtpTestResult>('POST', '/admin/system/test-email', undefined, true);

/* APK de Android: build servida (público) y repositorio de versiones (admin) */

export interface ApkLatest {
  id: string; version: string; version_code: number | null; build_number: string;
  size: number; published_at: string; notes: string; download_url: string;
}

export interface ApkBuild {
  id: string; file: string; version: string; version_code: number | null; build_number: string;
  commit: string; source: 'ci' | 'upload' | 'legacy'; size: number; sha256: string;
  uploaded_at: string; uploaded_by: string; notes: string; downloads: number;
  served: boolean; file_url: string; missing: boolean;
}

export interface ApkRepo {
  served_id: string | null; chunk_bytes: number; max_bytes: number; storage_ok: boolean; builds: ApkBuild[];
}

export const apkLatest = () => request<ApkLatest>('GET', '/apk/latest');
export const apkDownloadUrl = `${BASE}/apk/download`;

export const adminApkRepo = () => request<ApkRepo>('GET', '/admin/apk', undefined, true);

export const adminApkServe = (id: string) => request<ApkBuild>('POST', `/admin/apk/${id}/serve`, undefined, true);

export const adminApkUpdate = (id: string, body: { notes?: string; version_code?: number }) =>
  request<ApkBuild>('PUT', `/admin/apk/${id}`, body, true);

export const adminApkDelete = (id: string) => request<void>('DELETE', `/admin/apk/${id}`, undefined, true);

/** Sube un APK por trozos (por debajo del límite de tamaño del proxy). Si falla, cancela la subida. */
export async function adminApkUpload(
  file: File,
  meta: { version: string; version_code?: number; notes: string },
  serve: boolean,
  onProgress: (sent: number, total: number) => void,
): Promise<ApkBuild> {
  const init = await request<{ id: string; chunk_bytes: number }>('POST', '/admin/apk/uploads',
    { filename: file.name, size: file.size, ...meta }, true);
  try {
    for (let offset = 0; offset < file.size; offset += init.chunk_bytes) {
      const res = await fetch(`${BASE}/admin/apk/uploads/${init.id}?offset=${offset}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/octet-stream' },
        body: file.slice(offset, offset + init.chunk_bytes),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : `Error ${res.status}`);
      }
      onProgress(Math.min(offset + init.chunk_bytes, file.size), file.size);
    }
    return await request<ApkBuild>('POST', `/admin/apk/uploads/${init.id}/complete`, { serve }, true);
  } catch (e) {
    request('DELETE', `/admin/apk/uploads/${init.id}`, undefined, true).catch(() => {});
    throw e;
  }
}
