// Generation forecasting shared by the single-project and aggregated PDD paths.
// A leaf module: it imports nothing from lib/pdd.ts, so lib/pdd.ts and
// lib/pdd-sites.ts can both depend on it without forming an import cycle.

/**
 * Yearly kWh forecast exactly as the PEA/TGO appendix chains it: each year is
 * ROUNDED to whole kWh, then the next year degrades from that rounded value
 * (963,915 → 960,059 → … → 941,011; pure pow() drifts +1 kWh by year 5).
 */
export function generationForecast(gen1: number, degradationPct: number, years: number): number[] {
  const d = degradationPct / 100;
  const rows: number[] = [];
  let g = Math.round(gen1);
  for (let y = 1; y <= years; y++) {
    if (y > 1) g = Math.round(g * (1 - d));
    rows.push(g);
  }
  return rows;
}
