// Investor report data — pure builders over the same evaluation the REC ROI
// pages use, plus Scope 2 (location-based) and the T-VER alternative.
// Spec: docs/superpowers/specs/2026-10-06-investor-report-design.md
import type {
  EmissionFactor, Methodology, MonitoringRecord, Project, ProjectDesignDocument,
  RecIssueRequest, RecRoiProjectSetting, UUID,
} from '../types';
import { computeYearlyTable } from './pdd';
import { isBundle } from './pdd-sites';
import { locationToCountryCode } from './geo';
import { evaluateProjectRecRoi, governingPdd, projectEnergyBasis, type ProjectRecRoi } from './rec-roi-project';
import type { RecPathOk, RecRoiAssumptions } from './rec-roi';
import { scope2FactorFor, type Scope2Factor } from '../data/scope2-factors';

export interface Scope2Block {
  factor: Scope2Factor | null;
  annual_mwh: number;
  /** annual MWh × kgCO2e/kWh = tCO2e, assuming all production is self-consumed; null without a factor. */
  tco2e_location_year: number | null;
  /** T-VER alternative for the same MWh (registered T-VER PDD arithmetic); null without one. */
  tver: { tco2e_year: number; methodology_code: string } | null;
  recs_year: number;
}

export interface ProjectReportData {
  project: Project;
  generated_at: string;
  roi: ProjectRecRoi;                               // eligible, annual.status === 'ok', roi !== null
  monthly: Array<{ month: string; kwh: number }>;
  scope2: Scope2Block;
}

export interface PortfolioReportData {
  generated_at: string;
  projects: ProjectReportData[];
  totals: { mwh_year: number; recs_year: number; rec_net_total: number | null; tco2e_location_year: number | null };
}

export interface ReportSources {
  projects: Project[];
  records: MonitoringRecord[];
  pdds: ProjectDesignDocument[];
  methodologies: Methodology[];
  factors: EmissionFactor[];
  recIssues: RecIssueRequest[];
  projectSettings: RecRoiProjectSetting[];
  assumptions: RecRoiAssumptions;
  now: string;
}

/** Country code from the last comma segment, as gridFactor in pdd.ts reads it. */
export function projectCountry(project: Project): string {
  return locationToCountryCode(project.location.split(',').pop()?.trim() ?? '');
}

/** Measured kWh per month inside the REC ROI window (same driver filter as annualMwh). */
export function monthlyProduction(
  project: Project, records: MonitoringRecord[], r: ProjectRecRoi, driverParam: string | undefined,
): Array<{ month: string; kwh: number }> {
  if (r.annual.status !== 'ok') return [];
  const { window_start, window_end } = r.annual;
  const byMonth = new Map<string, number>();
  for (const rec of records) {
    if (rec.project_id !== project.id) continue;
    if (driverParam && rec.param_key && rec.param_key !== driverParam) continue;
    const d = rec.record_date.slice(0, 10);
    if (d < window_start || d > window_end) continue;
    byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + rec.generation_kwh);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, kwh]) => ({ month, kwh }));
}

/** Average yearly ER of the registered T-VER PDD, re-run with the measured annual generation. */
export function tverEstimate(
  project: Project, pdds: ProjectDesignDocument[], methodologies: Methodology[],
  factors: EmissionFactor[], annualMwh: number,
): { tco2e_year: number; methodology_code: string } | null {
  const pdd = governingPdd(project.id, pdds);
  const m = pdd && methodologies.find((x) => x.id === pdd.methodology_id);
  // A bundle PDD sums its sites' generation and ignores a year-1 override — not this project's MWh.
  if (!pdd || !m || m.standard !== 'T-VER' || isBundle(pdd.section_data ?? {})) return null;
  const table = computeYearlyTable({
    project, factors, sectionData: { ...pdd.section_data, year1_generation_kwh: annualMwh * 1000 },
  });
  return table ? { tco2e_year: table.avg.er, methodology_code: m.code } : null;
}

/** Net REC baht over the horizon on the recommended path at the mid price; null without one. */
export function recNetTotal(r: ProjectRecRoi): number | null {
  const roi = r.roi;
  if (!roi?.recommended) return null;
  const path = [roi.own, roi.platform].find((p): p is RecPathOk => p.status === 'ok' && p.path === roi.recommended);
  return path?.scenarios.find((s) => s.scenario === 'mid')?.net_thb ?? null;
}

export function buildProjectReport(args: ReportSources & { projectId: UUID }): ProjectReportData | null {
  const project = args.projects.find((p) => p.id === args.projectId);
  if (!project) return null;
  const roi = evaluateProjectRecRoi({
    project, records: args.records, pdds: args.pdds, methodologies: args.methodologies,
    factors: args.factors, assumptions: args.assumptions,
    setting: args.projectSettings.find((s) => s.project_id === project.id),
    latestRequestType: args.recIssues.find((x) => x.project_id === project.id)?.request_type,
  });
  if (!roi.eligible || roi.annual.status !== 'ok' || !roi.roi) return null;
  const mwh = roi.annual.annual_mwh;
  const factor = scope2FactorFor(projectCountry(project), roi.annual.window_end);
  const { driverParam } = projectEnergyBasis(project, args.pdds, args.methodologies);
  return {
    project, generated_at: args.now, roi,
    monthly: monthlyProduction(project, args.records, roi, driverParam),
    scope2: {
      factor, annual_mwh: mwh, recs_year: mwh,
      tco2e_location_year: factor ? mwh * factor.value_kg_per_kwh : null,
      tver: tverEstimate(project, args.pdds, args.methodologies, args.factors, mwh),
    },
  };
}

export function buildPortfolioReport(args: ReportSources): PortfolioReportData {
  const projects = args.projects
    .map((p) => buildProjectReport({ ...args, projectId: p.id }))
    .filter((r): r is ProjectReportData => r !== null)
    .sort((a, b) => a.project.name.localeCompare(b.project.name));
  const nets = projects.map((p) => recNetTotal(p.roi)).filter((n): n is number => n !== null);
  const tco2 = projects.map((p) => p.scope2.tco2e_location_year).filter((n): n is number => n !== null);
  const mwh = projects.reduce((s, p) => s + p.scope2.annual_mwh, 0);
  return {
    generated_at: args.now, projects,
    totals: {
      mwh_year: mwh, recs_year: mwh,
      rec_net_total: nets.length ? nets.reduce((s, n) => s + n, 0) : null,
      tco2e_location_year: tco2.length ? tco2.reduce((s, n) => s + n, 0) : null,
    },
  };
}
