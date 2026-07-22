import { describe, it, expect } from 'vitest';
import { isFieldVisible, validatePdd, resolveComputed, pddContentHash, splitDisclosure, saltedValueHash, verifyDisclosedValue } from './pdd';
import type { Methodology, Project, EmissionFactor } from '../types';

const METH: Methodology = {
  id: 'meth-1', code: 'T-VER-S-01', name: 'Solar', standard: 'T-VER',
  version: 'v1.0', sectoral_scope: 'Energy', status: 'active',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['commissioning_report'], monitoring_params: [],
  pdd_sections: [
    { key: 'a', title: 'A', fields: [
      { key: 'technology', label: 'Technology', type: 'select', options: ['PV'], required: true },
      { key: 'capacity_kwp', label: 'Capacity', type: 'computed', source: 'capacity_kwp', required: false, unit: 'kWp' },
    ] },
    { key: 'c', title: 'C', fields: [
      { key: 'barrier_type', label: 'Barrier', type: 'select', options: ['Investment', 'Technological'], required: true },
      { key: 'investment_metric', label: 'Metric', type: 'select', options: ['IRR'], required: true,
        showIf: { field: 'barrier_type', equals: 'Investment' } },
    ] },
  ],
};

const PROJECT: Project = {
  id: 'prj-1', organization_id: 'org-1', name: 'P', location: 'Bangkok, Thailand',
  capacity_kwp: 820, commission_date: '2024-11-01', status: 'active',
  lifecycle_stage: 'pdd_draft', created_at: '', updated_at: '',
};
const FACTORS: EmissionFactor[] = [
  { id: 'ef-th', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.51,
    effective_date: '2024-01-01', version: 1, is_current: true, created_at: '' },
];

describe('isFieldVisible', () => {
  it('shows unconditional fields', () => {
    expect(isFieldVisible(METH.pdd_sections[0].fields[0], {})).toBe(true);
  });
  it('hides a showIf field until its driver matches', () => {
    const metric = METH.pdd_sections[1].fields[1];
    expect(isFieldVisible(metric, { barrier_type: 'Technological' })).toBe(false);
    expect(isFieldVisible(metric, { barrier_type: 'Investment' })).toBe(true);
  });
});

describe('validatePdd', () => {
  it('reports required fields that are missing', () => {
    const res = validatePdd(METH, {});
    expect(res.ok).toBe(false);
    expect(res.missing.map((m) => m.field)).toContain('technology');
    expect(res.missing.map((m) => m.field)).toContain('barrier_type');
  });
  it('ignores hidden conditional fields but requires them once visible', () => {
    const base = { technology: 'PV', barrier_type: 'Technological' };
    expect(validatePdd(METH, base).ok).toBe(true);
    const inv = { technology: 'PV', barrier_type: 'Investment' };
    expect(validatePdd(METH, inv).ok).toBe(false);
    expect(validatePdd(METH, { ...inv, investment_metric: 'IRR' }).ok).toBe(true);
  });
  it('never requires computed fields', () => {
    const res = validatePdd(METH, { technology: 'PV', barrier_type: 'Technological' });
    expect(res.missing.map((m) => m.field)).not.toContain('capacity_kwp');
  });
});

describe('resolveComputed', () => {
  const ctx = { project: PROJECT, factors: FACTORS, sectionData: { performance_ratio: 0.8 } };
  it('returns capacity from the project', () => {
    expect(resolveComputed('capacity_kwp', ctx)).toBe(820);
  });
  it('returns the current grid factor for the project country', () => {
    expect(resolveComputed('grid_factor', ctx)).toBe(0.51);
  });
  it('estimates annual reduction in tCO2e (> 0)', () => {
    const er = resolveComputed('er_estimate', ctx) as number;
    expect(er).toBeCloseTo(488.458, 2);
  });
});

