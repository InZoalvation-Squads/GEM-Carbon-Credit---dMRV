import { describe, it, expect } from 'vitest';
import { parseMethodologyJson, methodologyToJson } from './methodology-schema';
import { seedMethodologies } from '../data/seed';

describe('methodology JSON schema v2', () => {
  it('accepts every bundled methodology (export → import parity)', () => {
    for (const m of seedMethodologies) {
      const r = parseMethodologyJson(methodologyToJson(m));
      expect(r.ok, `${m.code}: ${JSON.stringify(!r.ok && r.errors)}`).toBe(true);
    }
  });

  it('rejects calculation.input_param not present in monitoring_params', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.calculation.input_param = 'nope';
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects unit mismatch between calculation and its driver param', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.calculation.input_unit = 'bananas';
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects showIf pointing at a nonexistent field', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.pdd_sections[0].fields[0].showIf = { field: 'ghost', equals: 'x' };
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('rejects duplicate field keys across sections', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    const f = { ...bad.pdd_sections[0].fields[0] };
    bad.pdd_sections[bad.pdd_sections.length - 1].fields.push(f);
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });

  it('requires gwp_ch4 for ch4_avoidance and rejects it on other formulas', () => {
    // T-VER-W-01 (landfill gas) is the bundled ch4_avoidance methodology.
    const lfg = seedMethodologies.find((m) => m.calculation.formula === 'ch4_avoidance')!;
    const missing = JSON.parse(methodologyToJson(lfg));
    delete missing.calculation.gwp_ch4;
    expect(parseMethodologyJson(JSON.stringify(missing)).ok).toBe(false);

    // seedMethodologies[0] is grid_displacement — gwp_ch4 must not ride along.
    const stray = JSON.parse(methodologyToJson(seedMethodologies[0]));
    stray.calculation.gwp_ch4 = 28;
    expect(parseMethodologyJson(JSON.stringify(stray)).ok).toBe(false);
  });

  it('rejects wrong schema_version', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.schema_version = 1;
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });
});

describe('extended T-VER solar methodology (T-VER-S-F001-PDD)', () => {
  it('roundtrips through the JSON contract with the full official-form field set', () => {
    const solar = seedMethodologies.find((m) => m.code === 'T-VER-S-01')!;
    const res = parseMethodologyJson(methodologyToJson(solar));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
    if (res.ok) {
      expect(res.methodology.document_template).toBe('T-VER-S-F001-PDD');
      const keys = res.methodology.pdd_sections.flatMap((s) => s.fields.map((f) => f.key));
      for (const k of ['project_title_th', 'installations', 'consumers', 'crediting_years',
        'degradation_pct', 'preparer_name', 'registered_elsewhere', 'ec_pj', 'er_annual']) {
        expect(keys, `missing field ${k}`).toContain(k);
      }
    }
  });
});

describe('schema v2 — table fields & document_template', () => {
  const baseDoc = () => JSON.parse(methodologyToJson(seedMethodologies[0]));

  it('accepts a table field with columns and a document_template', () => {
    const doc = baseDoc();
    doc.document_template = 'T-VER-S-F001-PDD';
    doc.pdd_sections[0].fields.push({
      key: 'test_table_field', label: 'Installations', type: 'table', required: false,
      columns: [
        { key: 'building', label: 'Building', type: 'text' },
        { key: 'kwp', label: 'Capacity', type: 'number', unit: 'kWp' },
      ],
    });
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
  });

  it('rejects a table field without columns', () => {
    const doc = baseDoc();
    doc.pdd_sections[0].fields.push({ key: 't', label: 'T', type: 'table', required: false });
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });

  it('rejects columns on a non-table field', () => {
    const doc = baseDoc();
    doc.pdd_sections[0].fields.push({
      key: 't', label: 'T', type: 'text', required: false,
      columns: [{ key: 'c', label: 'C', type: 'text' }],
    });
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });

  it('rejects an unknown document_template', () => {
    const doc = baseDoc();
    doc.document_template = 'NOT-A-FORM';
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });

  it('accepts the new computed sources', () => {
    const doc = baseDoc();
    for (const source of ['annual_generation', 'ec_pj', 'be_annual', 'pe_annual', 'er_annual']) {
      doc.pdd_sections[0].fields.push({ key: `c_${source}`, label: source, type: 'computed', required: false, source });
    }
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok, JSON.stringify(!res.ok && res.errors)).toBe(true);
  });
});
