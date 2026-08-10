// New-PDD prefill: methodology-standard defaults and clone-from-previous-project.
// Deterministic only — a value appears here when the methodology standard fixes
// it, never as a guess at a project-specific fact (real-data-only rule). A select
// field left with exactly one option is treated the same way: the standard has
// already fixed the choice, so there is nothing project-specific left to guess.
import type { Methodology } from '../types';

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
