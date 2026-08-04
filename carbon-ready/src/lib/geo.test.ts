import { describe, it, expect } from 'vitest';
import { locationToCountryCode } from './geo';

describe('locationToCountryCode', () => {
  it('maps English country names to codes', () => {
    expect(locationToCountryCode('Thailand')).toBe('TH');
    expect(locationToCountryCode('India')).toBe('IN');
    expect(locationToCountryCode('Vietnam')).toBe('VN');
  });

  it('recognizes a Thai-script address as Thailand', () => {
    // Projects created from the IoT registry carry free-text Thai addresses
    // with no comma and no English country segment.
    expect(locationToCountryCode('ถนนสุขุมวิท ตำบล เนินทราย อำเภอเมืองตราด ตราด 23000')).toBe('TH');
    expect(locationToCountryCode('ประเทศไทย')).toBe('TH');
    expect(locationToCountryCode('ไทย')).toBe('TH');
  });

  it('passes unknown Latin strings through unchanged', () => {
    expect(locationToCountryCode('Atlantis')).toBe('Atlantis');
  });
});
