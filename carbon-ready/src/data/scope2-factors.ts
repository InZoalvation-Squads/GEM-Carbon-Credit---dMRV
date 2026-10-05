// Grid emission factors for an ORGANISATION's location-based Scope 2 (purchased
// electricity). Deliberately separate from the emission-factor registry, which
// feeds T-VER project calculations and registered PDDs — a different factor
// with different rules. Add a row when the authority publishes a new value;
// never estimate. Spec: docs/superpowers/specs/2026-10-06-investor-report-design.md §2.

export interface Scope2Factor {
  country: string;            // ISO code as locationToCountryCode returns it
  source: string;             // publishing authority
  value_kg_per_kwh: number;   // kgCO2e/kWh (= tCO2e/MWh)
  effective_date: string;     // ISO date the factor applies from
  source_url: string;
  note: string;
}

export const SCOPE2_FACTORS: Scope2Factor[] = [
  {
    country: 'TH', source: 'TGO', value_kg_per_kwh: 0.475, effective_date: '2026-01-01',
    source_url: 'https://www.nationthailand.com/news/policy/40059019',
    note: 'TGO Scope 2 factor for purchased electricity incl. T&D losses; previous factors allowed until 2026-03-31.',
  },
];

/** Newest factor for the country with effective_date <= isoDate, else null. */
export function scope2FactorFor(country: string, isoDate: string): Scope2Factor | null {
  return SCOPE2_FACTORS
    .filter((f) => f.country === country && f.effective_date <= isoDate)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0] ?? null;
}
