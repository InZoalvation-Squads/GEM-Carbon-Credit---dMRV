import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from './index';
import { setSession, projectsApi, SessionExpiredError } from '../lib/server-api';
import { methodologyToJson } from '../lib/methodology-schema';
import type { EmissionFactor, EvidenceFile, Project } from '../types';

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

  // ---------------- Evidence versions + methodology import ----------------

  const activeEvidence: EvidenceFile = {
    id: 'ev-prev', project_id: 'prj-local-1', parent_id: null,
    category: 'maintenance_report', file_name: 'log.xlsx', kind: 'xlsx',
    file_size: 20, version_number: 1, status: 'active',
    content_hash: 'sha256-old', uploaded_by: 'usr-1', uploaded_by_name: 'Asha',
    uploaded_at: '2026-07-01T00:00:00.000Z',
  };

  it('replaceEvidence uploads the real file and applies the server version (previous one superseded)', async () => {
    useStore.setState({ evidence: [activeEvidence] });
    const serverRow: EvidenceFile = {
      ...activeEvidence, id: 'ev-srv-2', parent_id: 'ev-prev', file_name: 'log-v2.xlsx',
      file_size: 23, version_number: 2, content_hash: 'sha256-new',
      uploaded_at: '2026-10-07T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { evidence: serverRow }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['inverter,2026-02-01,999'], 'log-v2.xlsx');

    const next = await useStore.getState().replaceEvidence('ev-prev', {
      file, file_name: file.name, file_size: file.size, content_hash: 'sha256-new',
    });

    expect(next).toEqual(serverRow);
    const evidence = useStore.getState().evidence;
    expect(evidence[0]).toEqual(serverRow);
    expect(evidence.find((e) => e.id === 'ev-prev')?.status).toBe('superseded');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/evidence/ev-prev/replace');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect((form.get('file') as File).name).toBe('log-v2.xlsx');
    expect(form.get('client_hash')).toBe('sha256-new');
  });

  it('replaceEvidence refuses to make a local-only version in server mode (no file bytes)', async () => {
    useStore.setState({ evidence: [activeEvidence] });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      Promise.resolve(useStore.getState().replaceEvidence('ev-prev', { file_size: 99 })),
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().evidence).toEqual([activeEvidence]);
  });

  it('archiveEvidence posts to the server and applies the archived row', async () => {
    useStore.setState({ evidence: [activeEvidence] });
    const archived: EvidenceFile = { ...activeEvidence, status: 'archived' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { evidence: archived }));
    vi.stubGlobal('fetch', fetchMock);

    await useStore.getState().archiveEvidence('ev-prev');

    expect(useStore.getState().evidence).toEqual([archived]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/evidence/ev-prev/archive');
    expect(init.method).toBe('POST');
  });

  it('importMethodology posts the raw document and stores the server copy under the server id', async () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'admin' } }));
    const doc = JSON.parse(methodologyToJson(useStore.getState().methodologies[0]));
    doc.code = 'TEST-SRV-1';
    const text = JSON.stringify(doc);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(201, { methodology: {
        id: 'mth-srv-1', code: 'TEST-SRV-1', name: doc.name, standard: doc.standard,
        version: doc.version, sectoral_scope: doc.sectoral_scope, status: doc.status,
      } }))
      .mockResolvedValueOnce(jsonResponse(200, doc));
    vi.stubGlobal('fetch', fetchMock);

    const r = await useStore.getState().importMethodology(text);

    expect(r.ok).toBe(true);
    expect(r.methodology?.id).toBe('mth-srv-1');
    expect(r.methodology?.code).toBe('TEST-SRV-1');
    const stored = useStore.getState().methodologies.find((m) => m.code === 'TEST-SRV-1');
    expect(stored?.id).toBe('mth-srv-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/v1/methodologies/import');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toBe(text); // the raw document, parsed server-side
    expect(fetchMock.mock.calls[1][0]).toBe('http://api.test/api/v1/methodologies/mth-srv-1/export');
  });

  it('importMethodology returns the server rejection as {ok:false, error} and leaves the library alone', async () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'admin' } }));
    const before = useStore.getState().methodologies;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(409, {
      error: { code: 'CONFLICT', message: 'Methodology X v1 is already in the library.' },
    })));

    const r = await useStore.getState().importMethodology('{"any":"doc"}');

    expect(r).toEqual({ ok: false, error: 'Methodology X v1 is already in the library.' });
    expect(useStore.getState().methodologies).toBe(before);
  });
});
