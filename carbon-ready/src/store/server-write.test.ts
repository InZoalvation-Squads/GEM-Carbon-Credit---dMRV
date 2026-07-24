import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from './index';
import { setSession, projectsApi, SessionExpiredError } from '../lib/server-api';
import type { EmissionFactor, Project } from '../types';

// ============================================================
// Server-mode write-through (plan Task 2): every write action calls the
// server first and applies the SERVER entity to the store — server-assigned
// ids/versions/stamps win over anything built locally.
// ============================================================

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

const localProject: Project = {
  id: 'prj-local-1', organization_id: 'org-1', name: 'Existing Plant',
  location: 'Pune, India', capacity_kwp: 250, commission_date: '2025-03-15',
  status: 'active', lifecycle_stage: 'registered',
  created_at: '2025-03-15T00:00:00.000Z', updated_at: '2025-03-15T00:00:00.000Z',
};

describe('server-mode write-through', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
    useStore.getState().resetToSeed();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('createProject applies the server entity (server id, not a local uid)', async () => {
    const serverProject: Project = {
      ...localProject, id: 'prj-srv-9', name: 'New Plant',
      lifecycle_stage: 'unregistered', status: 'draft',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { project: serverProject }));
    vi.stubGlobal('fetch', fetchMock);
    const auditBefore = useStore.getState().audit.length;

    const created = await useStore.getState().createProject({
      name: 'New Plant', location: 'Bangkok, Thailand', capacity_kwp: 80,
      commission_date: '2026-01-01', status: 'draft',
    });

    expect(created).toEqual(serverProject);
    expect(useStore.getState().projects[0]).toEqual(serverProject); // server id in store
    expect(useStore.getState().projects[0].id).toBe('prj-srv-9');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/projects');
    expect(init.method).toBe('POST');
    // audit_write is a no-op in server mode — the server owns the chain
    expect(useStore.getState().audit.length).toBe(auditBefore);
  });

  it('updateProject applies the server entity (server timestamps win)', async () => {
    useStore.setState({ projects: [localProject] });
    const serverUpdated: Project = { ...localProject, name: 'Renamed Plant', updated_at: '2026-07-24T12:00:00.000Z' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { project: serverUpdated }));
    vi.stubGlobal('fetch', fetchMock);

    const updated = await useStore.getState().updateProject('prj-local-1', { name: 'Renamed Plant' });

    expect(updated).toEqual(serverUpdated);
    const inStore = useStore.getState().projects.find((p) => p.id === 'prj-local-1');
    expect(inStore?.name).toBe('Renamed Plant');
    expect(inStore?.updated_at).toBe('2026-07-24T12:00:00.000Z'); // server stamp, not local Date()
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/projects/prj-local-1');
    expect(init.method).toBe('PATCH');
  });

  it('addEmissionFactor applies the server factor and retires prior local versions', async () => {
    const oldFactor: EmissionFactor = {
      id: 'ef-old', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.5,
      effective_date: '2025-01-01', version: 3, is_current: true, created_at: '2025-01-01T00:00:00.000Z',
    };
    useStore.setState({ factors: [oldFactor] });
    const serverFactor: EmissionFactor = {
      id: 'ef-srv-4', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.42,
      effective_date: '2026-01-01', version: 4, is_current: true, created_at: '2026-07-24T00:00:00.000Z',
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, { factor: serverFactor })));

    const added = await useStore.getState().addEmissionFactor({
      country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.42, effective_date: '2026-01-01',
    });

    expect(added).toEqual(serverFactor);
    const factors = useStore.getState().factors;
    expect(factors[0].id).toBe('ef-srv-4'); // server id + server-assigned version
    expect(factors[0].version).toBe(4);
    expect(factors.find((f) => f.id === 'ef-old')?.is_current).toBe(false); // superseded locally too
  });

  it('addMonitoringRecords applies the SERVER-stamped rows from the re-fetch, not local ones', async () => {
    const otherProjectRecord = {
      id: 'mon-other', project_id: 'prj-other', record_date: '2026-05-01',
      generation_kwh: 1, source: 'csv_upload', uploaded_at: '2026-05-01T00:00:00.000Z',
    };
    useStore.setState({ records: [otherProjectRecord] });
    const serverRows = [
      { id: 'mon-srv-1', project_id: 'prj-local-1', record_date: '2026-06-01', generation_kwh: 10, source: 'csv_upload', uploaded_at: '2026-06-02T00:00:00.000Z', param_key: 'EG_PJ', unit: 'kWh' },
      { id: 'mon-srv-2', project_id: 'prj-local-1', record_date: '2026-06-02', generation_kwh: 12, source: 'csv_upload', uploaded_at: '2026-06-02T00:00:00.000Z', param_key: 'EG_PJ', unit: 'kWh' },
    ];
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? jsonResponse(201, { accepted: 2 })
        : jsonResponse(200, { records: serverRows }));
    vi.stubGlobal('fetch', fetchMock);

    const accepted = await useStore.getState().addMonitoringRecords('prj-local-1', [
      { record_date: '2026-06-01', generation_kwh: 10 },
      { record_date: '2026-06-02', generation_kwh: 12 },
    ]);

    expect(accepted).toBe(2);
    const records = useStore.getState().records;
    // the project's slice is exactly the server rows (server ids + stamps) …
    expect(records.filter((r) => r.project_id === 'prj-local-1')).toEqual(serverRows);
    expect(records.every((r) => r.project_id !== 'prj-local-1' || r.id.startsWith('mon-srv'))).toBe(true);
    // … while other projects' records are untouched
    expect(records).toContainEqual(otherProjectRecord);
    // POST first, then the stamped-row re-fetch
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(String(fetchMock.mock.calls[1][0])).toBe('http://api.test/api/v1/projects/prj-local-1/monitoring');
  });

  it('audit_write is a no-op in server mode (the server owns the hash chain)', () => {
    const before = useStore.getState().audit;

    useStore.getState().audit_write('PROJECT_CREATED', 'project', 'prj-x', { name: 'X' });

    expect(useStore.getState().audit).toBe(before); // no new row, same reference
  });

  it('a dead token refresh flips the store to unauthenticated (session-expiry seam)', async () => {
    useStore.setState({ isAuthenticated: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(projectsApi.list()).rejects.toBeInstanceOf(SessionExpiredError);

    // the store's module-init onSessionExpired registration fired
    expect(useStore.getState().isAuthenticated).toBe(false);
  });
});
