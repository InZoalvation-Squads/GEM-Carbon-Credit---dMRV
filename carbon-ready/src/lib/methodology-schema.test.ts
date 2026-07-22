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
