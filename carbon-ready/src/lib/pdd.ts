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
      const empty = v === undefined || v === null || v === '';
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
    default: return null;
  }
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
 * Guardian-style selective disclosure: sensitive fields leave only a content hash.
 * `salts` maps field.key -> private hex salt; salted hashes are non-guessable while
 * the salt lets the owner prove the original value later (see verifyDisclosedValue).
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
