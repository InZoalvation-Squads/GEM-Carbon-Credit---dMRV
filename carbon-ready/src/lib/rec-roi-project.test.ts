import { describe, it, expect } from 'vitest';
import type { Methodology, MonitoringRecord, ProjectDesignDocument, Project } from '../types';
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';
import { TVER_FORESTRY_METHODOLOGY, REC_SOLAR_METHODOLOGY } from '../data/methodologies';
import { EMPTY_REC_ROI_SETTINGS } from './rec-roi';
import { defaultProjectSetting, evaluateProjectRecRoi, projectEnergyBasis } from './rec-roi-project';

const METHODS = [TVER_SOLAR_METHODOLOGY, TVER_FORESTRY_METHODOLOGY] as Methodology[];

const project = (over: Partial<Project> = {}): Project => ({
  id: 'prj-a', organization_id: 'org', name: 'A', location: 'Bangkok, Thailand', capacity_kwp: 500,
  commission_date: '2025-01-01', status: 'active', lifecycle_stage: 'registered',
  created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z', ...over,
});

const pdd = (over: Partial<ProjectDesignDocument>): ProjectDesignDocument => ({
  id: 'PDD-a', project_id: 'prj-a', methodology_id: TVER_SOLAR_METHODOLOGY.id,
  methodology_snapshot: 'x', state: 'registered', section_data: {}, evidence_ids: [],
  assigned_validator_name: 'v', submitted_at: null, validated_at: null,
  content_hash: null, ipfs_cid: null, credential_id: null,
  ...over,
} as ProjectDesignDocument);

function daily(days: number, kwh: number): MonitoringRecord[] {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: days }, (_, i) => ({
    id: `m${i}`, project_id: 'prj-a', record_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    generation_kwh: kwh, source: 'csv', uploaded_at: '2026-01-01T00:00:00Z',
  }));
}

describe('projectEnergyBasis', () => {
  it('a kWh methodology with capacity is eligible, driver = its input_param', () => {
    expect(projectEnergyBasis(project(), [pdd({})], METHODS)).toEqual({ eligible: true, driverParam: 'EG_PJ' });
  });
  it('no PDD yet but capacity > 0 → eligible, unfiltered', () => {
    expect(projectEnergyBasis(project(), [], METHODS)).toEqual({ eligible: true, driverParam: undefined });
  });
  it('a REC-only project (SF-02 methodology) is eligible with the EG_PJ driver', () => {
    expect(projectEnergyBasis(project(), [pdd({ methodology_id: REC_SOLAR_METHODOLOGY.id })], [...METHODS, REC_SOLAR_METHODOLOGY]))
      .toEqual({ eligible: true, driverParam: 'EG_PJ' });
  });
  it('forestry (tCO₂e driver) or zero capacity → not eligible', () => {
    expect(projectEnergyBasis(project(), [pdd({ methodology_id: TVER_FORESTRY_METHODOLOGY.id })], METHODS).eligible).toBe(false);
    expect(projectEnergyBasis(project({ capacity_kwp: 0 }), [], METHODS).eligible).toBe(false);
  });
});

describe('evaluateProjectRecRoi', () => {
  const base = {
    project: project(), records: daily(92, 100), pdds: [pdd({})], methodologies: METHODS, factors: [],
    assumptions: { ...EMPTY_REC_ROI_SETTINGS, platform_fee_pct: 10, eur_thb: 40 },
  };

  it('computes annual MWh and both paths from measured data', () => {
    const r = evaluateProjectRecRoi(base);
    expect(r.eligible).toBe(true);
    expect(r.annual.status === 'ok' && r.annual.annual_mwh).toBeCloseTo(36.5, 9);
    expect(r.roi?.platform.status).toBe('ok');
    expect(r.setting).toEqual(defaultProjectSetting('prj-a'));
  });

  it('no records → no ROI, no uplift', () => {
    const r = evaluateProjectRecRoi({ ...base, records: [] });
    expect(r.annual).toEqual({ status: 'no_data' });
    expect(r.roi).toBeNull();
    expect(r.uplift).toBeNull();
  });

  it('investment comes from the PDD first, then the manual setting', () => {
    const fromPdd = evaluateProjectRecRoi({ ...base, pdds: [pdd({ section_data: { investment_mthb: 8 } })] });
    expect(fromPdd.investment_source).toBe('pdd');
    expect(fromPdd.investment_mthb).toBe(8);
    const manual = evaluateProjectRecRoi({
      ...base, setting: { ...defaultProjectSetting('prj-a'), investment_mthb: 6 },
    });
    expect(manual.investment_source).toBe('manual');
    expect(manual.investment_mthb).toBe(6);
    const none = evaluateProjectRecRoi(base);
    expect(none.investment_source).toBeNull();
    expect(none.uplift).toEqual({ status: 'missing_investment' });
  });

  it('suggests the issuance type of an existing SF-04 request', () => {
    const r = evaluateProjectRecRoi({ ...base, latestRequestType: 'Self consumption' });
    expect(r.suggested_issuance_type).toBe('Self consumption');
  });

  describe('PDD investment edge cases', () => {
    const manual = { ...defaultProjectSetting('prj-a'), investment_mthb: 6 };
    const withPdd = (section_data: Record<string, unknown>, setting?: typeof manual) =>
      evaluateProjectRecRoi({ ...base, pdds: [pdd({ section_data })], setting });

    it('a string value from the PDD form is parsed', () => {
      const r = withPdd({ investment_mthb: '8' });
      expect(r.investment_mthb).toBe(8);
      expect(r.investment_source).toBe('pdd');
    });
    it('the PDD value beats a manual setting', () => {
      const r = withPdd({ investment_mthb: 8 }, manual);
      expect(r.investment_mthb).toBe(8);
      expect(r.investment_source).toBe('pdd');
    });
    it.each(['', ' '])('a blank PDD value (%j) falls back to the manual setting', (blank) => {
      const r = withPdd({ investment_mthb: blank }, manual);
      expect(r.investment_mthb).toBe(6);
      expect(r.investment_source).toBe('manual');
    });
    it('a bundle PDD investment is never used — manual setting or nothing', () => {
      const bundle = { investment_mthb: 50, sites: [{ owner: 'A', kwp: 100, project_id: 'prj-a' }] };
      const m = withPdd(bundle, manual);
      expect(m.investment_mthb).toBe(6);
      expect(m.investment_source).toBe('manual');
      const none = withPdd(bundle);
      expect(none.investment_mthb).toBeNull();
      expect(none.investment_source).toBeNull();
      expect(none.uplift).toEqual({ status: 'missing_investment' });
    });
  });
});
