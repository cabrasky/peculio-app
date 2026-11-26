import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  return {
    ApiError,
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
    deleteExpense: vi.fn(),
    createIncome: vi.fn(),
    updateIncome: vi.fn(),
    deleteIncome: vi.fn(),
    listExpenses: vi.fn(),
    listIncomes: vi.fn(),
    listGoals: vi.fn(),
    listSubscriptions: vi.fn(),
    listProjects: vi.fn(),
    listCategories: vi.fn(),
    dispatched: vi.fn(),
  };
});

vi.mock('../src/api', () => ({
  ApiError: m.ApiError,
  apiCreateExpense: m.createExpense,
  apiUpdateExpense: m.updateExpense,
  apiDeleteExpense: m.deleteExpense,
  apiCreateIncome: m.createIncome,
  apiUpdateIncome: m.updateIncome,
  apiDeleteIncome: m.deleteIncome,
  apiListExpenses: m.listExpenses,
  apiListIncomes: m.listIncomes,
  apiListGoals: m.listGoals,
  apiListSubscriptions: m.listSubscriptions,
  apiListProjects: m.listProjects,
  apiListCategories: m.listCategories,
  apiCreateGoal: vi.fn(), apiCreateSubscription: vi.fn(), apiCreateProject: vi.fn(),
}));
vi.mock('../src/i18n', () => ({ tNow: (key: string) => key }));

class MemoryStorage {
  private items = new Map<string, string>();
  getItem(k: string) { return this.items.get(k) ?? null; }
  setItem(k: string, v: string) { this.items.set(k, String(v)); }
  removeItem(k: string) { this.items.delete(k); }
  clear() { this.items.clear(); }
  key(i: number) { return [...this.items.keys()][i] ?? null; }
  get length() { return this.items.size; }
}

type Kind = 'expense' | 'income';
type Store = typeof import('../src/store');
type Row = Record<string, any>;

let storage: MemoryStorage;
let state: { rows: Row[]; deleted: Set<string>; seq: number };
let dispatched: string[];

const flush = () => new Promise(r => setTimeout(r, 0));

const rowFor = (kind: Kind, body: Row, id: string): Row => kind === 'expense'
  ? {
    id, client_id: body.client_id, user_id: 'u1', date: body.date, description: body.description,
    amount: body.amount, purpose: body.purpose || '', motive: body.motive || '', type: body.type || '',
    method: body.method || '', is_shared: !!body.is_shared, is_invitation: !!body.is_invitation,
    debtors: body.debtors || '', participants: body.participants || '', cc_reference: body.cc_reference || '',
    repayment_method: body.repayment_method || '', repaid: !!body.repaid, personal_share: body.personal_share || 0,
    trip: body.trip || '', project_id: body.project_id || '', has_photo: false, created_at: '2026-01-15T00:00:00Z',
  }
  : {
    id, client_id: body.client_id, user_id: 'u1', date: body.date, description: body.description,
    amount: body.amount, category: body.category || 'Otro', notes: body.notes || '', created_at: '2026-01-15T00:00:00Z',
  };

function fakeServer(kind: Kind) {
  const api = kind === 'expense'
    ? { create: m.createExpense, update: m.updateExpense, remove: m.deleteExpense, list: m.listExpenses }
    : { create: m.createIncome, update: m.updateIncome, remove: m.deleteIncome, list: m.listIncomes };
  api.create.mockImplementation(async (body: Row) => {
    const existing = body.client_id ? state.rows.find(r => r.client_id === body.client_id) : undefined;
    if (existing) return { ...existing };
    const row = rowFor(kind, body, `srv-${kind}-${++state.seq}`);
    state.rows.push(row);
    return { ...row };
  });
  api.update.mockImplementation(async (id: string, body: Row) => {
    const row = state.rows.find(r => r.id === id);
    if (!row) throw new m.ApiError('not found', 404);
    Object.assign(row, body);
    return { ...row };
  });
  api.remove.mockImplementation(async (id: string) => {
    state.deleted.add(id);
    state.rows = state.rows.filter(r => r.id !== id);
  });
  api.list.mockImplementation(async () => state.rows.filter(r => !state.deleted.has(r.id)).map(r => ({ ...r })));
  return api;
}

function ops() {
  const raw = storage.getItem('gastos_sync_queue_v1');
  const parsed = raw ? JSON.parse(raw) : { operations: [] };
  return Array.isArray(parsed) ? parsed : parsed.operations;
}

