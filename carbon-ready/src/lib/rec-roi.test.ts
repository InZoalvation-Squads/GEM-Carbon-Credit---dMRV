import { describe, it, expect } from 'vitest';
import type { MonitoringRecord } from '../types';
import { annualMwh, computeRecRoi, yearFixedCostThb, validateRecRoiSettings, EMPTY_REC_ROI_SETTINGS, type RecRoiAssumptions, type RecProjectInputs } from './rec-roi';

/** `days` consecutive daily records starting at `from`, each `kwh`. */
function daily(from: string, days: number, kwh: number, extra: Partial<MonitoringRecord> = {}): MonitoringRecord[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    id: `m-${from}-${i}-${extra.param_key ?? 'x'}`,
    project_id: 'prj-t',
    record_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    generation_kwh: kwh,
    source: 'csv',
    uploaded_at: '2026-01-01T00:00:00Z',
    ...extra,
  }));
}

describe('annualMwh — measured data only', () => {
  it('no records → no_data', () => {
    expect(annualMwh([])).toEqual({ status: 'no_data' });
  });

  it('records that sum to zero → no_data', () => {
    expect(annualMwh(daily('2026-01-01', 10, 0))).toEqual({ status: 'no_data' });
  });

  it('92 days of data is annualised and flagged partial', () => {
    const r = annualMwh(daily('2026-01-01', 92, 100));
    expect(r).toEqual({
      status: 'ok', total_kwh: 9_200, coverage_days: 92, partial: true,
      window_start: '2026-01-01', window_end: '2026-04-02',
      annual_mwh: (9_200 / 92) * 365 / 1000, // 36.5
    });
  });

  it('more than a year of data uses only the latest 365 days', () => {
    // 400 days from 2025-01-01 → last record 2026-02-04; window 2025-02-05 … 2026-02-04.
    const r = annualMwh(daily('2025-01-01', 400, 10));
    expect(r).toEqual({
      status: 'ok', total_kwh: 3_650, coverage_days: 365, partial: false,
      window_start: '2025-02-05', window_end: '2026-02-04', annual_mwh: 3.65,
    });
  });

  it('keeps only the driver param (and legacy rows without param_key)', () => {
    const records = [
      ...daily('2026-01-01', 10, 100),                          // legacy, counted
      ...daily('2026-01-01', 10, 1_000, { param_key: 'OTHER' }), // other param, dropped
    ];
    const withDriver = annualMwh(records, 'EG_PJ');
    const unfiltered = annualMwh(records);
    expect(withDriver.status === 'ok' && withDriver.total_kwh).toBe(1_000);
    expect(unfiltered.status === 'ok' && unfiltered.total_kwh).toBe(11_000);
  });
});

const INPUTS: RecProjectInputs = {
  capacity_kwp: 500, annual_mwh: 700, issuance_type: 'Normal', digital_meter_exempt: false,
};
const ASSUME: RecRoiAssumptions = {
  price_low_thb: 20, price_mid_thb: 25, price_high_thb: 30,
  platform_fee_pct: 10, eur_thb: 40, horizon_years: 5,
};

describe('yearFixedCostThb — registration, renewal, account fees', () => {
  it('year 1 carries registration (+ account opening and first annual fee on the own path)', () => {
    expect(yearFixedCostThb('platform', 1, INPUTS, ASSUME)).toBe(3_800);
    expect(yearFixedCostThb('own', 1, INPUTS, ASSUME)).toBe(3_800 + 500 * 40 + 2_000 * 40);
  });
  it('renewal (40%) at the start of each new 5-year validity: years 6, 11 …', () => {
    expect(yearFixedCostThb('platform', 5, INPUTS, ASSUME)).toBe(0);
    expect(yearFixedCostThb('platform', 6, INPUTS, ASSUME)).toBe(1_520);
    expect(yearFixedCostThb('platform', 11, INPUTS, ASSUME)).toBe(1_520);
    expect(yearFixedCostThb('own', 2, INPUTS, ASSUME)).toBe(2_000 * 40);
  });
});

