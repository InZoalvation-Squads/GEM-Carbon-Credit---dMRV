// I-REC(E) fee schedule as data — transcribed from the memo "Fee Structure
// I-REC(E) 2026" v2.1, archived at
// docs/reference/rec/egat-fee-structure-2026-v2.1.pdf. Fees change yearly:
// replace this file (and archive the new PDF) when EGAT/Evident publish a new
// FN-01. Never estimate — every value below is printed in the PDF.

export type RecIssuanceType = 'Normal' | 'Self consumption';

export interface RecFeeSchedule {
  version: string;
  source_pdf: string;
  /** p.4 EGAT — one-time facility registration, 5-year validity (THB). */
  registration_thb: { ge_3mw: number; ge_1mw: number; below_1mw: number };
  registration_validity_years: number;
  /** p.4 EGAT — "Facility renewal fee after 5-year validity: 40% of registr. fee". */
  renewal_pct_of_registration: number;
  /** p.4 EGAT — issuance fee per MWh (THB). */
  issuance_thb_per_mwh: Record<RecIssuanceType, number>;
  /** p.1 Participant fees — one-time trade-account opening (EUR). */
  account_opening_eur: number;
  /** p.1 Participant fees — annual account fee, on opening and each anniversary (EUR). */
  account_annual_eur: number;
}

export const REC_FEES: RecFeeSchedule = {
  version: 'FN-01 2026 v2.1',
  source_pdf: 'docs/reference/rec/egat-fee-structure-2026-v2.1.pdf',
  registration_thb: { ge_3mw: 38_000, ge_1mw: 19_000, below_1mw: 3_800 },
  registration_validity_years: 5,
  renewal_pct_of_registration: 40,
  issuance_thb_per_mwh: { Normal: 0.95, 'Self consumption': 1.33 },
  account_opening_eur: 500,
  account_annual_eur: 2_000,
};

/**
 * EGAT facility registration fee for a capacity. Tiers read "3MW or greater",
 * "1MW or greater and less than 3MW", so boundaries use ≥. The ฿0 tier is
 * "less than 250kW with approved method of digital meter reading access".
 */
export function registrationFeeThb(capacityKwp: number, digitalMeterExempt: boolean): number {
  if (capacityKwp >= 3_000) return REC_FEES.registration_thb.ge_3mw;
  if (capacityKwp >= 1_000) return REC_FEES.registration_thb.ge_1mw;
  if (capacityKwp < 250 && digitalMeterExempt) return 0;
  return REC_FEES.registration_thb.below_1mw;
}
