import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStore } from './index';
import { seedDemo } from '../test/demoFixtures';
import { api } from '../lib/api';
import { EMPTY_REC_ROI_SETTINGS } from '../lib/rec-roi';
import { setSession } from '../lib/server-api';

beforeEach(() => {
  localStorage.clear();
  seedDemo();
  useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'esg_manager' } }));
});

const INPUT = {
  price_low_thb: 20, price_mid_thb: 25, price_high_thb: 30, price_source: 'quote 2026-09',
  platform_fee_pct: 10, eur_thb: 38, eur_thb_source: 'manual', horizon_years: 5,
};

describe('REC ROI — demo-mode store', () => {
  it('starts with nothing entered (real-data-only)', () => {
    expect(useStore.getState().recRoiSettings).toEqual(EMPTY_REC_ROI_SETTINGS);
    expect(useStore.getState().recRoiProjectSettings).toEqual([]);
  });

  it('api.saveRecRoiSettings stores the assumptions and audits the change', async () => {
    expect(await api.saveRecRoiSettings(INPUT)).toBe(true);
    const s = useStore.getState().recRoiSettings;
    expect(s).toMatchObject(INPUT);
    expect(s.updated_by).toBe(useStore.getState().currentUser.name);
    expect(useStore.getState().audit[0].action).toBe('REC_ROI_SETTINGS_UPDATED');
  });

  it('refuses invalid assumptions without touching the store', async () => {
    expect(await api.saveRecRoiSettings({ ...INPUT, price_source: '' })).toBe(false);
    expect(useStore.getState().recRoiSettings).toEqual(EMPTY_REC_ROI_SETTINGS);
  });

  it('api.saveRecRoiProjectSetting upserts per project', async () => {
    await api.saveRecRoiProjectSetting('prj-0001', { issuance_type: 'Normal', digital_meter_exempt: true, investment_mthb: null });
    await api.saveRecRoiProjectSetting('prj-0001', { issuance_type: 'Self consumption', digital_meter_exempt: true, investment_mthb: 5 });
    const rows = useStore.getState().recRoiProjectSettings;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ project_id: 'prj-0001', issuance_type: 'Self consumption', investment_mthb: 5 });
    expect(useStore.getState().audit[0].action).toBe('REC_ROI_PROJECT_UPDATED');
  });

  it('BOT FX is unavailable in demo mode', async () => {
    expect(await api.fetchEurThb()).toEqual({ available: false });
  });

  it('trims the source strings before validating and saving', async () => {
    expect(await api.saveRecRoiSettings({ ...INPUT, price_source: '  quote 2026-09  ', eur_thb_source: ' manual ' })).toBe(true);
    expect(useStore.getState().recRoiSettings).toMatchObject({ price_source: 'quote 2026-09', eur_thb_source: 'manual' });
    expect(await api.saveRecRoiSettings({ ...INPUT, price_source: '   ' })).toBe(false);
  });

  it('audits settings saves: first previous_value null, then the first saved row', async () => {
    await api.saveRecRoiSettings(INPUT);
    const first = useStore.getState().recRoiSettings;
    const e1 = useStore.getState().audit[0];
    expect(e1.entity_type).toBe('rec_roi');
    expect(e1.entity_id).toBe(useStore.getState().organization.id);
    expect(e1.previous_value).toBeNull();
    expect(e1.new_value).toMatchObject(INPUT);

    await api.saveRecRoiSettings({ ...INPUT, price_mid_thb: 26 });
    const e2 = useStore.getState().audit[0];
    expect(e2.previous_value).toEqual(first);
    expect(e2.new_value).toMatchObject({ price_mid_thb: 26 });
  });

  it('audits project-setting saves: first previous_value null, then the first saved row', async () => {
    const a = { issuance_type: 'Normal' as const, digital_meter_exempt: false, investment_mthb: null };
    await api.saveRecRoiProjectSetting('prj-0001', a);
    const first = useStore.getState().recRoiProjectSettings[0];
    const e1 = useStore.getState().audit[0];
    expect(e1.entity_type).toBe('rec_roi');
    expect(e1.entity_id).toBe('prj-0001');
    expect(e1.previous_value).toBeNull();
    expect(e1.new_value).toMatchObject({ project_id: 'prj-0001', ...a });

    await api.saveRecRoiProjectSetting('prj-0001', { ...a, investment_mthb: 7 });
    const e2 = useStore.getState().audit[0];
    expect(e2.previous_value).toEqual(first);
    expect(e2.new_value).toMatchObject({ investment_mthb: 7 });
  });
});

describe('REC ROI — server mode', () => {
  const PREFIX = 'http://api.test/api/v1';
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const err = (status: number, code: string) => json(status, { error: { code, message: code } });
  const stub = (handler: (path: string, init?: RequestInit) => Response) => {
    const m = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => handler(String(url).slice(PREFIX.length), init));
    vi.stubGlobal('fetch', m);
    return m;
  };

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
    setSession({ access_token: 'acc-1', refresh_token: 'ref-1' });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('a 400 from PUT /rec-roi/settings resolves false and leaves the store unchanged', async () => {
    stub(() => err(400, 'VALIDATION'));
    const before = useStore.getState().recRoiSettings;
    expect(await api.saveRecRoiSettings(INPUT)).toBe(false);
    expect(useStore.getState().recRoiSettings).toBe(before);
  });

  it('a successful project-setting PUT replaces the existing row with the server row', async () => {
    const other = { project_id: 'prj-0002', issuance_type: 'Normal' as const, digital_meter_exempt: false, investment_mthb: null, updated_by: null, updated_at: null };
    const old = { project_id: 'prj-0001', issuance_type: 'Normal' as const, digital_meter_exempt: false, investment_mthb: null, updated_by: null, updated_at: null };
    useStore.setState({ recRoiProjectSettings: [old, other] });
    const serverRow = { ...old, issuance_type: 'Self consumption' as const, investment_mthb: 9, updated_by: 'srv', updated_at: '2026-10-05T00:00:00.000Z' };
    const m = stub(() => json(200, { project_setting: serverRow }));

    expect(await api.saveRecRoiProjectSetting('prj-0001', { issuance_type: 'Self consumption', digital_meter_exempt: false, investment_mthb: 9 })).toBe(true);

    const [url, init] = m.mock.calls[0];
    expect(String(url)).toBe(`${PREFIX}/projects/prj-0001/rec-roi-setting`);
    expect(init?.method).toBe('PUT');
    const rows = useStore.getState().recRoiProjectSettings;
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.project_id === 'prj-0001')).toEqual([serverRow]);
    expect(rows).toContainEqual(other);
  });

  it('a 400 from the project-setting PUT resolves false and leaves the store unchanged', async () => {
    const old = { project_id: 'prj-0001', issuance_type: 'Normal' as const, digital_meter_exempt: false, investment_mthb: null, updated_by: null, updated_at: null };
    useStore.setState({ recRoiProjectSettings: [old] });
    stub(() => err(400, 'VALIDATION'));
    expect(await api.saveRecRoiProjectSetting('prj-0001', { issuance_type: 'Self consumption', digital_meter_exempt: false, investment_mthb: 3 })).toBe(false);
    expect(useStore.getState().recRoiProjectSettings).toEqual([old]);
  });

  it('fetchEurThb returns the server body, and {available:false} on 403', async () => {
    const body = { available: true, rate: 38.5, period: '2026-09', source: 'BOT' };
    stub(() => json(200, body));
    expect(await api.fetchEurThb()).toEqual(body);
    stub(() => err(403, 'FORBIDDEN'));
    expect(await api.fetchEurThb()).toEqual({ available: false });
  });
});
