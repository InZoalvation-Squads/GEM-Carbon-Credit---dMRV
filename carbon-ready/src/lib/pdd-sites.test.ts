import { describe, it, expect } from 'vitest';
import { parseSites, isBundle } from './pdd-sites';

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
