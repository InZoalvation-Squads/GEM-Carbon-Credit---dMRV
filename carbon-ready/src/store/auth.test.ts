import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from './index';
import { SESSION_KEY, getSession } from '../lib/server-api';

describe('auth — mock login mapped to Guardian roles', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().logout();
  });

  it('logs in a demo account and adopts its role', async () => {
    const res = await useStore.getState().login('vvb@gem.demo', 'demo1234');
    expect(res.ok).toBe(true);
    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().currentUser.role).toBe('verifier');
    expect(useStore.getState().currentUser.email).toBe('vvb@gem.demo');
  });

  it('maps the registry account to the admin (Standard Registry) role', async () => {
    const res = await useStore.getState().login('registry@gem.demo', 'demo1234');
    expect(res.ok).toBe(true);
    expect(useStore.getState().currentUser.role).toBe('admin');
  });

  it('rejects a wrong password', async () => {
    const res = await useStore.getState().login('vvb@gem.demo', 'nope');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('rejects an unknown email', async () => {
    const res = await useStore.getState().login('ghost@gem.demo', 'demo1234');
    expect(res.ok).toBe(false);
    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('logout clears authentication', async () => {
    await useStore.getState().login('proponent@gem.demo', 'demo1234');
    useStore.getState().logout();
    expect(useStore.getState().isAuthenticated).toBe(false);
  });
});

describe('auth — register', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ registeredAccounts: [], isAuthenticated: false });
  });

  it('registers a new account and auto-logs in with the chosen role', async () => {
    const res = await useStore.getState().register({ name: 'Nok T.', email: 'nok@gem.demo', role: 'verifier', password: 'secret123' });
    expect(res.ok).toBe(true);
    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().currentUser.email).toBe('nok@gem.demo');
    expect(useStore.getState().currentUser.role).toBe('verifier');
  });

  it('rejects an email already used by a demo account (case-insensitive)', async () => {
    const res = await useStore.getState().register({ name: 'X', email: 'VVB@gem.demo', role: 'project_owner', password: 'secret123' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already exists/i);
    expect(useStore.getState().isAuthenticated).toBe(false);
  });

  it('rejects an email that was already registered', async () => {
    await useStore.getState().register({ name: 'Nok T.', email: 'nok@gem.demo', role: 'verifier', password: 'secret123' });
    const res = await useStore.getState().register({ name: 'Other', email: 'nok@gem.demo', role: 'admin', password: 'other456' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/already exists/i);
  });

  it('logs in with a registered account using its own password', async () => {
    await useStore.getState().register({ name: 'Nok T.', email: 'nok@gem.demo', role: 'esg_manager', password: 'secret123' });
    useStore.getState().logout();
    const res = await useStore.getState().login('nok@gem.demo', 'secret123');
    expect(res.ok).toBe(true);
    expect(useStore.getState().currentUser.role).toBe('esg_manager');
  });

  it('rejects a wrong password for a registered account', async () => {
    await useStore.getState().register({ name: 'Nok T.', email: 'nok@gem.demo', role: 'verifier', password: 'secret123' });
    useStore.getState().logout();
    const res = await useStore.getState().login('nok@gem.demo', 'demo1234');
    expect(res.ok).toBe(false);
    expect(useStore.getState().isAuthenticated).toBe(false);
  });
});

describe('auth — server mode (VITE_API_BASE_URL set, mocked fetch)', () => {
  const serverUser = {
    id: 'usr-srv-1',
    organization_id: 'org-1',
    email: 'owner@rocks.dev',
    name: 'Own Er',
    role: 'project_owner' as const,
    created_at: '2026-07-01T00:00:00Z',
  };

  beforeEach(() => {
    localStorage.clear();
    // Task 2 wired real bulk-GET hydration into login/register; these tests
    // cover the auth exchange only (exact fetch-call counts), so hydration is
    // stubbed out here — it has its own suite in src/store/hydrate.test.ts.
    useStore.setState({ isAuthenticated: false, hydrateFromServer: async () => {} });
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('login sets currentUser from the server response and persists the token pair', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: serverUser, access_token: 'acc-1', refresh_token: 'ref-1',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await useStore.getState().login('Owner@rocks.dev', 'secret123');

    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/login');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'owner@rocks.dev', password: 'secret123' });
    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(useStore.getState().currentUser).toEqual({
      id: 'usr-srv-1', email: 'owner@rocks.dev', name: 'Own Er', role: 'project_owner', created_at: '2026-07-01T00:00:00Z',
    });
    expect(getSession()).toEqual({ access_token: 'acc-1', refresh_token: 'ref-1' });
  });

  it('login surfaces the server error message and stays signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
    }), { status: 401, headers: { 'content-type': 'application/json' } })));

    const res = await useStore.getState().login('owner@rocks.dev', 'wrong');

    expect(res).toEqual({ ok: false, error: 'Invalid email or password' });
    expect(useStore.getState().isAuthenticated).toBe(false);
    expect(getSession()).toBeNull();
  });

  it('register posts to the server, signs in and persists tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      user: serverUser, access_token: 'acc-2', refresh_token: 'ref-2',
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await useStore.getState().register({ name: 'Own Er', email: 'owner@rocks.dev', role: 'project_owner', password: 'secret123' });

    expect(res.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/register');
    expect(useStore.getState().isAuthenticated).toBe(true);
    expect(getSession()).toEqual({ access_token: 'acc-2', refresh_token: 'ref-2' });
  });

  it('register refuses the admin role locally without calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await useStore.getState().register({ name: 'X', email: 'x@rocks.dev', role: 'admin', password: 'secret123' });

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/admin/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logout fires the server revoke and clears the stored session', async () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ access_token: 'acc-1', refresh_token: 'ref-1' }));
    useStore.setState({ isAuthenticated: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    useStore.getState().logout();

    expect(useStore.getState().isAuthenticated).toBe(false);
    await vi.waitFor(() => expect(getSession()).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/v1/auth/logout');
  });
});
