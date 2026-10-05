import type {
  Methodology, PddFieldSchema, PddComputedSource,
  Project, EmissionFactor,
} from '../types';
import { canonical, shortHash } from './hash';
import { locationToCountryCode } from './geo';
import { generationForecast } from './pdd-forecast';
import { parseSites, isBundle, sumSiteCapacityKwp, sumSiteYear1Kwh, siteGenerationMatrix } from './pdd-sites';

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
  // Aggregated PDDs stand on their site table: a row missing capacity or
  // year-1 generation would silently drag the summed totals down rather than
  // showing up as an error. Keyed off the rows themselves, not project_form —
  // that selector is optional and may be absent on older PDDs.
  parseSites(data.sites).forEach((s, i) => {
    if (s.kwp === null || s.year1_kwh === null) {
      missing.push({
        section: 'cover', field: 'sites',
        label: `พื้นที่ติดตั้งแถวที่ ${i + 1} — ต้องกรอกกำลังการผลิตและไฟฟ้าปีที่ 1`,
      });
    }
  });
  return { ok: missing.length === 0, missing };
}

/**
 * Current grid emission factor for the project's country, or null. Versioning
 * is per country+source pair, so several sources can be current at once for
 * one country — the latest effective_date wins.
 */
function gridFactor(ctx: ComputeContext): number | null {
  const current = ctx.factors.filter(
    (x) => x.country === locationToCountryCode(ctx.project.location.split(',').pop()?.trim() ?? '') && x.is_current,
  );
  if (current.length === 0) return null;
  const f = current.reduce((a, b) => (b.effective_date >= a.effective_date ? b : a));
  return f.factor_kgco2e_per_kwh;
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
    case 'bundle_capacity': return bundleCapacityKwp(ctx);
    case 'site_count': return parseSites(ctx.sectionData.sites).length;
    default: return null;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Installed capacity: Σ site rows in bundle mode, else the parent project's. */
export function bundleCapacityKwp(ctx: ComputeContext): number {
  const sites = parseSites(ctx.sectionData.sites);
  return sumSiteCapacityKwp(sites) ?? ctx.project.capacity_kwp;
}

/** Buddhist-calendar year the crediting period starts, for the site matrix. */
export function creditingStartYear(ctx: ComputeContext): number {
  const iso = ctx.sectionData.crediting_start;
  const gregorian = typeof iso === 'string' && iso.length >= 4 ? Number(iso.slice(0, 4)) : NaN;
  return Number.isNaN(gregorian) ? 2570 : gregorian + 543;
}

/**
 * kWh/yr of one consumers row: direct kwh_year, else rated_w × hours ÷ 1000,
 * times the row's qty (จำนวน ชุด, default 1 — the official appendix lists
 * "5 × 8 W × 8,760 h = 350.40"). Null when the row lacks the data.
 */
export function consumerKwh(r: Record<string, unknown>): number | null {
  const qty = numOrNull(r.qty) ?? 1;
  const direct = numOrNull(r.kwh_year);
  if (direct !== null) return direct * qty;
  const w = numOrNull(r.rated_w);
  const h = numOrNull(r.hours_per_year);
  if (w === null || h === null) return null;
  return (w * h * qty) / 1000;
}

/** Σ project electricity consumers (kWh/yr) over the rows that carry enough data. */
export function computeEcPj(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let total = 0;
  for (const r of rows as Array<Record<string, unknown>>) {
    total += consumerKwh(r) ?? 0;
  }
  return round2(total);
}

/** Year-1 generation: Σ site rows in bundle mode, else override, else the capacity model. */
export function year1GenerationKwh(ctx: ComputeContext): number {
  if (isBundle(ctx.sectionData)) {
    return sumSiteYear1Kwh(parseSites(ctx.sectionData.sites)) ?? 0;
  }
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

// generationForecast moved to pdd-forecast.ts; re-exported below to keep existing callers working.
export { generationForecast };

/**
 * Crediting-period table exactly as the TGO form computes it:
 * gen_y chained-rounded per generationForecast; BE_y = gen_y × EF ÷ 1000 (2 dp);
 * PE constant from the consumers table; ER_y = floor(BE_y − PE − LE) — the
 * form truncates yearly ER to whole tCO2e (448.59 → 448).
 */
export function computeYearlyTable(ctx: ComputeContext): PddYearlyTable | null {
  const ef = gridFactor(ctx);
  if (ef === null) return null;
  const years = numOrNull(ctx.sectionData.crediting_years) ?? 7;
  const d = numOrNull(ctx.sectionData.degradation_pct) ?? 0;
  const gen1 = year1GenerationKwh(ctx);
  const pe = round2((computeEcPj(ctx.sectionData.consumers) * ef) / 1000);
  // Bundle mode: each site degrades from its own first-synchronisation year, so
  // the yearly total is the staggered sum rather than one aggregate curve.
  const gens = isBundle(ctx.sectionData)
    ? siteGenerationMatrix(parseSites(ctx.sectionData.sites), creditingStartYear(ctx), years, d).totals
    : generationForecast(gen1, d, years);
  const rows: PddYearlyRow[] = [];
  for (let y = 1; y <= years; y++) {
    const gen = gens[y - 1];
    const be = round2((gen * ef) / 1000);
    rows.push({ year: y, generation_kwh: gen, be, pe, le: 0, er: Math.floor(be - pe) });
  }
  const totals = {
    be: round2(rows.reduce((a, r) => a + r.be, 0)),
    pe: round2(rows.reduce((a, r) => a + r.pe, 0)),
    le: 0,
    er: rows.reduce((a, r) => a + r.er, 0),
  };
  // avg.er rounds a total of already-floored yearly values. That looks like a
  // double truncation, and it is — but it is TGO's own arithmetic: the reference
  // PDD's §3.5 prints yearly ER 1041/1035/1030/1024/1018/1013/1007, total 7,168
  // and average 1,024, which this reproduces exactly. Averaging the unfloored
  // BE−PE instead would disagree with the published document. Do not "fix" it.
  const avg = { be: round2(totals.be / years), pe, le: 0, er: Math.round(totals.er / years) };
  return { rows, totals, avg, ef, years };
}

// ---------------------------------------------------------------------------
// PEA-style financial evaluation (official-form appendix)
// ---------------------------------------------------------------------------

export interface FinancialRow {
  year: number;                    // 0 = investment outlay
  discount_factor: number;
  generation_kwh: number | null;   // null for year 0
  benefit_thb: number;             // generation × price (+ scrap in the final year)
  cost_thb: number;                // investment at year 0, O&M afterwards
  snpv_thb: number;                // (benefit − cost) × discount factor
  cum_snpv_thb: number;
}

export interface FinancialTable {
  rows: FinancialRow[];
  investment_thb: number;
  price_thb_kwh: number;
  discount_rate_pct: number;
  om_cost_thb_year: number;
  om_start_year: number;
  lifetime_years: number;
  scrap_thb: number;
  totals: { benefit_thb: number; cost_thb: number; npv_thb: number };
  irr_pct: number | null;
  payback_years: number | null;
}

// PEA solar-evaluation defaults (their standard sheet): 4.18 THB/kWh average
// tariff, 7% discount rate, free O&M for the first 6 years then 1% of the
// investment per year (300k THB on the 30M-THB MCRU sheet), 25-year plant
// life, 5%-of-investment scrap value in the final year.
const FIN_DEFAULTS = { price: 4.18, discount: 7, omPctOfInvestment: 1, omStart: 7, lifetime: 25, scrapPct: 5 };

/** Internal-rate-of-return by bisection over the yearly net cash flows. */
function irrFromFlows(flows: number[]): number | null {
  const npvAt = (r: number) => flows.reduce((s, f, y) => s + f / Math.pow(1 + r, y), 0);
  let lo = 1e-9, hi = 1;
  if (npvAt(lo) < 0 || npvAt(hi) > 0) return null; // no sign change in (0, 100%]
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (npvAt(mid) > 0) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

/**
 * The official-form financial appendix: 25-year discounted cash flow in the
 * PEA evaluation format. Inputs come from section_data with PEA defaults for
 * anything not provided; returns null without an investment figure or
 * a usable year-1 generation estimate.
 *
 * `extraBenefit(year, generationKwh)` adds a further cash flow to each
 * operating year (REC ROI uses it for net REC revenue). Omitted → identical
 * to the official appendix.
 */
export function computeFinancialTable(
  ctx: ComputeContext,
  extraBenefit?: (year: number, generationKwh: number) => number,
): FinancialTable | null {
  const investMthb = numOrNull(ctx.sectionData.investment_mthb);
  if (investMthb === null || investMthb <= 0) return null;
  const gen1 = year1GenerationKwh(ctx);
  if (!Number.isFinite(gen1) || gen1 <= 0) return null;

  const investment = investMthb * 1_000_000;
  const price = numOrNull(ctx.sectionData.elec_price_thb_kwh) ?? FIN_DEFAULTS.price;
  const discountPct = numOrNull(ctx.sectionData.discount_rate_pct) ?? FIN_DEFAULTS.discount;
  const om = numOrNull(ctx.sectionData.om_cost_thb_year)
    ?? Math.round(investment * (FIN_DEFAULTS.omPctOfInvestment / 100));
  const omStart = numOrNull(ctx.sectionData.om_start_year) ?? FIN_DEFAULTS.omStart;
  const lifetime = numOrNull(ctx.sectionData.lifetime_years) ?? FIN_DEFAULTS.lifetime;
  const scrap = numOrNull(ctx.sectionData.scrap_value_thb)
    ?? Math.round(investment * (FIN_DEFAULTS.scrapPct / 100));
  const degradation = numOrNull(ctx.sectionData.degradation_pct) ?? 0;

  const gens = generationForecast(gen1, degradation, lifetime);
  const r = discountPct / 100;
  const rows: FinancialRow[] = [{
    year: 0, discount_factor: 1, generation_kwh: null,
    benefit_thb: 0, cost_thb: investment, snpv_thb: -investment, cum_snpv_thb: -investment,
  }];
  let cum = -investment;
  for (let y = 1; y <= lifetime; y++) {
    const df = 1 / Math.pow(1 + r, y);
    const gen = gens[y - 1];
    const benefit = gen * price + (y === lifetime ? scrap : 0) + (extraBenefit ? extraBenefit(y, gen) : 0);
    const cost = y >= omStart ? om : 0;
    const snpv = (benefit - cost) * df;
    cum += snpv;
    rows.push({ year: y, discount_factor: df, generation_kwh: gen, benefit_thb: benefit, cost_thb: cost, snpv_thb: snpv, cum_snpv_thb: cum });
  }

  const flows = rows.map((row) => row.benefit_thb - row.cost_thb);
  // Undiscounted payback, interpolated within the crossing year.
  let payback: number | null = null;
  let running = 0;
  for (let y = 0; y < flows.length; y++) {
    const next = running + flows[y];
    if (running < 0 && next >= 0) { payback = y - 1 + -running / flows[y]; break; }
    running = next;
  }

  return {
    rows, investment_thb: investment, price_thb_kwh: price, discount_rate_pct: discountPct,
    om_cost_thb_year: om, om_start_year: omStart, lifetime_years: lifetime, scrap_thb: scrap,
    totals: {
      benefit_thb: rows.reduce((s, row) => s + row.benefit_thb, 0),
      cost_thb: rows.reduce((s, row) => s + row.cost_thb, 0),
      npv_thb: cum,
    },
    irr_pct: irrFromFlows(flows),
    payback_years: payback,
  };
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
