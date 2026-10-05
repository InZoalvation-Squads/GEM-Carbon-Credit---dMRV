import { describe, it, expect } from 'vitest';
import type { Methodology, MonitoringRecord, Project, ProjectDesignDocument } from '../types';
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';
import { seedFactors } from '../data/seed';
import { EMPTY_REC_ROI_SETTINGS } from './rec-roi';
import {
  buildPortfolioReport, buildProjectReport, monthlyProduction, projectCountry, recNetTotal, tverEstimate,
} from './investor-report';
import { evaluateProjectRecRoi } from './rec-roi-project';

// Synthetic arithmetic inputs, not market data — never copy into fixtures or seeds.
const TH: Project = {
  id: 'prj-th', organization_id: 'org', name: 'Thai Solar', location: 'Uthai Thani, Thailand',
  capacity_kwp: 99, commission_date: '2025-11-07', status: 'active', lifecycle_stage: 'registered',
  created_at: '2025-11-07T00:00:00Z', updated_at: '2025-11-07T00:00:00Z',
};
const IN: Project = { ...TH, id: 'prj-in', name: 'Indian Solar', location: 'Pune, India' };
const FOREST: Project = { ...TH, id: 'prj-f', name: 'Forest', capacity_kwp: 0 };

function daily(projectId: string, from: string, days: number, kwh: number): MonitoringRecord[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    id: `${projectId}-${i}`, project_id: projectId,
    record_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    generation_kwh: kwh, source: 'csv', uploaded_at: '2026-01-01T00:00:00Z',
  }));
}

const pdd = (projectId: string, over: Partial<ProjectDesignDocument> = {}): ProjectDesignDocument => ({
  id: `PDD-${projectId}`, project_id: projectId, methodology_id: TVER_SOLAR_METHODOLOGY.id,
  methodology_snapshot: 'x', state: 'registered', section_data: {}, evidence_ids: [],
  assigned_validator_name: 'v', submitted_at: null, validated_at: '2026-01-01T00:00:00Z',
  content_hash: null, ipfs_cid: null, credential_id: null, ...over,
} as ProjectDesignDocument);

const METHODS = [TVER_SOLAR_METHODOLOGY] as Methodology[];
const RECORDS = [...daily('prj-th', '2026-01-01', 90, 100), ...daily('prj-in', '2026-01-01', 90, 100)];
const ASSUME = { ...EMPTY_REC_ROI_SETTINGS, price_mid_thb: 25, price_source: 'quote', platform_fee_pct: 10, eur_thb: 40 };
const base = {
  projects: [TH, IN, FOREST], records: RECORDS, pdds: [pdd('prj-th')], methodologies: METHODS,
  factors: seedFactors, recIssues: [], projectSettings: [], assumptions: ASSUME, now: '2026-10-06T08:00:00Z',
};

describe('projectCountry', () => {
  it('reads the last comma segment like gridFactor', () => {
    expect(projectCountry(TH)).toBe('TH');
    expect(projectCountry(IN)).toBe('IN');
  });
});

describe('monthlyProduction', () => {
  it('groups the measured window by month', () => {
    const r = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: ASSUME });
    expect(monthlyProduction(TH, RECORDS, r, undefined)).toEqual([
      { month: '2026-01', kwh: 3_100 }, { month: '2026-02', kwh: 2_800 }, { month: '2026-03', kwh: 3_100 },
    ]);
  });
});

describe('tverEstimate', () => {
  it('uses the registered T-VER PDD arithmetic with the measured annual kWh', () => {
    const t = tverEstimate(TH, [pdd('prj-th')], METHODS, seedFactors, 36.5)!;
    expect(t.methodology_code).toBe(TVER_SOLAR_METHODOLOGY.code);
    expect(t.tco2e_year).toBeGreaterThan(0);
  });
  it('null without a T-VER PDD, or for a bundle PDD', () => {
    expect(tverEstimate(TH, [], METHODS, seedFactors, 36.5)).toBeNull();
    expect(tverEstimate(TH, [pdd('prj-th', { section_data: { sites: [{ name: 'a', kwp: 1 }] } })], METHODS, seedFactors, 36.5)).toBeNull();
  });
});

describe('buildProjectReport', () => {
  it('Thai project: Scope 2 = annual MWh × TGO 0.475 (tCO2e)', () => {
    const r = buildProjectReport({ ...base, projectId: 'prj-th' })!;
    expect(r.generated_at).toBe('2026-10-06T08:00:00Z');
    expect(r.roi.annual.status).toBe('ok');
    const mwh = r.roi.annual.status === 'ok' ? r.roi.annual.annual_mwh : 0;
    expect(r.scope2.factor?.value_kg_per_kwh).toBe(0.475);
    expect(r.scope2.tco2e_location_year).toBeCloseTo(mwh * 0.475, 9);
    expect(r.scope2.recs_year).toBeCloseTo(mwh, 9);
    expect(r.scope2.tver).not.toBeNull();
  });
  it('Indian project: no Scope 2 factor → null tCO2e, no T-VER PDD → null', () => {
    const r = buildProjectReport({ ...base, projectId: 'prj-in' })!;
    expect(r.scope2.factor).toBeNull();
    expect(r.scope2.tco2e_location_year).toBeNull();
    expect(r.scope2.tver).toBeNull();
  });
  it('null for an ineligible project or one without data', () => {
    expect(buildProjectReport({ ...base, projectId: 'prj-f' })).toBeNull();
    expect(buildProjectReport({ ...base, records: [], projectId: 'prj-th' })).toBeNull();
  });
});

describe('recNetTotal', () => {
  it('= the recommended path’s mid-price net, null without a price', () => {
    const r = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: ASSUME });
    expect(recNetTotal(r)).not.toBeNull();
    const noPrice = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: { ...ASSUME, price_mid_thb: null } });
    expect(recNetTotal(noPrice)).toBeNull();
  });
});

describe('buildPortfolioReport', () => {
  it('eligible projects with data only, sorted by name, with totals', () => {
    const p = buildPortfolioReport(base);
    expect(p.projects.map((x) => x.project.id)).toEqual(['prj-in', 'prj-th']); // Indian < Thai
    const sum = p.projects.reduce((s, x) => s + (x.roi.annual.status === 'ok' ? x.roi.annual.annual_mwh : 0), 0);
    expect(p.totals.mwh_year).toBeCloseTo(sum, 9);
    expect(p.totals.tco2e_location_year).toBeCloseTo(p.projects[1].scope2.tco2e_location_year!, 9); // only TH has a factor
    expect(p.totals.rec_net_total).not.toBeNull();
  });
  it('no price anywhere → rec_net_total null', () => {
    expect(buildPortfolioReport({ ...base, assumptions: { ...ASSUME, price_mid_thb: null } }).totals.rec_net_total).toBeNull();
  });
});
