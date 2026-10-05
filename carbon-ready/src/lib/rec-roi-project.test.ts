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

  describe('financial basis (PEA overrides)', () => {
    const assumptions = { ...EMPTY_REC_ROI_SETTINGS, platform_fee_pct: 10, eur_thb: 40, price_mid_thb: 25 };
    const manual = { ...defaultProjectSetting('prj-a'), investment_mthb: 1 };
    const run = (section_data: Record<string, unknown> | null, setting = manual) => evaluateProjectRecRoi({
      ...base, assumptions, setting, pdds: section_data ? [pdd({ section_data })] : [],
    });

    it('no PDD → every value is the PEA default', () => {
      expect(run(null).financial_basis).toEqual({
        elec_price_thb_kwh: { value: 4.18, source: 'pea_default' },
        discount_rate_pct: { value: 7, source: 'pea_default' },
        lifetime_years: { value: 25, source: 'pea_default' },
      });
    });

    it('a PDD tariff override is used and labelled pdd even when the investment is manual', () => {
      const withOverride = run({ elec_price_thb_kwh: '6', discount_rate_pct: 9 });
      expect(withOverride.investment_source).toBe('manual');
      expect(withOverride.financial_basis).toEqual({
        elec_price_thb_kwh: { value: 6, source: 'pdd' },
        discount_rate_pct: { value: 9, source: 'pdd' },
        lifetime_years: { value: 25, source: 'pea_default' },
      });
      const plain = run({});
      expect(withOverride.uplift?.status).toBe('ok');
      expect(plain.uplift?.status).toBe('ok');
      if (withOverride.uplift?.status === 'ok' && plain.uplift?.status === 'ok') {
        // dearer electricity changes the without-REC project economics
        expect(withOverride.uplift.without.payback_years).not.toBe(plain.uplift.without.payback_years);
      }
    });

    it.each(['', 'abc'])('an unparseable override (%j) counts as the default', (v) => {
      expect(run({ elec_price_thb_kwh: v }).financial_basis.elec_price_thb_kwh)
        .toEqual({ value: 4.18, source: 'pea_default' });
    });

    it('a bundle PDD contributes no overrides', () => {
      const bundle = { elec_price_thb_kwh: 9, sites: [{ owner: 'A', kwp: 100, project_id: 'prj-a' }] };
      expect(run(bundle).financial_basis.elec_price_thb_kwh).toEqual({ value: 4.18, source: 'pea_default' });
    });
  });
});

