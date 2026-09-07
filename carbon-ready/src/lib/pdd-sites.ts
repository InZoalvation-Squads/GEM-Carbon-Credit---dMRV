// Aggregated-PDD (แบบควบรวม) site rows and their aggregation.
// Sites live as a `sites` table field in section_data rather than as separate
// Project records; each row carries a nullable project_id as the seam for
// promoting a site to a real Project later. All bundle logic lives here so
// pdd.ts only gains thin fallback branches.

import { generationForecast } from './pdd-forecast';

export interface PddSite {
  owner: string;
  address: string;
  coordinates: string;
  kwp: number | null;
  year1_kwh: number | null;
  first_sync_year: number | null;
  degradation_pct: number | null;
  maintenance_per_year: number | null;
  project_id: string | null;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** Site rows from section_data.sites, with numeric columns coerced. */
export function parseSites(raw: unknown): PddSite[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((r) => ({
    owner: str(r.owner),
    address: str(r.address),
    coordinates: str(r.coordinates),
    kwp: num(r.kwp),
    year1_kwh: num(r.year1_kwh),
    first_sync_year: num(r.first_sync_year),
    degradation_pct: num(r.degradation_pct),
    maintenance_per_year: num(r.maintenance_per_year),
    project_id: r.project_id === undefined || r.project_id === null || r.project_id === ''
      ? null : String(r.project_id),
  }));
}

/** Bundle mode is on when at least one site row exists. */
export function isBundle(sectionData: Record<string, unknown>): boolean {
  return parseSites(sectionData.sites).length > 0;
}

/**
 * Σ of a numeric site column, or null when no row carries a value. Null rather
 * than 0 so an incomplete site table renders blank instead of publishing a
 * confidently wrong total (real-data-only rule).
 */
function sumColumn(sites: PddSite[], pick: (s: PddSite) => number | null): number | null {
  const values = sites.map(pick).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  // Round to 3 dp: kWp values carry 3 decimals and float addition drifts
  // (261.6 + 249.61 + … = 2009.3000000000002).
  return Math.round(values.reduce((a, b) => a + b, 0) * 1000) / 1000;
}

/** Total installed capacity across sites (ตารางที่ 1 รวม). */
export function sumSiteCapacityKwp(sites: PddSite[]): number | null {
  return sumColumn(sites, (s) => s.kwp);
}

/** Total year-1 generation across sites (ตารางที่ 1 รวม). */
export function sumSiteYear1Kwh(sites: PddSite[]): number | null {
  return sumColumn(sites, (s) => s.year1_kwh);
}

export interface SiteGenerationRow {
  site: PddSite;
  /** kWh per crediting year; 0 for years before the site synchronised. */
  generation: number[];
}

export interface SiteGenerationMatrix {
  /** Calendar (Buddhist) year labels, one per crediting year. */
  years: number[];
  rows: SiteGenerationRow[];
  /** Σ of all sites live in each year. */
  totals: number[];
}

/**
 * Per-site generation across the crediting period, each site degrading from its
 * own first-synchronisation year.
 *
 * A site that synchronised before the crediting period has already been
 * degrading: its year-1 figure is the output in its *own* first year, so by the
 * time crediting starts it is several years down the curve. A site that
 * synchronises mid-period contributes 0 until it comes online. This staggering
 * is what reproduces the reference PDD's page-31 table, where sites B and F run
 * two years ahead of the period and site D starts a year into it.
 *
 * Each site reuses generationForecast() — the same chained rounding the
 * single-project path uses — so bundle and single mode stay arithmetically
 * consistent.
 */
export function siteGenerationMatrix(
  sites: PddSite[],
  startYear: number,
  years: number,
  fallbackDegradationPct: number,
): SiteGenerationMatrix {
  const yearLabels = Array.from({ length: years }, (_, i) => startYear + i);
  const rows: SiteGenerationRow[] = sites.map((site) => {
    const gen1 = site.year1_kwh;
    if (gen1 === null) return { site, generation: new Array(years).fill(0) };
    const sync = site.first_sync_year ?? startYear;
    const d = site.degradation_pct ?? fallbackDegradationPct;
    // Forecast from the site's own sync year through the end of the period, so
    // a pre-period site arrives already degraded.
    const span = Math.max(0, startYear + years - sync);
    const series = generationForecast(gen1, d, span);
    const generation = yearLabels.map((y) => (y < sync ? 0 : series[y - sync] ?? 0));
    return { site, generation };
  });
  const totals = yearLabels.map((_, i) => rows.reduce((sum, r) => sum + r.generation[i], 0));
  return { years: yearLabels, rows, totals };
}
