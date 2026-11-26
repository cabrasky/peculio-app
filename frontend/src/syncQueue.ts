import { ApiError } from './api';

export type SyncKind = 'expenses' | 'incomes';
export type SyncOperation = {
  kind: SyncKind; action: 'create' | 'update' | 'delete'; localId: string;
  clientId: string; serverId?: string; snapshot?: Record<string, unknown>; attempts: number; nextRetry: number;
};
export type SyncStatus = {
  pending: number; errors: number; authRequired: boolean;
  lastError: { kind: 'auth' | 'network' | 'server'; message: string } | null;
};
const KEY = 'gastos_sync_queue_v1';
const TOMBSTONES = 'gastos_sync_deleted_v1';

export function readOperations(): SyncOperation[] {
  try { return (JSON.parse(localStorage.getItem(KEY) || '{}').operations || []) as SyncOperation[]; }
  catch { return []; }
}
export function saveOperations(operations: SyncOperation[]) {
  localStorage.setItem(KEY, JSON.stringify({ operations }));
  window.dispatchEvent(new Event('mb:sync-status'));
}
export function deletedIds(): string[] {
  try { return JSON.parse(localStorage.getItem(TOMBSTONES) || '[]') as string[]; }
  catch { return []; }
}
export function markDeleted(id: string) {
  localStorage.setItem(TOMBSTONES, JSON.stringify([...new Set([...deletedIds(), id])]));
}
export function clearSyncData() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(TOMBSTONES);
  status = { pending: 0, errors: 0, authRequired: false, lastError: null };
}
let status: SyncStatus = { pending: 0, errors: 0, authRequired: false, lastError: null };
export function getSyncStatus(): SyncStatus { return { ...status, pending: readOperations().length }; }
export function recordSyncError(error: unknown, attempts: number): number {
  const auth = error instanceof ApiError && (error.status === 401 || error.status === 403);
  status = {
    ...status, errors: status.errors + 1, authRequired: auth || status.authRequired,
    lastError: { kind: auth ? 'auth' : error instanceof TypeError ? 'network' : 'server', message: error instanceof Error ? error.message : String(error) },
  };
  if (auth) window.dispatchEvent(new Event('mb:auth-required'));
  window.dispatchEvent(new Event('mb:sync-status'));
  return Date.now() + Math.min(300000, 2000 * 2 ** Math.min(attempts, 8));
}
export function resetSyncError() {
  status = { ...status, errors: 0, authRequired: false, lastError: null };
  window.dispatchEvent(new Event('mb:sync-status'));
}
