import { describe, it, expect } from 'vitest';
import { REC_FEES, registrationFeeThb } from './rec-fees';

describe('REC_FEES — FN-01 2026 v2.1 (EGAT Local Issuer + Evident participant fees)', () => {
  it('carries its source', () => {
    expect(REC_FEES.version).toBe('FN-01 2026 v2.1');
    expect(REC_FEES.source_pdf).toBe('docs/reference/rec/egat-fee-structure-2026-v2.1.pdf');
  });

  it('issuance fee per MWh by request type', () => {
    expect(REC_FEES.issuance_thb_per_mwh.Normal).toBe(0.95);
    expect(REC_FEES.issuance_thb_per_mwh['Self consumption']).toBe(1.33);
  });

  it('participant account fees in EUR', () => {
    expect(REC_FEES.account_opening_eur).toBe(500);
    expect(REC_FEES.account_annual_eur).toBe(2000);
  });
});

describe('registrationFeeThb — capacity tiers use ≥ at the boundary', () => {
  it.each([
    [249.99, false, 3_800],
    [249.99, true, 0],      // <250 kW with EGAT-approved digital meter access
    [250, true, 3_800],     // exemption is strictly below 250 kW
    [999.99, false, 3_800],
    [1_000, false, 19_000],
    [2_999.99, false, 19_000],
    [3_000, false, 38_000],
    [45_000, true, 38_000], // exemption flag ignored above 250 kW
  ])('%s kWp (exempt=%s) → ฿%s', (kwp, exempt, fee) => {
    expect(registrationFeeThb(kwp, exempt)).toBe(fee);
  });
});
