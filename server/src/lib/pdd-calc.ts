// ADAPTED port of the ER calculation from carbon-ready/src/lib/pdd.ts +
// lib/geo.ts. NOT covered by copy-drift.test.ts because the types are
// deliberately widened (CalcProject/CalcFactor structural slices instead of
// the SPA's Project/EmissionFactor) — the FUNCTION BODIES must still be kept
// line-identical with the SPA by hand when either side changes: the number
// this produces is the credit amount Guardian mints.

const SUN_HOURS_PER_DAY = 4.0;      // matches seed generation model
const DEFAULT_PERFORMANCE_RATIO = 0.8;

/** Structural slices of the SPA Project / EmissionFactor types. */
export interface CalcProject { location: string; capacity_kwp: number; commission_date: string }
export interface CalcFactor { country: string; is_current: boolean; effective_date: string; factor_kgco2e_per_kwh: number }
export interface ComputeContext {
  project: CalcProject;
  factors: CalcFactor[];
  sectionData: Record<string, unknown>;
}

/** carbon-ready/src/lib/geo.ts verbatim. */
export function locationToCountryCode(s: string): string {
  const map: Record<string, string> = { India: 'IN', Thailand: 'TH', Vietnam: 'VN' };
  return map[s] ?? s;
}

function gridFactor(ctx: ComputeContext): number | null {
  const current = ctx.factors.filter(
    (x) => x.country === locationToCountryCode(ctx.project.location.split(',').pop()?.trim() ?? '') && x.is_current,
  );
  if (current.length === 0) return null;
  const f = current.reduce((a, b) => (b.effective_date >= a.effective_date ? b : a));
  return f.factor_kgco2e_per_kwh;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Σ project electricity consumers (kWh/yr): direct kwh_year, else rated_w × hours ÷ 1000. */
export function computeEcPj(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let total = 0;
  for (const r of rows as Array<Record<string, unknown>>) {
    const direct = numOrNull(r.kwh_year);
    if (direct !== null) { total += direct; continue; }
    const w = numOrNull(r.rated_w);
    const h = numOrNull(r.hours_per_year);
    if (w !== null && h !== null) total += (w * h) / 1000;
  }
  return round2(total);
}

/** Year-1 generation: explicit PVsyst-style override, else the capacity model. */
export function year1GenerationKwh(ctx: ComputeContext): number {
  const override = numOrNull(ctx.sectionData.year1_generation_kwh);
  if (override !== null && override > 0) return override;
  const raw = numOrNull(ctx.sectionData.performance_ratio);
  const pr = raw !== null && raw > 0 ? raw : DEFAULT_PERFORMANCE_RATIO;
  return ctx.project.capacity_kwp * SUN_HOURS_PER_DAY * 365 * pr;
}

export interface PddYearlyRow {
  year: number; generation_kwh: number;
  be: number; pe: number; le: number; er: number;
}
export interface PddYearlyTable {
  rows: PddYearlyRow[];
  totals: { be: number; pe: number; le: number; er: number };
  avg: { be: number; pe: number; le: number; er: number };
  ef: number;
  years: number;
}

/**
 * Crediting-period table exactly as the TGO form computes it:
 * gen_y = gen_1 × (1 − d)^(y−1); BE_y = gen_y × EF ÷ 1000 (2 dp);
 * PE constant from the consumers table; ER_y = floor(BE_y − PE − LE) — the
 * form truncates yearly ER to whole tCO2e (448.59 → 448).
 */
export function computeYearlyTable(ctx: ComputeContext): PddYearlyTable | null {
  const ef = gridFactor(ctx);
  if (ef === null) return null;
  const years = numOrNull(ctx.sectionData.crediting_years) ?? 7;
  const d = (numOrNull(ctx.sectionData.degradation_pct) ?? 0) / 100;
  const gen1 = year1GenerationKwh(ctx);
  const pe = round2((computeEcPj(ctx.sectionData.consumers) * ef) / 1000);
  const rows: PddYearlyRow[] = [];
  for (let y = 1; y <= years; y++) {
    const gen = gen1 * Math.pow(1 - d, y - 1);
    const be = round2((gen * ef) / 1000);
    rows.push({ year: y, generation_kwh: Math.round(gen), be, pe, le: 0, er: Math.floor(be - pe) });
  }
  const totals = {
    be: round2(rows.reduce((a, r) => a + r.be, 0)),
    pe: round2(rows.reduce((a, r) => a + r.pe, 0)),
    le: 0,
    er: rows.reduce((a, r) => a + r.er, 0),
  };
  const avg = { be: round2(totals.be / years), pe, le: 0, er: Math.round(totals.er / years) };
  return { rows, totals, avg, ef, years };
}