describe('one governing PDD, deterministic', () => {
  const assumptions = { ...EMPTY_REC_ROI_SETTINGS, platform_fee_pct: 10, eur_thb: 40, price_mid_thb: 25 };
  const run = (pdds: ProjectDesignDocument[], setting = { ...defaultProjectSetting('prj-a'), investment_mthb: 1 }) =>
    evaluateProjectRecRoi({
      project: project(), records: daily(92, 100), pdds, methodologies: METHODS, factors: [], assumptions, setting,
    });
  const bundle = { investment_mthb: 50, elec_price_thb_kwh: 9, sites: [{ owner: 'A', kwp: 100, project_id: 'prj-a' }] };

  it('a rejected PDD is never governing (investment, overrides, eligibility)', () => {
    const rejected = pdd({
      id: 'PDD-rej', state: 'rejected', methodology_id: TVER_FORESTRY_METHODOLOGY.id,
      section_data: { investment_mthb: 99, elec_price_thb_kwh: 9 },
    });
    const draft = pdd({ id: 'PDD-d', state: 'draft', section_data: { investment_mthb: 8 } });
    const r = run([rejected, draft]);
    expect(r.investment_mthb).toBe(8);
    expect(r.financial_basis.elec_price_thb_kwh.source).toBe('pea_default');
    // only a rejected forestry PDD → behaves like "no PDD yet"
    const only = run([rejected]);
    expect(only.eligible).toBe(true);
    expect(only.investment_mthb).toBe(1);
    expect(only.investment_source).toBe('manual');
  });

  it('registered beats a newer draft', () => {
    const registered = pdd({ id: 'PDD-r', state: 'registered', validated_at: '2025-01-01T00:00:00Z', section_data: { investment_mthb: 8 } });
    const draft = pdd({ id: 'PDD-d', state: 'draft', submitted_at: '2026-06-01T00:00:00Z', section_data: { investment_mthb: 5 } });
    expect(run([draft, registered]).investment_mthb).toBe(8);
  });

  it('investment, overrides and eligibility all come from the SAME PDD', () => {
    // governing = registered bundle: nothing from the (non-bundle) draft leaks in
    const registeredBundle = pdd({ id: 'PDD-r', state: 'registered', section_data: bundle });
    const draft = pdd({ id: 'PDD-d', state: 'draft', section_data: { investment_mthb: 5, elec_price_thb_kwh: 7 } });
    const r = run([draft, registeredBundle]);
    expect(r.investment_mthb).toBe(1);
    expect(r.investment_source).toBe('manual');
    expect(r.financial_basis.elec_price_thb_kwh).toEqual({ value: 4.18, source: 'pea_default' });
    // governing = registered forestry PDD → not eligible even though a draft is solar
    const forestry = pdd({ id: 'PDD-f', state: 'registered', methodology_id: TVER_FORESTRY_METHODOLOGY.id });
    expect(run([draft, forestry]).eligible).toBe(false);
    // governing = non-bundle: both from it
    const solar = pdd({ id: 'PDD-s', state: 'registered', section_data: { investment_mthb: 8, elec_price_thb_kwh: 6 } });
    const ok = run([draft, solar]);
    expect(ok.investment_mthb).toBe(8);
    expect(ok.financial_basis.elec_price_thb_kwh).toEqual({ value: 6, source: 'pdd' });
  });

  it('is order-independent: newest timestamp wins, ids break exact ties', () => {
    const older = pdd({ id: 'PDD-1', state: 'draft', submitted_at: '2026-01-01T00:00:00Z', section_data: { investment_mthb: 3 } });
    const newer = pdd({ id: 'PDD-2', state: 'draft', submitted_at: '2026-03-01T00:00:00Z', section_data: { investment_mthb: 4 } });
    const untimed = pdd({ id: 'PDD-3', state: 'draft', section_data: { investment_mthb: 5 } });
    const all = [older, newer, untimed];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const perm of perms) expect(run(perm.map((i) => all[i])).investment_mthb).toBe(4);

    const t1 = pdd({ id: 'PDD-a', state: 'draft', submitted_at: '2026-01-01T00:00:00Z', section_data: { investment_mthb: 3 } });
    const t2 = pdd({ id: 'PDD-b', state: 'draft', submitted_at: '2026-01-01T00:00:00Z', section_data: { investment_mthb: 4 } });
    expect(run([t1, t2]).investment_mthb).toBe(run([t2, t1]).investment_mthb);
  });
});

describe('unsaved issuance-type default', () => {
  const base = {
    project: project(), records: daily(92, 100), pdds: [pdd({})], methodologies: METHODS, factors: [],
    assumptions: { ...EMPTY_REC_ROI_SETTINGS, platform_fee_pct: 10, eur_thb: 40 },
  };
  it('with no saved setting, the newest SF-04 type is the effective type', () => {
    const r = evaluateProjectRecRoi({ ...base, latestRequestType: 'Self consumption' });
    expect(r.setting.issuance_type).toBe('Self consumption');
    expect(r.setting.updated_at).toBeNull();
    const saved = evaluateProjectRecRoi({
      ...base, setting: { ...defaultProjectSetting('prj-a'), issuance_type: 'Self consumption' },
    });
    expect(r.roi).toEqual(saved.roi);
    expect(r.roi).not.toEqual(evaluateProjectRecRoi(base).roi);
  });
  it('a saved setting always wins', () => {
    const r = evaluateProjectRecRoi({
      ...base, latestRequestType: 'Self consumption', setting: { ...defaultProjectSetting('prj-a'), issuance_type: 'Normal' },
    });
    expect(r.setting.issuance_type).toBe('Normal');
    expect(r.roi).toEqual(evaluateProjectRecRoi(base).roi);
  });
});

