import { describe, it, expect } from 'vitest';
import { SCOPE2_FACTORS, scope2FactorFor } from './scope2-factors';

describe('Scope 2 grid factors (organisation reporting, not the T-VER project EF)', () => {
  it('carries TGO 2026 for Thailand with its source', () => {
    const th = SCOPE2_FACTORS.find((f) => f.country === 'TH' && f.source === 'TGO')!;
    expect(th.value_kg_per_kwh).toBe(0.475);
    expect(th.effective_date).toBe('2026-01-01');
    expect(th.source_url).toBe('https://www.nationthailand.com/news/policy/40059019');
  });

  it('picks the newest factor in effect on the given date', () => {
    expect(scope2FactorFor('TH', '2026-06-30')?.value_kg_per_kwh).toBe(0.475);
    expect(scope2FactorFor('TH', '2026-01-01')?.value_kg_per_kwh).toBe(0.475);
  });

  it('returns null before any factor is in effect, or for another country', () => {
    expect(scope2FactorFor('TH', '2025-12-31')).toBeNull();
    expect(scope2FactorFor('IN', '2026-06-30')).toBeNull();
  });
});
