// Aggregated-PDD (แบบควบรวม) site rows and their aggregation.
// Sites live as a `sites` table field in section_data rather than as separate
// Project records; each row carries a nullable project_id as the seam for
// promoting a site to a real Project later. All bundle logic lives here so
// pdd.ts only gains thin fallback branches.

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
