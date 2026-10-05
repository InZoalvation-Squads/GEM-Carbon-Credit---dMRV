// REC (I-REC(E)) return-on-investment — pure functions, no store/API imports.
// Spec: docs/superpowers/specs/2026-10-05-rec-roi-design.md
//
// Real-data-only: the REC count comes from measured monitoring records (never
// a kWp × sun-hours estimate), fees from data/rec-fees.ts (FN-01), and prices
// are user-entered with a source. Anything missing yields an explicit status
// instead of a guessed number.
import type { MonitoringRecord } from '../types';

const DAY_MS = 86_400_000;
const dayIndex = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS;
const isoOfDay = (idx: number) => new Date(idx * DAY_MS).toISOString().slice(0, 10);

export type AnnualMwh =
  | {
      status: 'ok';
      annual_mwh: number;
      total_kwh: number;
      window_start: string;
      window_end: string;
      coverage_days: number;
      partial: boolean;
    }
  | { status: 'no_data' };

/**
 * Annual MWh (= RECs per year) from one project's measured records over the
 * 365 days ending at the latest record. Shorter coverage is annualised
 * (Σkwh ÷ days × 365) and flagged `partial`. With `driverParam`, rows are
 * filtered like calculateCarbon: no param_key (legacy) or the driver param.
 */
export function annualMwh(records: MonitoringRecord[], driverParam?: string): AnnualMwh {
  const rows = driverParam
    ? records.filter((r) => !r.param_key || r.param_key === driverParam)
    : records;
  if (rows.length === 0) return { status: 'no_data' };

  // reduce, not Math.max(...spread) — IoT projects can carry tens of thousands of rows.
  const latest = rows.reduce((m, r) => Math.max(m, dayIndex(r.record_date)), -Infinity);
  const windowStart = latest - 364;
  const inWindow = rows.filter((r) => dayIndex(r.record_date) >= windowStart);
  const earliest = inWindow.reduce((m, r) => Math.min(m, dayIndex(r.record_date)), Infinity);
  const total_kwh = inWindow.reduce((s, r) => s + r.generation_kwh, 0);
  if (!(total_kwh > 0)) return { status: 'no_data' };

  const coverage_days = latest - earliest + 1;
  const partial = coverage_days < 365;
  const annualKwh = partial ? (total_kwh / coverage_days) * 365 : total_kwh;
  return {
    status: 'ok',
    annual_mwh: annualKwh / 1000,
    total_kwh,
    window_start: isoOfDay(earliest),
    window_end: isoOfDay(latest),
    coverage_days,
    partial,
  };
}
