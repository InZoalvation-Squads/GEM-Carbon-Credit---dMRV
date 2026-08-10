// New-PDD prefill: methodology-standard defaults and clone-from-previous-project.
// Deterministic only — a value appears here when the methodology standard fixes
// it, never as a guess at a project-specific fact (real-data-only rule). A select
// field left with exactly one option is treated the same way: the standard has
// already fixed the choice, so there is nothing project-specific left to guess.
import type { Methodology } from '../types';
import { draftableKeys } from './pdd-drafts';

/** Seed values for a brand-new PDD: declared defaultValue, plus any select with a single option. */
export function buildDefaults(m: Methodology): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of m.pdd_sections) {
    for (const f of section.fields) {
      if (f.type === 'computed') continue;
      // showIf visibility is intentionally ignored here: hidden conditional fields
      // still get seeded and simply stay dormant until their driver field reveals them.
      if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
      else if (f.type === 'select' && f.options?.length === 1) out[f.key] = f.options[0];
    }
  }
  return out;
}

/**
 * Fields safe to carry over from another project's PDD of the same methodology.
 * Dropped: computed (recomputed from the new site), siteSpecific facts, draftable
 * prose (embeds the old site's name/address — user re-drafts instead), keys the
 * current schema doesn't know, and empty values.
 */
export function cloneableData(m: Methodology, source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of m.pdd_sections) {
    for (const f of section.fields) {
      if (f.type === 'computed' || f.siteSpecific) continue;
      if ((draftableKeys as readonly string[]).includes(f.key)) continue;
      const v = source[f.key];
      const empty = v === undefined || v === null || v === ''
        || (Array.isArray(v) && v.length === 0);
      if (empty) continue;
      // Deep-copy so the clone owns its data: mutating a cloned table row must
      // never reach back into the source project's PDD (audit-trail integrity).
      out[f.key] = structuredClone(v);
    }
  }
  return out;
}

/** Prefill for a brand-new PDD: standard defaults, overlaid by clone data when a source is given. */
export function buildPrefill(m: Methodology, source?: Record<string, unknown>): Record<string, unknown> {
  const out = buildDefaults(m);
  if (source) Object.assign(out, cloneableData(m, source));
  return out;
}
