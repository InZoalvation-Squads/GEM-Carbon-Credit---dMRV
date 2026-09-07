import { describe, it, expect } from 'vitest';
import {
  parseSites, isBundle, sumSiteCapacityKwp, sumSiteYear1Kwh, siteGenerationMatrix,
} from './pdd-sites';
import { demoPdds } from '../test/demoFixtures';

describe('isBundle', () => {
  it('is false when sites is absent, empty, or not an array', () => {
    expect(isBundle({})).toBe(false);
    expect(isBundle({ sites: [] })).toBe(false);
    expect(isBundle({ sites: 'nope' })).toBe(false);
  });
  it('is true when sites has at least one row', () => {
    expect(isBundle({ sites: [{ owner: 'A' }] })).toBe(true);
  });
});

describe('parseSites', () => {
  it('returns an empty array for non-array input', () => {
    expect(parseSites(undefined)).toEqual([]);
    expect(parseSites('nope')).toEqual([]);
  });

  it('coerces numeric columns and preserves text columns', () => {
    const rows = parseSites([
      { owner: 'บริษัท A จำกัด', address: 'สมุทรสาคร', coordinates: '13.57, 100.35',
        kwp: '261.6', year1_kwh: '325326', first_sync_year: '2569',
        degradation_pct: '0.55', maintenance_per_year: '4', project_id: '' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      owner: 'บริษัท A จำกัด', address: 'สมุทรสาคร', coordinates: '13.57, 100.35',
      kwp: 261.6, year1_kwh: 325326, first_sync_year: 2569,
      degradation_pct: 0.55, maintenance_per_year: 4, project_id: null,
    });
  });

  it('maps blank and unparseable numbers to null rather than 0 or NaN', () => {
    const rows = parseSites([{ owner: 'B', kwp: '', year1_kwh: 'abc', first_sync_year: null }]);
    expect(rows[0].kwp).toBeNull();
    expect(rows[0].year1_kwh).toBeNull();
    expect(rows[0].first_sync_year).toBeNull();
  });
});

// Reference PDD ตารางที่ 1 (p.7): six sites, 2,009.30 kWp / 2,499,410 kWh.
// year1_kwh is each site's output in its OWN first synchronisation year, which
// is what ตารางที่ 1 totals — not the calendar-2570 column on p.31, whose sites
// have already been degrading for up to two years by then.
const REF_TABLE1 = [
  { owner: 'บริษัท A จำกัด', kwp: 261.6, year1_kwh: 327126 },
  { owner: 'บริษัท B จำกัด', kwp: 249.61, year1_kwh: 377445 },
  { owner: 'บริษัท C จำกัด', kwp: 234.895, year1_kwh: 290279 },
  { owner: 'บริษัท D จำกัด', kwp: 311.605, year1_kwh: 355673 },
  { owner: 'บริษัท E จำกัด', kwp: 351.0, year1_kwh: 393567 },
  { owner: 'บริษัท F จำกัด', kwp: 600.59, year1_kwh: 755320 },
];

describe('sumSiteCapacityKwp', () => {
  it('reproduces the reference PDD total installed capacity', () => {
    expect(sumSiteCapacityKwp(parseSites(REF_TABLE1))).toBe(2009.3);
  });
  it('returns null when no row carries a capacity', () => {
    expect(sumSiteCapacityKwp(parseSites([{ owner: 'A' }]))).toBeNull();
  });
  it('sums only the rows that have a capacity', () => {
    expect(sumSiteCapacityKwp(parseSites([{ kwp: 10 }, { owner: 'no kwp' }]))).toBe(10);
  });
});

describe('sumSiteYear1Kwh', () => {
  it('reproduces the reference PDD total year-1 generation', () => {
    expect(sumSiteYear1Kwh(parseSites(REF_TABLE1))).toBe(2499410);
  });
  it('returns null when no row carries a year-1 figure', () => {
    expect(sumSiteYear1Kwh(parseSites([{ owner: 'A' }]))).toBeNull();
  });
});

// Reference PDD p.31: per-site kWh across the 7-year crediting period
// (Buddhist years 2570–2576). Sites B and F synchronised in 2568 and have
// already degraded two years by the time crediting starts; site D starts in
// 2570. Site D degrades at 0.60%/yr, every other site at 0.55%/yr.
const REF_P31_SITES = [
  { owner: 'A', year1_kwh: 327126, first_sync_year: 2569, degradation_pct: 0.55 },
  { owner: 'B', year1_kwh: 377445, first_sync_year: 2568, degradation_pct: 0.55 },
  { owner: 'C', year1_kwh: 290279, first_sync_year: 2569, degradation_pct: 0.55 },
  { owner: 'D', year1_kwh: 355673, first_sync_year: 2570, degradation_pct: 0.60 },
  { owner: 'E', year1_kwh: 393567, first_sync_year: 2569, degradation_pct: 0.55 },
  { owner: 'F', year1_kwh: 755320, first_sync_year: 2568, degradation_pct: 0.55 },
];

const REF_P31_EXPECTED: Record<string, number[]> = {
  A: [325326, 323537, 321758, 319988, 318228, 316478, 314737],
  B: [373305, 371252, 369210, 367179, 365160, 363151, 361154],
  C: [288682, 287094, 285515, 283945, 282383, 280830, 279286],
  D: [355673, 353539, 351418, 349309, 347214, 345130, 343059],
  E: [391402, 389250, 387109, 384980, 382862, 380757, 378662],
  F: [747034, 742926, 738840, 734776, 730735, 726716, 722719],
};
const REF_P31_TOTALS = [2481423, 2467598, 2453850, 2440177, 2426582, 2413062, 2399618];

describe('siteGenerationMatrix', () => {
  // The published table is not exactly reproducible: it came from a spreadsheet
  // whose year-1 figures are themselves rounded, so any clean model differs by
  // ~1 kWh on scattered cells. ±2 per cell validates the staggering model
  // without encoding another tool's float noise as a requirement.
  it('reproduces the reference PDD page-31 table within ±2 kWh per cell', () => {
    const m = siteGenerationMatrix(parseSites(REF_P31_SITES), 2570, 7, 0.4);
    expect(m.years).toEqual([2570, 2571, 2572, 2573, 2574, 2575, 2576]);
    for (const row of m.rows) {
      const expected = REF_P31_EXPECTED[row.site.owner];
      row.generation.forEach((got, i) => {
        expect(Math.abs(got - expected[i])).toBeLessThanOrEqual(2);
      });
    }
  });

  it('reproduces the reference PDD yearly totals within ±5 kWh', () => {
    const m = siteGenerationMatrix(parseSites(REF_P31_SITES), 2570, 7, 0.4);
    m.totals.forEach((got, i) => {
      expect(Math.abs(got - REF_P31_TOTALS[i])).toBeLessThanOrEqual(5);
    });
  });

  it('degrades a late-starting site from its own first year, not the period start', () => {
    const m = siteGenerationMatrix(
      parseSites([{ owner: 'D', year1_kwh: 355673, first_sync_year: 2570, degradation_pct: 0.6 }]),
      2570, 2, 0.4,
    );
    expect(m.rows[0].generation[0]).toBe(355673);
  });

  it('falls back to the bundle degradation rate when a site omits its own', () => {
    const m = siteGenerationMatrix(
      parseSites([{ owner: 'X', year1_kwh: 100000, first_sync_year: 2570 }]),
      2570, 2, 10,
    );
    expect(m.rows[0].generation[1]).toBe(90000);
  });

  it('treats a site with no first_sync_year as starting at the period start', () => {
    const m = siteGenerationMatrix(
      parseSites([{ owner: 'X', year1_kwh: 1000 }]), 2570, 1, 0,
    );
    expect(m.rows[0].generation[0]).toBe(1000);
  });

  it('contributes zero for years before a site synchronises', () => {
    const m = siteGenerationMatrix(
      parseSites([{ owner: 'late', year1_kwh: 1000, first_sync_year: 2572 }]),
      2570, 3, 0,
    );
    expect(m.rows[0].generation).toEqual([0, 0, 1000]);
    expect(m.totals).toEqual([0, 0, 1000]);
  });

  it('reports zero rather than null for a site with no year-1 figure', () => {
    const m = siteGenerationMatrix(parseSites([{ owner: 'blank' }]), 2570, 2, 0.4);
    expect(m.rows[0].generation).toEqual([0, 0]);
  });
});

// The demo fixture doubles as executable documentation of the aggregated form:
// if someone edits a site row, these assertions say which published figure broke.
describe('aggregated demo fixture (PDD-2010)', () => {
  const sites = parseSites(
    (demoPdds.find((p) => p.id === 'PDD-2010')!.section_data as Record<string, unknown>).sites,
  );

  it('carries the six sites of the reference project', () => {
    expect(sites).toHaveLength(6);
    expect(sites.every((s) => s.kwp !== null && s.year1_kwh !== null)).toBe(true);
  });

  it('sums to the published ตารางที่ 1 totals', () => {
    expect(sumSiteCapacityKwp(sites)).toBe(2009.3);
    expect(sumSiteYear1Kwh(sites)).toBe(2499410);
  });

  it('reproduces the published page-31 forecast for calendar 2570', () => {
    // Crediting starts 2027 CE = 2570 BE. Sites B and F have been degrading
    // since 2568, so the first column is below the ตารางที่ 1 total above.
    const m = siteGenerationMatrix(sites, 2570, 7, 0.55);
    expect(Math.abs(m.totals[0] - 2481423)).toBeLessThanOrEqual(5);
    expect(Math.abs(m.totals[6] - 2399618)).toBeLessThanOrEqual(5);
  });

  it('keeps per-site degradation — site D differs from the rest', () => {
    const d = sites.find((s) => s.owner.includes('D'))!;
    expect(d.degradation_pct).toBe(0.6);
    expect(sites.filter((s) => s.degradation_pct === 0.55)).toHaveLength(5);
  });
});

// The editable twin of PDD-2010. Its value is that a user can add or remove a
// site row and watch every total move — so what matters is that the rows are
// live data, and that editing them cannot reach back into the registered PDD.
describe('aggregated demo draft (PDD-2011)', () => {
  const draft = () => demoPdds.find((p) => p.id === 'PDD-2011')!;

  it('is an editable draft carrying the same six sites', () => {
    expect(draft().state).toBe('draft');
    expect(draft().content_hash).toBeNull();
    expect(parseSites((draft().section_data as Record<string, unknown>).sites)).toHaveLength(6);
  });

  it('does not share its site rows with the registered PDD-2010', () => {
    const registered = demoPdds.find((p) => p.id === 'PDD-2010')!;
    const draftSites = (draft().section_data as Record<string, unknown>).sites;
    const regSites = (registered.section_data as Record<string, unknown>).sites;
    // Same values, different arrays: mutating the draft must never alter a
    // registered PDD whose content hash is already frozen.
    expect(draftSites).toEqual(regSites);
    expect(draftSites).not.toBe(regSites);
    expect((draftSites as unknown[])[0]).not.toBe((regSites as unknown[])[0]);
  });

  it('recalculates totals when a site row is dropped', () => {
    const all = parseSites((draft().section_data as Record<string, unknown>).sites);
    const without = all.slice(0, 5);
    expect(sumSiteCapacityKwp(all)).toBe(2009.3);
    expect(sumSiteCapacityKwp(without)).toBe(1408.71);   // less บริษัท F (600.590)
    expect(sumSiteYear1Kwh(without)).toBe(1744090);      // less 755,320
  });
});