describe('computeRecRoi — hand-computed reference (500 kWp, 700 MWh/yr)', () => {
  const r = computeRecRoi(INPUTS, ASSUME);

  it('own account path', () => {
    expect(r.own.status).toBe('ok');
    if (r.own.status !== 'ok') return;
    expect(r.own.fixed_cost_thb).toBe(423_800);
    expect(r.own.issuance_cost_thb).toBeCloseTo(3_325, 6);
    expect(r.own.break_even_price_thb).toBeCloseTo(427_125 / 3_500, 6);
    const mid = r.own.scenarios.find((s) => s.scenario === 'mid')!;
    expect(mid.revenue_thb).toBe(87_500);
    expect(mid.net_thb).toBeCloseTo(-339_625, 6);
    expect(mid.roi_pct).toBeCloseTo((-339_625 / 427_125) * 100, 6);
    expect(mid.payback_months).toBeNull();
  });

  it('platform path', () => {
    expect(r.platform.status).toBe('ok');
    if (r.platform.status !== 'ok') return;
    expect(r.platform.fixed_cost_thb).toBe(3_800);
    expect(r.platform.break_even_price_thb).toBeCloseTo(7_125 / 3_150, 6);
    const mid = r.platform.scenarios.find((s) => s.scenario === 'mid')!;
    expect(mid.cost_thb).toBeCloseTo(15_875, 6);
    expect(mid.net_thb).toBeCloseTo(71_625, 6);
    expect(mid.roi_pct).toBeCloseTo((71_625 / 15_875) * 100, 6);
    expect(mid.payback_months).toBe(4);
    expect(r.platform.scenarios.map((s) => s.scenario)).toEqual(['low', 'mid', 'high']);
  });

  it('recommends the path with the higher net at the mid price', () => {
    expect(r.recommended).toBe('platform');
    expect(r.missing).toEqual([]);
  });
});

describe('computeRecRoi — missing inputs never become guesses', () => {
  it('no FX → own path missing_fx, platform still computed', () => {
    const r = computeRecRoi(INPUTS, { ...ASSUME, eur_thb: null });
    expect(r.own).toEqual({ path: 'own', status: 'missing_fx' });
    expect(r.platform.status).toBe('ok');
    expect(r.recommended).toBe('platform');
    expect(r.missing).toEqual(['fx']);
  });

  it('no platform fee → platform path missing_fee', () => {
    const r = computeRecRoi(INPUTS, { ...ASSUME, platform_fee_pct: null });
    expect(r.platform).toEqual({ path: 'platform', status: 'missing_fee' });
    expect(r.recommended).toBe('own');
    expect(r.missing).toEqual(['platform_fee']);
  });

  it('no prices → no scenarios, break-even still shown, recommendation by lower break-even', () => {
    const r = computeRecRoi(INPUTS, { ...ASSUME, price_low_thb: null, price_mid_thb: null, price_high_thb: null });
    expect(r.platform.status === 'ok' && r.platform.scenarios).toEqual([]);
    expect(r.platform.status === 'ok' && r.platform.break_even_price_thb).toBeCloseTo(7_125 / 3_150, 6);
    expect(r.recommended).toBe('platform');
    expect(r.missing).toEqual(['price']);
  });

  it('neither FX nor fee → no recommendation', () => {
    const r = computeRecRoi(INPUTS, { ...ASSUME, eur_thb: null, platform_fee_pct: null });
    expect(r.recommended).toBeNull();
    expect(r.missing).toEqual(['platform_fee', 'fx']);
  });

  it('exempt small facility with no upfront cost pays back immediately', () => {
    const r = computeRecRoi(
      { ...INPUTS, capacity_kwp: 200, digital_meter_exempt: true },
      { ...ASSUME, platform_fee_pct: 0 },
    );
    expect(r.platform.status === 'ok' && r.platform.fixed_cost_thb).toBe(0);
    const mid = r.platform.status === 'ok' ? r.platform.scenarios.find((s) => s.scenario === 'mid') : undefined;
    expect(mid?.payback_months).toBe(0);
  });

  it('10-year horizon adds one renewal', () => {
    const r = computeRecRoi(INPUTS, { ...ASSUME, horizon_years: 10 });
    expect(r.platform.status === 'ok' && r.platform.fixed_cost_thb).toBe(3_800 + 1_520);
  });
});

describe('validateRecRoiSettings — mirrors the server zod schema', () => {
  const base = { ...EMPTY_REC_ROI_SETTINGS, price_source: '' };
  it('accepts the all-empty settings', () => {
    expect(validateRecRoiSettings(base)).toBeNull();
  });
  it('rejects mis-ordered prices', () => {
    expect(validateRecRoiSettings({ ...base, price_low_thb: 30, price_mid_thb: 20, price_source: 'quote' }))
      .toMatch(/ต่ำ ≤ กลาง ≤ สูง/);
  });
  it('requires a source once a price is entered', () => {
    expect(validateRecRoiSettings({ ...base, price_mid_thb: 25 })).toMatch(/ที่มาของราคา/);
  });
  it('rejects a platform fee of 100% or more', () => {
    expect(validateRecRoiSettings({ ...base, platform_fee_pct: 100 })).toMatch(/ค่าบริการ/);
  });
  it('rejects a horizon outside 1–25 years', () => {
    expect(validateRecRoiSettings({ ...base, horizon_years: 0 })).toMatch(/1–25/);
  });
});
