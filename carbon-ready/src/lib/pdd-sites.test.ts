import { describe, it, expect } from 'vitest';
import { parseSites, isBundle, sumSiteCapacityKwp, sumSiteYear1Kwh } from './pdd-sites';

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
