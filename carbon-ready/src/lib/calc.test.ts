import { describe, it, expect } from 'vitest';
import { calculateCarbon, pickFactorForDate } from './calc';
import type { EmissionFactor, MonitoringRecord } from '../types';

const ef = (over: Partial<EmissionFactor>): EmissionFactor => ({
  id: 'ef-1', country: 'IN', source: 'CEA', factor_kgco2e_per_kwh: 0.82,
  effective_date: '2025-01-01', version: 1, is_current: true,
  created_at: '2025-01-01T00:00:00Z', ...over,
});

const mr = (date: string, kwh: number): MonitoringRecord => ({
  id: 'm-' + date, project_id: 'p1', record_date: date,
  generation_kwh: kwh, source: 'csv_upload', uploaded_at: '2026-01-01T00:00:00Z',
});

describe('pickFactorForDate', () => {
  it('returns the latest factor whose effective_date <= given date', () => {
    const factors = [
      ef({ id: 'a', version: 1, effective_date: '2024-01-01', factor_kgco2e_per_kwh: 0.90 }),
      ef({ id: 'b', version: 2, effective_date: '2025-04-01', factor_kgco2e_per_kwh: 0.82 }),
    ];
    expect(pickFactorForDate(factors, '2024-06-01')?.id).toBe('a');
    expect(pickFactorForDate(factors, '2025-04-01')?.id).toBe('b');
    expect(pickFactorForDate(factors, '2026-01-01')?.id).toBe('b');
  });

  it('returns undefined if no factor effective by the date', () => {
    const factors = [ef({ effective_date: '2027-01-01' })];
    expect(pickFactorForDate(factors, '2026-01-01')).toBeUndefined();
  });

  it('matches on country+source only (ignores unrelated factors)', () => {
    const factors = [
      ef({ id: 'a', country: 'IN', source: 'CEA' }),
      ef({ id: 'b', country: 'TH', source: 'EGAT' }),
    ];
    const pick = pickFactorForDate(factors.filter(f => f.country === 'TH' && f.source === 'EGAT'), '2026-01-01');
    expect(pick?.id).toBe('b');
  });
});

describe('calculateCarbon', () => {
  const factor = ef({ factor_kgco2e_per_kwh: 0.82 });

  it('computes per-record reduction', () => {
    const r = calculateCarbon([mr('2026-01-01', 100)], [factor]);
    expect(r.daily[0]).toMatchObject({ date: '2026-01-01', generation_kwh: 100, reduction_kgco2e: 82 });
  });

  it('rolls up monthly', () => {
    const r = calculateCarbon(
      [mr('2026-01-01', 100), mr('2026-01-02', 200), mr('2026-02-01', 50)],
      [factor]
    );
    const jan = r.monthly.find(m => m.period === '2026-01')!;
    const feb = r.monthly.find(m => m.period === '2026-02')!;
    expect(jan.generation_kwh).toBe(300);
    expect(jan.reduction_kgco2e).toBeCloseTo(246, 3);
    expect(feb.generation_kwh).toBe(50);
  });

  it('rolls up total', () => {
    const r = calculateCarbon([mr('2026-01-01', 100), mr('2026-02-01', 50)], [factor]);
    expect(r.totals.generation_kwh).toBe(150);
    expect(r.totals.reduction_kgco2e).toBeCloseTo(123, 3);
    expect(r.totals.reduction_tco2e).toBeCloseTo(0.123, 4);
  });

  it('uses the correct EF version for each record date', () => {
    const factors = [
      ef({ id: 'old', version: 1, effective_date: '2024-01-01', factor_kgco2e_per_kwh: 0.90 }),
      ef({ id: 'new', version: 2, effective_date: '2026-01-01', factor_kgco2e_per_kwh: 0.82 }),
    ];
    const r = calculateCarbon(
      [mr('2025-06-01', 100), mr('2026-06-01', 100)],
      factors
    );
    expect(r.daily.find(d => d.date === '2025-06-01')?.reduction_kgco2e).toBeCloseTo(90, 3);
    expect(r.daily.find(d => d.date === '2026-06-01')?.reduction_kgco2e).toBeCloseTo(82, 3);
  });

  it('skips records with no applicable factor', () => {
    const r = calculateCarbon([mr('2020-01-01', 100)], [ef({ effective_date: '2025-01-01' })]);
    expect(r.daily).toHaveLength(0);
    expect(r.totals.generation_kwh).toBe(0);
  });

  it('filters by date range when provided', () => {
    const r = calculateCarbon(
      [mr('2026-01-01', 100), mr('2026-02-01', 200), mr('2026-03-01', 300)],
      [factor],
      { from: '2026-02-01', to: '2026-02-28' }
    );
    expect(r.totals.generation_kwh).toBe(200);
  });

  it('returns zeros for empty input', () => {
    const r = calculateCarbon([], [factor]);
    expect(r.totals).toEqual({ generation_kwh: 0, reduction_kgco2e: 0, reduction_tco2e: 0 });
    expect(r.daily).toHaveLength(0);
    expect(r.monthly).toHaveLength(0);
  });

  it('returns the EF id used (most recent applied)', () => {
    const r = calculateCarbon([mr('2026-01-01', 100)], [factor]);
    expect(r.emission_factor_id).toBe(factor.id);
  });
});
