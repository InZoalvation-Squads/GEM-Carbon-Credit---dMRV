// New-PDD prefill: methodology-standard defaults and clone-from-previous-project.
// Deterministic only — a value appears here when the methodology standard fixes
// it, never as a guess at a project-specific fact (real-data-only rule).
import type { Methodology } from '../types';

/** Seed values for a brand-new PDD: declared defaultValue, plus any select with a single option. */
export function buildDefaults(m: Methodology): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of m.pdd_sections) {
    for (const f of section.fields) {
      if (f.type === 'computed') continue;
      if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
      else if (f.type === 'select' && f.options?.length === 1) out[f.key] = f.options[0];
    }
  }
  return out;
}
