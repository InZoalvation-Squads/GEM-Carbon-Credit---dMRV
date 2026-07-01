import { describe, it, expect } from 'vitest';
import { isFieldVisible, validatePdd, resolveComputed, pddContentHash } from './pdd';
import type { Methodology, Project, EmissionFactor } from '../types';

const METH: Methodology = {
  id: 'meth-1', code: 'T-VER-S-01', name: 'Solar', standard: 'T-VER',
  version: 'v1.0', sectoral_scope: 'Energy', status: 'active',
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
    expect(er).toBeGreaterThan(0);
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
});
