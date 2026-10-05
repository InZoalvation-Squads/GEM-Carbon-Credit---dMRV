import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';
import { seedDemo } from '../test/demoFixtures';
import { api } from '../lib/api';
import { EMPTY_REC_ROI_SETTINGS } from '../lib/rec-roi';

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
});
