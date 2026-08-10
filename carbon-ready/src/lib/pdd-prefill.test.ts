import { describe, it, expect } from 'vitest';
import { buildDefaults, cloneableData, buildPrefill } from './pdd-prefill';
import type { Methodology, PddFieldSchema } from '../types';

/** Minimal methodology fixture — only what prefill logic reads. */
function meth(fields: PddFieldSchema[]): Methodology {
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

describe('cloneableData', () => {
  const m = meth([
    { key: 'preparer_name', label: 'Preparer', type: 'text', required: true },
    { key: 'project_title_th', label: 'Title', type: 'text', required: true, siteSpecific: true },
    { key: 'capacity', label: 'Cap', type: 'computed', source: 'capacity_kwp', required: false },
    { key: 'before_project', label: 'Before', type: 'textarea', required: false },
    { key: 'note', label: 'Note', type: 'text', required: false },
  ]);

  it('copies plain fields, skips siteSpecific / computed / draftable / unknown keys / empty values', () => {
    const source = {
      preparer_name: 'สมชาย',
      project_title_th: 'ไซต์เก่า',       // siteSpecific → dropped
      capacity: 999,                      // computed → dropped
      before_project: 'ข้อความไซต์เก่า',   // draftableKeys → dropped
      ghost_field: 'x',                   // not in schema → dropped
      note: '',                           // empty → dropped
    };
    expect(cloneableData(m, source)).toEqual({ preparer_name: 'สมชาย' });
  });

  it('deep-copies a non-empty table value and drops an empty one', () => {
    const mt = meth([
      { key: 'tbl', label: 'Table', type: 'table', required: false, columns: [{ key: 'name', label: 'Name', type: 'text' }] },
      { key: 'empty_tbl', label: 'Empty Table', type: 'table', required: false, columns: [{ key: 'name', label: 'Name', type: 'text' }] },
    ]);
    const source = {
      tbl: [{ name: 'row1' }],
      empty_tbl: [],
    };
    const out = cloneableData(mt, source);
    expect(out).toEqual({ tbl: [{ name: 'row1' }] });
    expect(out.tbl).not.toBe(source.tbl);
  });
});

describe('buildPrefill', () => {
  it('overlays clone data on defaults — clone wins, defaults fill the rest', () => {
    const m2 = meth([
      { key: 'tech', label: 'Tech', type: 'select', options: ['A', 'B'], required: true, defaultValue: 'A' },
      { key: 'freq', label: 'Freq', type: 'select', options: ['M', 'Q'], required: true, defaultValue: 'M' },
    ]);
    expect(buildPrefill(m2, { tech: 'B' })).toEqual({ tech: 'B', freq: 'M' });
    expect(buildPrefill(m2)).toEqual({ tech: 'A', freq: 'M' });
  });
});