describe('pddContentHash', () => {
  it('is stable for equal input and changes when data changes', () => {
    const h1 = pddContentHash({ methodology_snapshot: 'T-VER-S-01 v1.0', section_data: { a: 1 }, evidence_ids: ['e1'] });
    const h2 = pddContentHash({ methodology_snapshot: 'T-VER-S-01 v1.0', section_data: { a: 1 }, evidence_ids: ['e1'] });
    const h3 = pddContentHash({ methodology_snapshot: 'T-VER-S-01 v1.0', section_data: { a: 2 }, evidence_ids: ['e1'] });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
  it('is order-independent in evidence_ids', () => {
    const a = pddContentHash({ methodology_snapshot: 'm', section_data: { a: 1 }, evidence_ids: ['e2', 'e1'] });
    const b = pddContentHash({ methodology_snapshot: 'm', section_data: { a: 1 }, evidence_ids: ['e1', 'e2'] });
    expect(a).toBe(b);
  });
});

describe('splitDisclosure', () => {
  const dm = {
    pdd_sections: [{
      key: 's1', title: 'S1',
      fields: [
        { key: 'technology', label: 'Tech', type: 'text', required: true },
        { key: 'barrier_explanation', label: 'Barrier', type: 'textarea', required: true, sensitive: true },
        { key: 'investment_metric', label: 'Metric', type: 'select', required: true, sensitive: true, showIf: { field: 'barrier_type', equals: 'Investment' } },
        { key: 'grid_factor', label: 'GF', type: 'computed', source: 'grid_factor', required: false },
      ],
    }],
  } as unknown as Methodology;

  it('discloses public fields and redacts sensitive ones with a deterministic hash', () => {
    const data = { technology: 'Solar PV', barrier_explanation: 'IRR below hurdle rate', barrier_type: 'Technological' };
    const r = splitDisclosure(dm, data);
    expect(r.disclosed.technology).toBe('Solar PV');
    expect(r.disclosed.barrier_explanation).toBeUndefined();
    expect(r.redacted).toEqual([{ key: 'barrier_explanation', value_hash: saltedValueHash('', 'IRR below hurdle rate') }]);
  });

  it('a sensitive field hidden by showIf appears in neither list', () => {
    const data = { technology: 'Solar PV', barrier_explanation: 'x', barrier_type: 'Technological', investment_metric: 'IRR' };
    const r = splitDisclosure(dm, data);
    expect(r.redacted.map((x) => x.key)).toEqual(['barrier_explanation']);
    expect(r.disclosed.investment_metric).toBeUndefined();
  });

  it('skips computed and empty fields', () => {
    const r = splitDisclosure(dm, { technology: '', barrier_explanation: 'x' });
    expect(r.disclosed.technology).toBeUndefined();
    expect(r.disclosed.grid_factor).toBeUndefined();
  });

  describe('salted selective disclosure', () => {
    const data = { technology: 'Solar PV', barrier_type: 'Investment', investment_metric: 'IRR 4.2%' };

    it('redacts with a per-field salt so equal values hash differently across salts', () => {
      const a = splitDisclosure(dm, data, { investment_metric: 'aa'.repeat(16) });
      const b = splitDisclosure(dm, data, { investment_metric: 'bb'.repeat(16) });
      const hashOf = (r: typeof a) => r.redacted.find((x) => x.key === 'investment_metric')!.value_hash;
      expect(hashOf(a)).not.toBe(hashOf(b));
    });

    it('verifies a disclosed value against hash+salt, and rejects a tampered value', () => {
      const salts = { investment_metric: 'ab'.repeat(16) };
      const split = splitDisclosure(dm, data, salts);
      const r = split.redacted.find((x) => x.key === 'investment_metric')!;
      expect(verifyDisclosedValue('IRR 4.2%', salts.investment_metric, r.value_hash)).toBe(true);
      expect(verifyDisclosedValue('IRR 9.9%', salts.investment_metric, r.value_hash)).toBe(false);
    });
  });
});
