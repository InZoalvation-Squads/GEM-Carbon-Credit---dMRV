import type {
  Methodology, PddFieldSchema, PddComputedSource,
  Project, EmissionFactor,
} from '../types';
import { canonical, shortHash } from './hash';
import { locationToCountryCode } from './geo';

const SUN_HOURS_PER_DAY = 4.0;      // matches seed generation model
const DEFAULT_PERFORMANCE_RATIO = 0.8;

export interface ComputeContext {
  project: Project;
  factors: EmissionFactor[];
  sectionData: Record<string, unknown>;
}

/** A field is visible when it has no showIf, or its driver field equals the expected value. */
export function isFieldVisible(field: PddFieldSchema, data: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  return data[field.showIf.field] === field.showIf.equals;
}

export interface PddValidationResult {
  ok: boolean;
  missing: Array<{ section: string; field: string; label: string }>;
}

/** Required, visible, non-computed fields must have a non-empty value. */
export function validatePdd(m: Methodology, data: Record<string, unknown>): PddValidationResult {
  const missing: PddValidationResult['missing'] = [];
  for (const section of m.pdd_sections) {
    for (const field of section.fields) {
      if (!field.required || field.type === 'computed') continue;
      if (!isFieldVisible(field, data)) continue;
      const v = data[field.key];
      const empty = v === undefined || v === null || v === ''
        || (Array.isArray(v) && v.length === 0);
      if (empty) missing.push({ section: section.key, field: field.key, label: field.label });
    }
  }
  return { ok: missing.length === 0, missing };
}

/** Current grid emission factor for the project's country, or null. */
function gridFactor(ctx: ComputeContext): number | null {
  const country = locationToCountryCode(ctx.project.location.split(',').pop()?.trim() ?? '');
  const f = ctx.factors.find((x) => x.country === country && x.is_current);
  return f ? f.factor_kgco2e_per_kwh : null;
}

/** Resolve a computed field's value from project + factors + current answers. */
export function resolveComputed(source: PddComputedSource, ctx: ComputeContext): number | string | null {
  switch (source) {
    case 'capacity_kwp': return ctx.project.capacity_kwp;
    case 'project_location': return ctx.project.location;
    case 'commission_date': return ctx.project.commission_date;
    case 'grid_factor': return gridFactor(ctx);
    case 'er_estimate': {
      const gf = gridFactor(ctx);
      if (gf === null) return null;
      const raw = Number(ctx.sectionData.performance_ratio ?? DEFAULT_PERFORMANCE_RATIO);
      const pr = Number.isNaN(raw) || raw <= 0 ? DEFAULT_PERFORMANCE_RATIO : raw;
      const annualKwh = ctx.project.capacity_kwp * SUN_HOURS_PER_DAY * 365;
      const tco2e = (annualKwh * gf * pr) / 1000;
      return Math.round(tco2e * 1000) / 1000;
    }
    case 'annual_generation': return Math.round(year1GenerationKwh(ctx));
    case 'ec_pj': return computeEcPj(ctx.sectionData.consumers);
    case 'be_annual':
    case 'pe_annual':
    case 'er_annual': {
      const t = computeYearlyTable(ctx);
      if (!t) return null;
      return source === 'be_annual' ? t.avg.be : source === 'pe_annual' ? t.avg.pe : t.avg.er;
    }
    default: return null;
  }
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

export interface DisclosureSplit {
  disclosed: Record<string, unknown>;
  redacted: Array<{ key: string; value_hash: string }>;
}

/**
 * Salted hash of a sensitive field value. The salt keeps the published hash
 * non-guessable (no dictionary attack on low-entropy values like 'IRR 4.2%');
 * it stays private with the project owner, who reveals value + salt only to
 * parties allowed to verify the disclosure offline.
 */
export function saltedValueHash(salt: string, value: unknown): string {
  return shortHash(`${salt}|${canonical(value)}`);
}

/** Offline check that a revealed value + its private salt matches a published value_hash. */
export function verifyDisclosedValue(value: unknown, salt: string, value_hash: string): boolean {
  return saltedValueHash(salt, value) === value_hash;
}

/**
 * Keys of the sensitive fields that would actually be published for this PDD:
 * non-computed, currently visible, and holding a non-empty value. Shared by
 * splitDisclosure (redaction branch) and the store's per-field salt generation.
 */
export function sensitiveFieldKeys(m: Methodology, data: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const section of m.pdd_sections) {
    for (const field of section.fields) {
      if (!field.sensitive || field.type === 'computed') continue;
      if (!isFieldVisible(field, data)) continue;
      const v = data[field.key];
      if (v === undefined || v === null || v === '') continue;
      keys.push(field.key);
    }
  }
  return keys;
}

/**
 * Guardian-style selective disclosure: sensitive fields leave only a content hash.
 * `salts` maps field.key -> private hex salt; salted hashes are non-guessable while
 * the salt lets the owner prove the original value later (see verifyDisclosedValue).
 * Fields without an entry in `salts` hash unsalted (legacy behavior).
 */
export function splitDisclosure(
  m: Methodology, data: Record<string, unknown>, salts: Record<string, string> = {},
): DisclosureSplit {
  const disclosed: Record<string, unknown> = {};
  const redacted: DisclosureSplit['redacted'] = [];
  for (const section of m.pdd_sections) {
    for (const field of section.fields) {
      if (field.type === 'computed') continue;
      if (!isFieldVisible(field, data)) continue;
      const v = data[field.key];
      if (v === undefined || v === null || v === '') continue;
      if (field.sensitive) redacted.push({ key: field.key, value_hash: saltedValueHash(salts[field.key] ?? '', v) });
      else disclosed[field.key] = v;
    }
  }
  redacted.sort((a, b) => a.key.localeCompare(b.key));
  return { disclosed, redacted };
}

/** Deterministic content hash of the frozen PDD payload (for register + audit chain). */
export function pddContentHash(input: {
  methodology_snapshot: string;
  section_data: Record<string, unknown>;
  evidence_ids: string[];
}): string {
  return shortHash(canonical({
    methodology_snapshot: input.methodology_snapshot,
    section_data: input.section_data,
    evidence_ids: [...input.evidence_ids].sort(),
  }));
}
