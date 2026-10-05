import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from './index';
import { setSession } from '../lib/server-api';
import { seedFactors } from '../data/seed';
import { EMPTY_REC_ROI_SETTINGS } from '../lib/rec-roi';
import type {
  Project, MonitoringRecord, EmissionFactor, ProjectDesignDocument,
  VerificationRequest, EvidenceFile, VerifiableCredential, GuardianToken, RecIssueRequest,
  RecRoiProjectSetting,
} from '../types';

// ============================================================
// hydrateFromServer — server mode bulk-GET hydration (plan Task 2).
// Route-keyed fetch mock: URLs are matched on path + query exactly as the
// server registers them (see server/src/modules/*/routes.ts envelopes).
// ============================================================

const PREFIX = 'http://api.test/api/v1';

/** Marker for a route that should fail with a 500 envelope. */
const FAIL = Symbol('fail');

function stubRoutes(routes: Record<string, unknown>) {
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    const path = String(url).slice(PREFIX.length);
    if (!(path in routes)) {
      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: `no stub for ${path}` } }), {
        status: 404, headers: { 'content-type': 'application/json' },
      });
    }
    if (routes[path] === FAIL) {
      return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }), {
        status: 500, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(routes[path]), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// ---- server-shaped fixtures (field names mirror the server serializers) ----
const project: Project = {
  id: 'prj-srv-1', organization_id: 'org-1', name: 'Server Plant',
  location: 'Bangkok, Thailand', capacity_kwp: 120, commission_date: '2026-01-01',
  status: 'active', lifecycle_stage: 'registered',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};
const record: MonitoringRecord = {
  id: 'mon-srv-1', project_id: 'prj-srv-1', record_date: '2026-06-01',
  generation_kwh: 42, source: 'csv_upload', uploaded_at: '2026-06-02T00:00:00.000Z',
  param_key: 'EG_PJ', unit: 'kWh',
};
const factor: EmissionFactor = {
  id: 'ef-srv-1', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.42,
  effective_date: '2026-01-01', version: 5, is_current: true, created_at: '2026-01-01T00:00:00.000Z',
};
const methodologySummary = {
  id: 'mth-srv-1', code: 'T-VER-S-01', name: 'Solar', standard: 'T-VER',
  version: '1.0', sectoral_scope: 'Energy', status: 'active',
};
const methodologyDoc = {
  schema_version: 2, code: 'T-VER-S-01', name: 'Solar', standard: 'T-VER',
  version: '1.0', sectoral_scope: 'Energy', status: 'active',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  pdd_sections: [], required_evidence: [], monitoring_params: [],
};
const pddInflight = { id: 'PDD-srv-1', project_id: 'prj-srv-2', state: 'submitted' } as ProjectDesignDocument;
const pddRegistered = { id: 'PDD-srv-2', project_id: 'prj-srv-1', state: 'registered' } as ProjectDesignDocument;
const verification = { id: 'ver-srv-1', project_id: 'prj-srv-1', state: 'approved' } as VerificationRequest;
const recIssue = { id: 'RIR-srv-1', project_id: 'prj-srv-1', state: 'draft' } as RecIssueRequest;
const evidenceRow = { id: 'ev-srv-1', project_id: 'prj-srv-1', status: 'active' } as EvidenceFile;
const credential = { id: 'vc-srv-1', schema_id: 'sch-1' } as VerifiableCredential;
const token = { id: 'tok-srv-1', credential_id: 'vc-srv-1' } as GuardianToken;
const recRoiSettings = { ...EMPTY_REC_ROI_SETTINGS, price_source: 'quote', horizon_years: 5 };
const recRoiProjectSetting: RecRoiProjectSetting = {
  project_id: 'prj-srv-1', issuance_type: 'Normal', digital_meter_exempt: false,
  investment_mthb: null, updated_by: null, updated_at: null,
};

const HAPPY_ROUTES: Record<string, unknown> = {
  '/projects': { projects: [project] },
  '/factors': { factors: [factor] },
  '/methodologies': { methodologies: [methodologySummary] },
  '/methodologies/mth-srv-1/export': methodologyDoc, // bare document, no envelope
  '/pdds': { pdds: [pddInflight] },
  '/pdds?state=draft': { pdds: [] },
  '/pdds?state=registered': { pdds: [pddRegistered] },
  '/pdds?state=rejected': { pdds: [] },
  '/verifications': { verifications: [verification] },
  '/projects/prj-srv-1/monitoring': { records: [record] },
  '/projects/prj-srv-1/evidence': { evidence: [evidenceRow] },
  '/credentials': { credentials: [credential] },
  '/tokens': { tokens: [token] },
  '/rec-issues': { rec_issues: [recIssue] },
  '/rec-roi/settings': { settings: recRoiSettings },
  '/rec-roi/project-settings': { project_settings: [recRoiProjectSetting] },
};

describe('hydrateFromServer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
    useStore.getState().resetToSeed();
    useStore.setState({ hydration_errors: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('replaces every slice wholesale with the server copies', async () => {
    stubRoutes(HAPPY_ROUTES);

    await useStore.getState().hydrateFromServer();

    const s = useStore.getState();
    expect(s.projects).toEqual([project]);
    expect(s.records).toEqual([record]); // server-stamped rows, seed replaced
    expect(s.factors).toEqual([factor]);
    expect(s.verifications).toEqual([verification]);
    expect(s.evidence).toEqual([evidenceRow]);
    expect(s.credentials).toEqual([credential]);
    expect(s.tokens).toEqual([token]);
    expect(s.recIssues).toEqual([recIssue]);
    expect(s.recRoiSettings).toEqual(recRoiSettings);
    expect(s.recRoiProjectSettings).toEqual([recRoiProjectSetting]);
    expect(s.hydration_errors).toEqual([]);
    // pdds merge the bare (in-flight) list with the explicit terminal states
    expect(s.pdds.map((p) => p.id).sort()).toEqual(['PDD-srv-1', 'PDD-srv-2']);
  });

  it('rebuilds methodologies from list + per-id export, re-attaching the id', async () => {
    stubRoutes(HAPPY_ROUTES);

    await useStore.getState().hydrateFromServer();

    const methodologies = useStore.getState().methodologies;
    expect(methodologies).toHaveLength(1);
    const m = methodologies[0];
    expect(m.id).toBe('mth-srv-1'); // id from the list row, not the document
    expect(m.code).toBe('T-VER-S-01');
    expect(m.calculation).toEqual(methodologyDoc.calculation);
    expect('schema_version' in m).toBe(false); // export stamp stripped
  });

  it('collects failed slice names in hydration_errors and keeps hydrating the rest', async () => {
    stubRoutes({ ...HAPPY_ROUTES, '/factors': FAIL });

    await useStore.getState().hydrateFromServer();

    const s = useStore.getState();
    expect(s.hydration_errors).toEqual(['factors']);
    expect(s.factors).toEqual(seedFactors); // failed slice left untouched
    expect(s.projects).toEqual([project]); // others still hydrated
    expect(s.records).toEqual([record]);
  });

  it('marks records + evidence unfetchable when the project list itself fails', async () => {
    const fetchMock = stubRoutes({ ...HAPPY_ROUTES, '/projects': FAIL });

    await useStore.getState().hydrateFromServer();

    const s = useStore.getState();
    expect([...s.hydration_errors].sort()).toEqual(['evidence', 'projects', 'records']);
    // no per-project fetches were attempted without the id list
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('/monitoring') || u.includes('/evidence'))).toBe(false);
    // independent slices still hydrated
    expect(s.factors).toEqual([factor]);
    expect(s.credentials).toEqual([credential]);
  });

  it('skips REC ROI slices for the verifier role (server answers 403)', async () => {
    useStore.setState((st) => ({
      currentUser: { ...st.currentUser, role: 'verifier' },
      // stale values persisted from an earlier non-verifier session
      recRoiSettings: { ...EMPTY_REC_ROI_SETTINGS, price_mid_thb: 25, price_source: 'quote' },
      recRoiProjectSettings: [{
        project_id: 'prj-0001', issuance_type: 'Normal', digital_meter_exempt: false, investment_mthb: 5,
        updated_by: 'x', updated_at: '2026-01-01T00:00:00Z',
      }],
    }));
    const fetchMock = stubRoutes(HAPPY_ROUTES);

    await useStore.getState().hydrateFromServer();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((u) => u.includes('/rec-roi'))).toBe(false);
    expect(useStore.getState().hydration_errors).toEqual([]);
    // commercial data must not linger in the verifier's store
    expect(useStore.getState().recRoiSettings).toEqual(EMPTY_REC_ROI_SETTINGS);
    expect(useStore.getState().recRoiProjectSettings).toEqual([]);
  });
});
