import { describe, it, expect } from 'vitest';
import { hederaEnabled, hashscanTopicUrl, anchorMessageBytes } from './hedera.js';

describe('hederaEnabled', () => {
  it('requires both operator id and key', () => {
    expect(hederaEnabled({ HEDERA_OPERATOR_ID: '0.0.1', HEDERA_OPERATOR_KEY: 'k'.repeat(64) })).toBe(true);
    expect(hederaEnabled({ HEDERA_OPERATOR_ID: '0.0.1' })).toBe(false);
    expect(hederaEnabled({ HEDERA_OPERATOR_KEY: 'k'.repeat(64) })).toBe(false);
    expect(hederaEnabled({})).toBe(false);
  });
});

describe('hashscanTopicUrl', () => {
  it('points at the topic page (HashScan has no per-message route)', () => {
    expect(hashscanTopicUrl('testnet', '0.0.123')).toBe('https://hashscan.io/testnet/topic/0.0.123');
  });
});

describe('anchorMessageBytes', () => {
  it('serializes a compact JSON payload under the 1024-byte HCS limit', () => {
    const bytes = anchorMessageBytes({
      v: 1,
      kind: 'pdd_registration',
      credential_id: 'urn:vc:abcdef012345678901234567',
      package_hash: `sha256-${'a'.repeat(64)}`,
      project_id: 'prj-0001',
    });
    expect(bytes.length).toBeLessThan(1024);
    const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
    expect(parsed.kind).toBe('pdd_registration');
    expect(parsed.package_hash).toMatch(/^sha256-/);
  });
});

describe('fitHtsString', () => {
  it('truncates to 100 BYTES without splitting Thai UTF-8 characters', async () => {
    const { fitHtsString } = await import('./hedera.js');
    const thai = 'โครงการผลิตไฟฟ้าจากพลังงานแสงอาทิตย์แบบติดตั้งบนหลังคา สำหรับมหาวิทยาลัยราชภัฏหมู่บ้านจอมบึง';
    const out = fitHtsString(thai);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(100);
    expect(thai.startsWith(out)).toBe(true);
    expect(fitHtsString('short name')).toBe('short name');
  });
});

describe('server-side ER calculation (Guardian mint amount)', () => {
  it('reproduces the MCRU reference: avg ER 443 tCO2e/yr', async () => {
    const { computeYearlyTable } = await import('./pdd-calc.js');
    const table = computeYearlyTable({
      project: { location: 'Chom Bueng, Ratchaburi, Thailand', capacity_kwp: 667.2, commission_date: '2025-12-01' },
      factors: [{ country: 'TH', is_current: true, effective_date: '2025-01-01', factor_kgco2e_per_kwh: 0.4682 }],
      sectionData: {
        year1_generation_kwh: 963_915, degradation_pct: 0.4, crediting_years: '7',
        consumers: [{ kwh_year: 5_801.68 }],
      },
    });
    expect(table).not.toBeNull();
    expect(table!.avg.er).toBe(443);
    expect(table!.totals.er).toBe(3098);
  });
});
