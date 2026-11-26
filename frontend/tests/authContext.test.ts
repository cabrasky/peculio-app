// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/i18n', () => ({ tNow: (key: string) => key }));
import { AuthProvider, useAuth } from '../src/AuthContext';
const alice = { id: 'alice', email: 'a@example.test', name: 'Alice' };
const bob = { id: 'bob', email: 'b@example.test', name: 'Bob' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const mount = () => renderHook(() => useAuth(), { wrapper: ({ children }) => React.createElement(AuthProvider, null, children) });
beforeEach(() => { localStorage.clear(); vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('HttpOnly browser authentication', () => {
  it('refreshes through cookies without a JavaScript JWT', async () => {
    const fetch = vi.fn().mockResolvedValue(response(alice)); vi.stubGlobal('fetch', fetch);
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe('alice');
    expect(fetch.mock.calls[0][1].credentials).toBe('include');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });
  it.each([503, 0])('retains offline data on transient failure %s', async status => {
    localStorage.setItem('gastos_user', JSON.stringify(alice));
    localStorage.setItem('gastos_app_data', 'pending');
    vi.stubGlobal('fetch', status ? vi.fn().mockResolvedValue(response({}, status)) : vi.fn().mockRejectedValue(new TypeError('offline')));
    const { result } = mount();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe('alice');
    expect(result.current.connectionIssue).toBe(true);
    expect(localStorage.getItem('gastos_app_data')).toBe('pending');
  });
  it('hides expired account data, retains pending work until same-account reauth', async () => {
    localStorage.setItem('gastos_user', JSON.stringify(alice));
    localStorage.setItem('gastos_data_owner', alice.id);
    localStorage.setItem('gastos_app_data', 'pending');
    localStorage.setItem('gastos_sync_queue_v1', '{"operations":[{"kind":"expenses"}]}');
    const fetch = vi.fn().mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({ token: '', user: alice }));
    vi.stubGlobal('fetch', fetch);
    const { result } = mount(); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    await act(async () => { await result.current.login('a@example.test', 'test-only'); });
    expect(localStorage.getItem('gastos_app_data')).toBe('pending');
    expect(localStorage.getItem('gastos_sync_queue_v1')).not.toBeNull();
    expect(localStorage.getItem('gastos_token')).toBeNull();
  });
  it('cleans the previous account cache before accepting another account', async () => {
    localStorage.setItem('gastos_user', JSON.stringify(alice)); localStorage.setItem('gastos_data_owner', alice.id);
    localStorage.setItem('gastos_app_data', 'private');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(alice)).mockResolvedValueOnce(response({ token: '', user: bob })));
    const { result } = mount(); await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.login('b@example.test', 'test-only'); });
    expect(result.current.user?.id).toBe('bob'); expect(localStorage.getItem('gastos_app_data')).toBeNull();
  });
  it('logs out on the server and clears local account data', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(alice)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const { result } = mount(); await waitFor(() => expect(result.current.loading).toBe(false));
    localStorage.setItem('gastos_app_data', 'private');
    await act(async () => { await result.current.logout(); });
    expect(fetch.mock.calls[1][0]).toBe('/api/auth/logout');
    expect(result.current.user).toBeNull(); expect(localStorage.getItem('gastos_app_data')).toBeNull();
  });
  it('waits for an in-flight logout before creating another login cookie', async () => {
    let finishLogout!: (value: Response) => void;
    const inFlight = new Promise<Response>(resolve => { finishLogout = resolve; });
    const fetch = vi.fn().mockResolvedValueOnce(response(alice)).mockReturnValueOnce(inFlight).mockResolvedValueOnce(response({ token: '', user: bob }));
    vi.stubGlobal('fetch', fetch);
    const { result } = mount(); await waitFor(() => expect(result.current.loading).toBe(false));
    let out!: Promise<void>;
    let log!: Promise<void>;
    act(() => { out = result.current.logout(); log = result.current.login('b@example.test', 'test-only'); });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => { finishLogout(new Response(null, { status: 204 })); await out; await log; });
    expect(fetch.mock.calls[2][0]).toBe('/api/auth/login');
    expect(result.current.user?.id).toBe('bob');
  });
  it('never shows cached account after an interrupted offline logout', async () => {
    localStorage.setItem('peculio_logout_pending', '1');
    localStorage.setItem('gastos_user', JSON.stringify(alice));
    localStorage.setItem('gastos_app_data', 'private');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const { result } = mount(); await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('gastos_app_data')).toBeNull();
    expect(localStorage.getItem('peculio_logout_pending')).toBe('1');
  });
  it('does not resurrect a cookie session after an offline logout and reload', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(alice)).mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    const first = mount(); await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => { await first.result.current.logout(); }); first.unmount();
    fetch.mockReset().mockResolvedValue(response(alice));
    const second = mount(); await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.user).toBeNull();
    expect(fetch.mock.calls.every(call => call[0] !== '/api/auth/me')).toBe(true);
  });
});
