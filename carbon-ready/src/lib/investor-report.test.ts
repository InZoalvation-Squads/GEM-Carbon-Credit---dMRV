import { describe, it, expect } from 'vitest';
import type { Methodology, MonitoringRecord, Project, ProjectDesignDocument } from '../types';
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';
import { seedFactors } from '../data/seed';
import { EMPTY_REC_ROI_SETTINGS, type RecRoiAssumptions } from './rec-roi';
import {
  buildPortfolioReport, buildProjectReport, cheapestPath, monthlyProduction, projectCountry, recNetTotal, recShareOfElectricity, recommendedMid, recommendedPath,
  tverEstimate, type ProjectReportData, type ReportSources,
} from './investor-report';
import { evaluateProjectRecRoi } from './rec-roi-project';
import { computeYearlyTable } from './pdd';
import { buildRecRoiSummary } from '../components/rec-roi/summary';

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

/** Test helper: the report data of a project that must be reportable. */
function report(args: ReportSources & { projectId: string }): ProjectReportData {
  const r = buildProjectReport(args);
  if (r.status !== 'ok') throw new Error(`expected an ok report, got ${r.status}`);
  return r.data;
}

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
  it('is YEAR 1 of the crediting period, run with exactly the measured annual kWh', () => {
    const sectionData = { degradation_pct: 5 };   // with degradation year 1 ≠ the average
    const t = tverEstimate(TH, [pdd('prj-th', { section_data: sectionData })], METHODS, seedFactors, 36.5)!;
    const table = computeYearlyTable({ project: TH, factors: seedFactors, sectionData: { ...sectionData, year1_generation_kwh: 36_500 } })!;
    expect(table.rows[0].generation_kwh).toBe(36_500);
    expect(table.rows[0].er).not.toBe(table.avg.er);
    expect(t.tco2e_year).toBe(table.rows[0].er);
  });
  it('null unless the governing PDD is registered', () => {
    expect(tverEstimate(TH, [pdd('prj-th', { state: 'draft' })], METHODS, seedFactors, 36.5)).toBeNull();
  });
  it('null without a T-VER PDD, or for a bundle PDD', () => {
    expect(tverEstimate(TH, [], METHODS, seedFactors, 36.5)).toBeNull();
    expect(tverEstimate(TH, [pdd('prj-th', { section_data: { sites: [{ name: 'a', kwp: 1 }] } })], METHODS, seedFactors, 36.5)).toBeNull();
  });
});

describe('buildProjectReport', () => {
  it('Thai project: Scope 2 = annual MWh × TGO 0.475 (tCO2e)', () => {
    const r = report({ ...base, projectId: 'prj-th' });
    expect(r.generated_at).toBe('2026-10-06T08:00:00Z');
    expect(r.roi.annual.status).toBe('ok');
    const mwh = r.roi.annual.status === 'ok' ? r.roi.annual.annual_mwh : 0;
    expect(r.scope2.factor?.value_kg_per_kwh).toBe(0.475);
    expect(r.scope2.tco2e_location_year).toBeCloseTo(mwh * 0.475, 9);
    expect(r.scope2.recs_year).toBeCloseTo(mwh, 9);
    expect(r.scope2.tver).not.toBeNull();
  });
  it('Indian project: no Scope 2 factor → null tCO2e, no T-VER PDD → null', () => {
    const r = report({ ...base, projectId: 'prj-in' });
    expect(r.scope2.factor).toBeNull();
    expect(r.scope2.tco2e_location_year).toBeNull();
    expect(r.scope2.tver).toBeNull();
  });
  it('independent hand value: exactly 100 MWh/yr × 0.475 = 47.5 tCO2e', () => {
    // 73 days totalling 20,000 kWh → 20,000 / 73 × 365 = 100,000 kWh/yr.
    const recs = [...daily('prj-th', '2026-01-01', 72, 200), ...daily('prj-th', '2026-03-14', 1, 5_600)]
      .map((r, i) => ({ ...r, id: `h-${i}` }));
    const r = report({ ...base, records: recs, projectId: 'prj-th' });
    expect(r.roi.annual.status === 'ok' && r.roi.annual.annual_mwh).toBeCloseTo(100, 6);
    expect(r.scope2.tco2e_location_year).toBeCloseTo(47.5, 6);
  });
  it('no factor when the data window ends before the factor takes effect', () => {
    const r = report({ ...base, records: daily('prj-th', '2025-01-01', 90, 100), projectId: 'prj-th' });
    expect(r.scope2.factor).toBeNull();
    expect(r.scope2.tco2e_location_year).toBeNull();
  });
  it('monthly sum equals the window total kWh', () => {
    const r = report({ ...base, projectId: 'prj-th' });
    const total = r.roi.annual.status === 'ok' ? r.roi.annual.total_kwh : -1;
    expect(r.monthly.reduce((s, m) => s + m.kwh, 0)).toBe(total);
  });
  it('a distinct status for an ineligible project and one without data', () => {
    expect(buildProjectReport({ ...base, projectId: 'prj-f' })).toEqual({ status: 'not_eligible' });
    expect(buildProjectReport({ ...base, records: [], projectId: 'prj-th' })).toEqual({ status: 'no_data' });
  });
  it('says so when the project does not exist', () => {
    expect(buildProjectReport({ ...base, projectId: 'nope' })).toEqual({ status: 'not_found' });
  });
});

