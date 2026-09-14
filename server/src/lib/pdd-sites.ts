// Copied from carbon-ready/src/lib/pdd-sites.ts — source of truth until workspaces
// (Phase 1b). Partial port: the site-row parser only. Deliberately NOT ported:
// sumSiteCapacityKwp / sumSiteYear1Kwh / siteGenerationMatrix (calc-engine
// concerns that arrive already resolved from the client). Everything below is verbatim.

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
