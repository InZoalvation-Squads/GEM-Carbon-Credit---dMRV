import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  serverMode, apiFetch, authApi, onSessionExpired,
  projectsApi, factorsApi, monitoringApi, methodologiesApi,
  pddsApi, verificationsApi, evidenceApi, credentialsApi, tokensApi,
  getSession, setSession, clearSession,
  ApiError, SessionExpiredError, SESSION_KEY,
} from './server-api';

const BASE = 'http://api.test';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('VITE_API_BASE_URL', BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('serverMode', () => {
  it('is true when VITE_API_BASE_URL is set', () => {
    expect(serverMode()).toBe(true);
  });

  it('is false when VITE_API_BASE_URL is empty', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(serverMode()).toBe(false);
  });
});

describe('session storage', () => {
  it('round-trips the token pair under the versioned key', () => {
    setSession({ access_token: 'a1', refresh_token: 'r1' });
    expect(localStorage.getItem(SESSION_KEY)).toBeTruthy();
    expect(getSession()).toEqual({ access_token: 'a1', refresh_token: 'r1' });
    clearSession();
    expect(getSession()).toBeNull();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('treats corrupt storage as no session', () => {
    localStorage.setItem(SESSION_KEY, 'not-json');
    expect(getSession()).toBeNull();
  });
});

describe('apiFetch', () => {
  it('GETs JSON with a Bearer access token', async () => {
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { hello: 'world' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ hello: string }>('/users/me');

    expect(result).toEqual({ hello: 'world' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/users/me`);
    expect(init.headers.authorization).toBe('Bearer acc-1');
  });

  it('POSTs a JSON body without auth when auth:false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/auth/login', { method: 'POST', body: { email: 'a@b.c', password: 'x' }, auth: false });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBeUndefined();
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.c', password: 'x' });
  });

  it('surfaces the error envelope as ApiError(code, message, status)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(409, { error: { code: 'CONFLICT', message: 'Email already registered' } }),
    ));

    const err = await apiFetch('/auth/register', { method: 'POST', body: {}, auth: false }).catch((e) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Email already registered');
    expect(err.status).toBe(409);
  });

  it('falls back to a generic ApiError when the body is not the envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gateway boom', { status: 502 })));

    const err = await apiFetch('/projects').catch((e) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
    expect(err.code).toBe('UNKNOWN');
  });

  it('on 401: refreshes once with the stored refresh token, retries with the new access token', async () => {
    setSession({ access_token: 'stale', refresh_token: 'ref-old' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'acc-new', refresh_token: 'ref-new' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'usr-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ id: string }>('/users/me');

    expect(result).toEqual({ id: 'usr-1' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // second call is the refresh with the stored refresh token
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1];
    expect(refreshUrl).toBe(`${BASE}/api/v1/auth/refresh`);
    expect(JSON.parse(refreshInit.body)).toEqual({ refresh_token: 'ref-old' });
    // retry carries the rotated access token; rotated pair persisted
    const [, retryInit] = fetchMock.mock.calls[2];
    expect(retryInit.headers.authorization).toBe('Bearer acc-new');
    expect(getSession()).toEqual({ access_token: 'acc-new', refresh_token: 'ref-new' });
  });

  it('when the refresh itself 401s: clears the session and throws SessionExpiredError', async () => {
    setSession({ access_token: 'stale', refresh_token: 'ref-dead' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/users/me')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // original + refresh, no retry
    expect(getSession()).toBeNull();
  });

  it('throws SessionExpiredError on 401 with no stored session (nothing to refresh)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'no token' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch('/users/me')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries at most once — a second 401 after a good refresh surfaces as ApiError, no loop', async () => {
    setSession({ access_token: 'stale', refresh_token: 'ref-old' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'acc-new', refresh_token: 'ref-new' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'still no' } }));
    vi.stubGlobal('fetch', fetchMock);

    const err = await apiFetch('/users/me').catch((e) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('deduplicates concurrent 401s into a single refresh POST', async () => {
    setSession({ access_token: 'stale', refresh_token: 'ref-old' });
    const fetchMock = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return jsonResponse(200, { access_token: 'acc-new', refresh_token: 'ref-new' });
      }
      const bearer = (init.headers as Record<string, string>).authorization;
      if (bearer === 'Bearer stale') {
        return jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } });
      }
      return jsonResponse(200, { ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([
      apiFetch<{ ok: boolean }>('/projects'),
      apiFetch<{ ok: boolean }>('/factors'),
    ]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1); // one rotation shared by both 401s
    expect(getSession()).toEqual({ access_token: 'acc-new', refresh_token: 'ref-new' });
  });
});

describe('authApi', () => {
  const user = {
    id: 'usr-1', organization_id: 'org-1', email: 'a@b.c',
    name: 'A', role: 'project_owner', created_at: '2026-01-01T00:00:00Z',
  };

  it('login stores the token pair and returns the payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { user, access_token: 'acc-1', refresh_token: 'ref-1' }),
    ));

    const payload = await authApi.login('a@b.c', 'secret123');
    expect(payload.user).toEqual(user);
    expect(getSession()).toEqual({ access_token: 'acc-1', refresh_token: 'ref-1' });
  });

  it('register stores the token pair and returns the payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(201, { user, access_token: 'acc-2', refresh_token: 'ref-2' }),
    ));

    const payload = await authApi.register({ name: 'A', email: 'a@b.c', role: 'project_owner', password: 'secret123' });
    expect(payload.user).toEqual(user);
    expect(getSession()).toEqual({ access_token: 'acc-2', refresh_token: 'ref-2' });
  });

  it('login does not store a session when credentials are rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }),
    ));

    const err = await authApi.login('a@b.c', 'nope').catch((e) => e) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Invalid email or password');
    expect(getSession()).toBeNull();
  });

  it('logout clears the session BEFORE the revoke request, then POSTs with the captured token', async () => {
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
    let sessionAtRevokeTime: unknown = 'unset';
    const fetchMock = vi.fn().mockImplementation(async () => {
      sessionAtRevokeTime = getSession(); // race guard: a re-login must never be clobbered
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await authApi.logout();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/auth/logout`);
    expect(init.headers.authorization).toBe('Bearer acc-1');
    expect(sessionAtRevokeTime).toBeNull(); // cleared before the request went out
    expect(getSession()).toBeNull();
  });

  it('logout clears the session even when the server is unreachable', async () => {
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    await authApi.logout().catch(() => {});
    expect(getSession()).toBeNull();
  });

  it('me GETs the current user with auth and unwraps the {user} envelope', async () => {
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { user }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await authApi.me();
    expect(result).toEqual(user);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/users/me`);
  });

  it('refresh rotates and persists the pair', async () => {
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(200, { access_token: 'acc-2', refresh_token: 'ref-2' }),
    ));

    const rotated = await authApi.refresh();
    expect(rotated).toEqual({ access_token: 'acc-2', refresh_token: 'ref-2' });
    expect(getSession()).toEqual({ access_token: 'acc-2', refresh_token: 'ref-2' });
  });

  it('refresh failure clears the session and throws SessionExpiredError', async () => {
    setSession({ access_token: 'acc-1', refresh_token: 'ref-dead' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } }),
    ));

    await expect(authApi.refresh()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(getSession()).toBeNull();
  });
});

describe('onSessionExpired', () => {
  afterEach(() => {
    onSessionExpired(() => {}); // detach test spies from later tests
  });

  it('notifies the registered callback when the refresh flow is dead', async () => {
    setSession({ access_token: 'stale', refresh_token: 'ref-dead' });
    const expired = vi.fn();
    onSessionExpired(expired);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } })));

    await expect(apiFetch('/projects')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getSession()).toBeNull(); // session cleared before the callback ran
  });

  it('is a single registration — a later callback replaces the earlier one', async () => {
    const first = vi.fn();
    const second = vi.fn();
    onSessionExpired(first);
    onSessionExpired(second);
    // 401 with no stored session → nothing to refresh → session expired
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'no token' } }),
    ));

    await expect(apiFetch('/projects')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('data endpoint groups — response envelopes match the server routes', () => {
  beforeEach(() => {
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
  });

  it('projectsApi.list GETs /projects and unwraps {projects}', async () => {
    const projects = [{ id: 'prj-1' }, { id: 'prj-2' }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { projects }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await projectsApi.list()).toEqual(projects);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/projects`);
  });

  it('projectsApi.create POSTs the input and unwraps {project}', async () => {
    const project = { id: 'prj-srv-1', name: 'Plant' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { project }));
    vi.stubGlobal('fetch', fetchMock);

    const input = { name: 'Plant', location: 'Bangkok, Thailand', capacity_kwp: 100, commission_date: '2026-01-01', status: 'draft' as const };
    expect(await projectsApi.create(input)).toEqual(project);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/projects`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it('projectsApi.update PATCHes /projects/:id and unwraps {project}', async () => {
    const project = { id: 'prj-1', name: 'Renamed' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { project }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await projectsApi.update('prj-1', { name: 'Renamed' })).toEqual(project);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/projects/prj-1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Renamed' });
  });

  it('factorsApi unwraps {factors} on list and {factor} on create', async () => {
    const factor = { id: 'ef-srv-1', country: 'TH', source: 'EGAT', version: 3 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { factors: [factor] }))
      .mockResolvedValueOnce(jsonResponse(201, { factor }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await factorsApi.list()).toEqual([factor]);
    expect(await factorsApi.create({ country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.5, effective_date: '2026-01-01' })).toEqual(factor);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/factors`);
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });

  it('monitoringApi.list scopes to the project and appends the optional date range', async () => {
    const records = [{ id: 'mon-1' }];
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { records }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await monitoringApi.list('prj-1')).toEqual(records);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/projects/prj-1/monitoring`);

    await monitoringApi.list('prj-1', { from: '2026-01-01', to: '2026-02-01' });
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/v1/projects/prj-1/monitoring?from=2026-01-01&to=2026-02-01`);
  });

  it('monitoringApi.addRows POSTs {rows} and returns the {accepted} count verbatim', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { accepted: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    const rows = [
      { record_date: '2026-01-01', generation_kwh: 10 },
      { record_date: '2026-01-02', generation_kwh: 12 },
    ];
    expect(await monitoringApi.addRows('prj-1', rows)).toEqual({ accepted: 2 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/projects/prj-1/monitoring`);
    expect(JSON.parse(init.body)).toEqual({ rows });
  });

  it('methodologiesApi.list unwraps {methodologies} summaries', async () => {
    const methodologies = [{ id: 'mth-1', code: 'T-VER-S-01', name: 'Solar', standard: 'T-VER', version: '1.0', sectoral_scope: 'Energy', status: 'active' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { methodologies })));

    expect(await methodologiesApi.list()).toEqual(methodologies);
  });

  it('methodologiesApi.exportDoc returns the bare document with schema_version stripped', async () => {
    const doc = { schema_version: 2, code: 'T-VER-S-01', name: 'Solar', standard: 'T-VER', version: '1.0', status: 'active' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, doc));
    vi.stubGlobal('fetch', fetchMock);

    const result = await methodologiesApi.exportDoc('mth-1');
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/methodologies/mth-1/export`);
    expect(result).toEqual({ code: 'T-VER-S-01', name: 'Solar', standard: 'T-VER', version: '1.0', status: 'active' });
    expect('schema_version' in result).toBe(false);
  });

  it('pddsApi.list hits /pdds bare (in-flight queue) or with an explicit ?state=', async () => {
    const pdds = [{ id: 'PDD-1' }];
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { pdds }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await pddsApi.list()).toEqual(pdds);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/pdds`);

    await pddsApi.list('registered');
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/v1/pdds?state=registered`);
  });

  it('pddsApi.byProject unwraps {pdd} from the project-scoped route', async () => {
    const pdd = { id: 'PDD-1', project_id: 'prj-1' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { pdd }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await pddsApi.byProject('prj-1')).toEqual(pdd);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/projects/prj-1/pdd`);
  });

  it('verificationsApi.list unwraps {verifications} and forwards filters as query params', async () => {
    const verifications = [{ id: 'ver-1' }];
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { verifications }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await verificationsApi.list()).toEqual(verifications);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/verifications`);

    await verificationsApi.list({ project_id: 'prj-1', state: 'approved' });
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/v1/verifications?project_id=prj-1&state=approved`);
  });

  it('evidenceApi.listByProject unwraps {evidence}', async () => {
    const evidence = [{ id: 'ev-1', project_id: 'prj-1' }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { evidence }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await evidenceApi.listByProject('prj-1')).toEqual(evidence);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/projects/prj-1/evidence`);
  });

  it('evidenceApi.fileBlob refreshes an expired access token once and retries (Download after 15 min)', async () => {
    setSession({ access_token: 'stale', refresh_token: 'ref-old' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'acc-new', refresh_token: 'ref-new' }))
      .mockResolvedValueOnce(new Response('meter,2026-01-01,1234', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const blob = await evidenceApi.fileBlob('ev-1');

    expect(await blob?.text()).toBe('meter,2026-01-01,1234');
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/evidence/ev-1/file`);
    expect(fetchMock.mock.calls[2][1].headers.authorization).toBe('Bearer acc-new');
  });

  it('evidenceApi.file returns the bytes, and throws the server error instead of hiding it', async () => {
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('bytes', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Stored file not found' } })));

    expect(await (await evidenceApi.file('ev-1')).text()).toBe('bytes');
    await expect(evidenceApi.file('ev-1')).rejects.toMatchObject({ name: 'ApiError', status: 404 });
  });

  it('credentialsApi.list and tokensApi.list unwrap {credentials} / {tokens}', async () => {
    const credentials = [{ id: 'vc-1' }];
    const tokens = [{ id: 'tok-1' }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, { credentials }))
      .mockResolvedValueOnce(jsonResponse(200, { tokens }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await credentialsApi.list()).toEqual(credentials);
    expect(await tokensApi.list()).toEqual(tokens);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/credentials`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/api/v1/tokens`);
  });
});
