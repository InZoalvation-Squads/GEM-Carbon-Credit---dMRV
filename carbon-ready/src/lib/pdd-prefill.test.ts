import { describe, it, expect } from 'vitest';
import { buildDefaults } from './pdd-prefill';
import type { Methodology } from '../types';

/** Minimal methodology fixture — only what prefill logic reads. */
function meth(fields: Methodology['pdd_sections'][0]['fields']): Methodology {
  return {
    id: 'meth-test', code: 'TEST-01', name: 'Test', standard: 'T-VER', version: 'v1',
    sectoral_scope: 'Energy', status: 'active',
    calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
    required_evidence: [], monitoring_params: [],
    pdd_sections: [{ key: 's1', title: 'S1', fields }],
  };
}

describe('buildDefaults', () => {
  it('seeds declared defaultValue', () => {
    const m = meth([
      { key: 'tech', label: 'Tech', type: 'select', options: ['A', 'B'], required: true, defaultValue: 'A' },
      { key: 'deg', label: 'Deg', type: 'number', required: true, defaultValue: 0.4 },
    ]);
    expect(buildDefaults(m)).toEqual({ tech: 'A', deg: 0.4 });
  });

  it('auto-defaults a select with exactly one option', () => {
    const m = meth([
      { key: 'only', label: 'Only', type: 'select', options: ['the-one'], required: true },
      { key: 'two', label: 'Two', type: 'select', options: ['x', 'y'], required: true },
    ]);
    expect(buildDefaults(m)).toEqual({ only: 'the-one' });
  });

  it('leaves fields without defaults untouched and skips computed', () => {
    const m = meth([
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'calc', label: 'Calc', type: 'computed', source: 'capacity_kwp', required: false },
    ]);
    expect(buildDefaults(m)).toEqual({});
  });
});
