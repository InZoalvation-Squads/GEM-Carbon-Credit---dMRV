import { describe, it, expect } from 'vitest';
import type { MonitoringRecord } from '../types';
import { annualMwh } from './rec-roi';

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
