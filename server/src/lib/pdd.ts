// Copied from carbon-ready/src/lib/pdd.ts — source of truth until workspaces
// (Phase 1b). Deliberately NOT ported: resolveComputed/ComputeContext/gridFactor
// (computed fields arrive already resolved inside section_data from the client,
// and the grid-factor lookup is a UI concern). Everything below is verbatim.
import type { Methodology, PddFieldSchema } from './methodology-types.js';
import { canonical, shortHash } from './hash.js';

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