const h = (kind: Kind) => ({
  add(s: Store) {
    const input = { date: '2026-01-15', desc: 'Cafe', amount: 10 };
    return kind === 'expense' ? s.addExpense(input) : s.addIncome(input);
  },
  update(s: Store, id: string, desc: string) {
    return kind === 'expense' ? s.updateExpense(id, { desc }) : s.updateIncome(id, { desc });
  },
  remove(s: Store, id: string) {
    return kind === 'expense' ? s.deleteExpense(id) : s.deleteIncome(id);
  },
  list(s: Store): Row[] {
    return kind === 'expense' ? s.loadData().expenses : s.loadData().incomes;
  },
  api: () => kind === 'expense'
    ? { create: m.createExpense, update: m.updateExpense, remove: m.deleteExpense, list: m.listExpenses }
    : { create: m.createIncome, update: m.updateIncome, remove: m.deleteIncome, list: m.listIncomes },
});

async function importStore(): Promise<Store> {
  vi.resetModules();
  return import('../src/store');
}

beforeEach(() => {
  vi.clearAllMocks();
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  dispatched = [];
  vi.stubGlobal('window', {
    dispatchEvent: (e: { type: string }) => { dispatched.push(e.type); m.dispatched(e); return true; },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  });
  state = { rows: [], deleted: new Set(), seq: 0 };
  m.listGoals.mockResolvedValue([]);
  m.listExpenses.mockResolvedValue([]);
  m.listIncomes.mockResolvedValue([]);
  m.listSubscriptions.mockResolvedValue([]);
  m.listProjects.mockResolvedValue([]);
  m.listCategories.mockResolvedValue([]);
});