describe('recNetTotal', () => {
  it('= the recommended path’s mid-price net, null without a price', () => {
    const r = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: ASSUME });
    expect(recNetTotal(r)).not.toBeNull();
    const noPrice = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: { ...ASSUME, price_mid_thb: null } });
    expect(recNetTotal(noPrice)).toBeNull();
  });
  it('is the same number the REC ROI summary shows (one source)', () => {
    const r = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: ASSUME });
    expect(recNetTotal(r)).toBe(buildRecRoiSummary(r, ASSUME)!.money.rec_total);
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
  it('coverage counts say how many projects each sum covers', () => {
    const t = buildPortfolioReport(base).totals;
    expect(t.projects).toBe(2);
    expect(t.tco2e_projects).toBe(1);   // only the Thai project has a Scope 2 factor
    expect(t.rec_net_projects).toBe(2);
  });
  it('no price anywhere → rec_net_total null', () => {
    expect(buildPortfolioReport({ ...base, assumptions: { ...ASSUME, price_mid_thb: null } }).totals.rec_net_total).toBeNull();
    expect(buildPortfolioReport({ ...base, assumptions: { ...ASSUME, price_mid_thb: null } }).totals.rec_net_projects).toBe(0);
  });
});

describe('path selection helpers (one source)', () => {
  const evalTh = (a: RecRoiAssumptions = ASSUME) => evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: a });

  it('recommendedPath is the ok path the evaluation recommends', () => {
    const r = evalTh();
    expect(r.roi?.recommended).toBeTruthy();
    expect(recommendedPath(r)?.path).toBe(r.roi?.recommended);
  });
  it('recommendedMid is that path’s mid scenario, and recNetTotal is its net', () => {
    const r = evalTh();
    expect(recommendedMid(r)?.scenario).toBe('mid');
    expect(recNetTotal(r)).toBe(recommendedMid(r)!.net_thb);
  });
  it('without a mid price there is a path but no mid scenario', () => {
    const r = evalTh({ ...ASSUME, price_mid_thb: null });
    expect(recommendedPath(r)).not.toBeNull();
    expect(recommendedMid(r)).toBeNull();
    expect(recNetTotal(r)).toBeNull();
  });
  it('cheapestPath is the ok path with the lowest break-even price', () => {
    const r = evalTh();
    const ok = [r.roi!.own, r.roi!.platform].filter((x) => x.status === 'ok') as Array<{ path: string; break_even_price_thb: number }>;
    expect(cheapestPath(r)?.break_even_price_thb).toBe(Math.min(...ok.map((x) => x.break_even_price_thb)));
  });
  it('null everywhere when nothing can be computed (no fee, no fx)', () => {
    const r = evalTh({ ...ASSUME, platform_fee_pct: null, eur_thb: null });
    expect(recommendedPath(r)).toBeNull();
    expect(recommendedMid(r)).toBeNull();
    expect(cheapestPath(r)).toBeNull();
  });
  it('accepts the bare RecRoiResult too (what the badge helper holds)', () => {
    const r = evalTh();
    expect(recommendedPath(r.roi)).toBe(recommendedPath(r));
    expect(cheapestPath(null)).toBeNull();
  });
});

describe('recShareOfElectricity — REC income as a share of the electricity value', () => {
  // 108.3 MWh × 1,000 kWh × 4.18 ฿/kWh = ฿452,694 a year.
  const without = 108.3 * 1000 * 4.18;

  it('with a REC price: rec_year ÷ without_year, as a percentage', () => {
    const r = recShareOfElectricity({ without_year: without, rec_year: 27_000 }, 108.3);
    expect(without).toBeCloseTo(452_694, 6);
    expect(r.share_pct).toBeCloseTo((27_000 / without) * 100, 9);
  });
  it('a loss stays negative', () => {
    expect(recShareOfElectricity({ without_year: without, rec_year: -without / 100 }, 108.3).share_pct).toBeCloseTo(-1, 9);
  });
  it('without a price: share_pct is null and the per-10 ฿/MWh scale is MWh × 10 against the electricity value', () => {
    const r = recShareOfElectricity({ without_year: without, rec_year: null }, 108.3);
    expect(r.share_pct).toBeNull();
    expect(r.per10_thb).toBeCloseTo(1083, 9);
    expect(r.per10_share_pct).toBeCloseTo((108.3 * 10) / without * 100, 9);
    expect(r.per10_share_pct).toBeCloseTo(0.2392, 3);
  });
  it('no electricity value → no shares, never a division by zero', () => {
    const r = recShareOfElectricity({ without_year: 0, rec_year: 5 }, 10);
    expect(r.share_pct).toBeNull();
    expect(r.per10_share_pct).toBeNull();
  });
});