describe.each(['expense', 'income'] as const)('%s queue', kind => {
  it('keeps an offline create after reload and retries it exactly once with its client id', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    api.create.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const item = h(kind).add(s)!;
    await flush();
    expect(ops()).toHaveLength(1);
    const clientId = ops()[0].clientId;
    expect(clientId).toBeTruthy();
    expect(s.getSyncStatus().errors).toBe(1);

    const reloaded = await importStore();
    expect(h(kind).list(reloaded)).toHaveLength(1);
    expect(ops()[0].clientId).toBe(clientId);
    expect(JSON.parse(storage.getItem('gastos_sync_queue_v1')!)).toBeTruthy();

    await reloaded.retryPending(true);
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ client_id: clientId }));
    expect(state.rows).toHaveLength(1);
    expect(h(kind).list(reloaded)).toHaveLength(1);
    expect(h(kind).list(reloaded)[0].id).toBe(`srv-${kind}-1`);
    expect(ops()).toHaveLength(0);
    expect(reloaded.getSyncStatus().pending).toBe(0);
    expect(item.id).toBeTruthy();
  });

  it('does not duplicate on two tabs retrying the same operation', async () => {
    const first = await importStore();
    const api = fakeServer(kind);
    api.create.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    h(kind).add(first);
    await flush();
    const clientId = ops()[0].clientId;
    const second = await importStore();

    await Promise.all([first.retryPending(true), second.retryPending(true)]);
    expect(api.create.mock.calls.every(c => c[0].client_id === clientId)).toBe(true);
    expect(state.rows).toHaveLength(1);
    expect(h(kind).list(first)).toHaveLength(1);
    expect(ops()).toHaveLength(0);
  });

  it('edits an unsent create instead of creating a second row', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    api.create.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const item = h(kind).add(s)!;
    h(kind).update(s, item.id, 'FINAL');
    await flush();
    expect(ops()).toHaveLength(2); // retry original key, then apply the edit if the server had accepted it
    await s.retryPending(true);
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ description: 'FINAL' }));
    expect(state.rows).toHaveLength(1);
    expect(h(kind).list(s)[0].desc).toBe('FINAL');
  });

  it('sends a follow-up update when edited while the create is in flight', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    const realCreate = api.create.getMockImplementation()!;
    let resolve!: () => void;
    api.create.mockImplementationOnce((body: Row) => new Promise(res => {
      resolve = () => res(realCreate(body));
    }));
    const item = h(kind).add(s)!;
    await flush();
    h(kind).update(s, item.id, 'FINAL');
    resolve();
    await s.retryPending();
    await flush();
    expect(api.update).toHaveBeenCalledWith(`srv-${kind}-1`, expect.objectContaining({ description: 'FINAL' }));
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].description).toBe('FINAL');
    expect(h(kind).list(s)).toHaveLength(1);
    expect(h(kind).list(s)[0].id).toBe(`srv-${kind}-1`);
    expect(ops()).toHaveLength(0);
  });

  it('cancels a pending create when the row is deleted locally', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    api.create.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const item = h(kind).add(s)!;
    h(kind).remove(s, item.id);
    await flush(); // the original request may have succeeded even if its response was lost
    await s.retryPending(true); // idempotently resolve the create, then remove it
    expect(api.create).toHaveBeenCalledTimes(2);
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(state.rows).toHaveLength(0);
    expect(h(kind).list(s)).toHaveLength(0);
    expect(ops()).toHaveLength(0);
  });

  it('deletes on the server when deleted while the create is in flight', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    const realCreate = api.create.getMockImplementation()!;
    let resolve!: () => void;
    api.create.mockImplementationOnce((body: Row) => new Promise(res => {
      resolve = () => res(realCreate(body));
    }));
    const item = h(kind).add(s)!;
    await flush();
    h(kind).remove(s, item.id);
    resolve();
    await s.retryPending();
    await flush();
    expect(api.remove).toHaveBeenCalledWith(`srv-${kind}-1`);
    expect(state.rows).toHaveLength(0);
    expect(h(kind).list(s)).toHaveLength(0);
    expect(ops()).toHaveLength(0);
  });

  it('does not resurrect a deleted row on reconciliation', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    h(kind).add(s);
    await s.retryPending(true);
    const id = h(kind).list(s)[0].id;
    h(kind).remove(s, id);
    await s.retryPending(true);
    api.list.mockResolvedValue([rowFor(kind, { date: '2026-01-15', description: 'Cafe', amount: 10 }, id)]);
    await s.loadAllFromServer();
    expect(h(kind).list(s)).toHaveLength(0);
  });

  it('reconciles a create whose response was lost using the server client_id', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    const realCreate = api.create.getMockImplementation()!;
    api.create.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    h(kind).add(s);
    await flush();
    const clientId = ops()[0].clientId;
    const accepted = await realCreate({ date: '2026-01-15', description: 'Cafe', amount: 10, client_id: clientId });
    api.list.mockResolvedValue([accepted]);
    const calls = api.create.mock.calls.length;
    await s.loadAllFromServer();
    expect(h(kind).list(s)).toHaveLength(1);
    expect(h(kind).list(s)[0].id).toBe(accepted.id);
    expect(ops()).toHaveLength(0);
    await s.retryPending(true);
    expect(api.create).toHaveBeenCalledTimes(calls);
  });

  it('keeps local pending edits when a remote load arrives', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    h(kind).add(s);
    await s.retryPending(true);
    const id = h(kind).list(s)[0].id;
    api.update.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    h(kind).update(s, id, 'EDITED');
    await flush();
    api.list.mockResolvedValue([{ ...state.rows[0], description: 'REMOTE' }]);
    await s.loadAllFromServer();
    expect(h(kind).list(s)).toHaveLength(1);
    expect(h(kind).list(s)[0].desc).toBe('EDITED');
    expect(ops()).toHaveLength(1);
  });

  it('classifies 401 as reauthentication, not offline, and pauses retries', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    api.create.mockRejectedValueOnce(new m.ApiError('Invalid or expired token', 401));
    h(kind).add(s);
    await flush();
    expect(s.getSyncStatus().authRequired).toBe(true);
    expect(s.getSyncStatus().lastError?.kind).toBe('auth');
    expect(dispatched).toContain('mb:auth-required');
    const calls = api.create.mock.calls.length;
    await s.retryPending(false);
    expect(api.create).toHaveBeenCalledTimes(calls);
    s.resumeSync();
    await flush();
    expect(api.create).toHaveBeenCalledTimes(calls + 1);
    expect(state.rows).toHaveLength(1);
  });

  it('backs off repeated failures until an explicit retry', async () => {
    const s = await importStore();
    const api = fakeServer(kind);
    api.create.mockRejectedValue(new TypeError('Failed to fetch'));
    h(kind).add(s);
    await flush();
    const calls = api.create.mock.calls.length;
    expect(s.getSyncStatus().errors).toBe(1);
    await s.retryPending(false);
    expect(api.create).toHaveBeenCalledTimes(calls);
    await s.retryPending(true);
    expect(api.create).toHaveBeenCalledTimes(calls + 1);
    expect(ops()[0].attempts).toBe(2);
  });
});
