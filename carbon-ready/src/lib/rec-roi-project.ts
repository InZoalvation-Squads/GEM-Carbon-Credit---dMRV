// Per-project glue between store data and the pure REC ROI math: which
// projects REC applies to, which records feed it, where the investment comes
// from, and the full evaluation the page table and the detail tab both render.
import type {
  EmissionFactor, Methodology, MonitoringRecord, Project, ProjectDesignDocument, RecRoiProjectSetting, UUID,
} from '../types';
import {
  annualMwh, computeIrrUplift, computeRecRoi,
  type AnnualMwh, type RecIrrUplift, type RecRoiAssumptions, type RecRoiResult,
} from './rec-roi';

/** Saved settings or the neutral defaults (no investment, Normal, not exempt). */
export function defaultProjectSetting(project_id: UUID): RecRoiProjectSetting {
  return {
    project_id, issuance_type: 'Normal', digital_meter_exempt: false, investment_mthb: null,
    updated_by: null, updated_at: null,
  };
}

/** The project's governing PDD: newest registered one, else the first found. */
function governingPdd(projectId: UUID, pdds: ProjectDesignDocument[]): ProjectDesignDocument | undefined {
  const mine = pdds.filter((p) => p.project_id === projectId);
  return mine.find((p) => p.state === 'registered') ?? mine[0];
}

/**
 * REC applies to electricity only: capacity > 0 and a kWh-driven methodology
 * (or no PDD yet, in which case records are not param-filtered).
 */
export function projectEnergyBasis(
  project: Project, pdds: ProjectDesignDocument[], methodologies: Methodology[],
): { eligible: boolean; driverParam: string | undefined } {
  if (!(project.capacity_kwp > 0)) return { eligible: false, driverParam: undefined };
  const governing = governingPdd(project.id, pdds);
  if (!governing) return { eligible: true, driverParam: undefined };
  const m = methodologies.find((x) => x.id === governing.methodology_id);
  if (!m) return { eligible: true, driverParam: undefined };
  return m.calculation.input_unit === 'kWh'
    ? { eligible: true, driverParam: m.calculation.input_param }
    : { eligible: false, driverParam: undefined };
}

/** investment_mthb from any of the project's PDDs (registered first), as a positive number. */
function pddInvestment(projectId: UUID, pdds: ProjectDesignDocument[]): { value: number; sectionData: Record<string, unknown> } | null {
  const mine = pdds
    .filter((p) => p.project_id === projectId)
    .sort((a, b) => Number(b.state === 'registered') - Number(a.state === 'registered'));
  for (const p of mine) {
    const v = Number(p.section_data?.investment_mthb);
    if (p.section_data?.investment_mthb !== '' && Number.isFinite(v) && v > 0) return { value: v, sectionData: p.section_data };
  }
  return null;
}

export interface ProjectRecRoi {
  project: Project;
  eligible: boolean;
  annual: AnnualMwh;
  setting: RecRoiProjectSetting;
  suggested_issuance_type: RecRoiProjectSetting['issuance_type'] | null;
  roi: RecRoiResult | null;
  investment_mthb: number | null;
  investment_source: 'pdd' | 'manual' | null;
  uplift: RecIrrUplift | null;
}

export function evaluateProjectRecRoi(args: {
  project: Project;
  records: MonitoringRecord[];
  pdds: ProjectDesignDocument[];
  methodologies: Methodology[];
  factors: EmissionFactor[];
  assumptions: RecRoiAssumptions;
  setting?: RecRoiProjectSetting;
  /** request_type of the project's newest SF-04 request, if any. */
  latestRequestType?: RecRoiProjectSetting['issuance_type'];
}): ProjectRecRoi {
  const { project, assumptions } = args;
  const setting = args.setting ?? defaultProjectSetting(project.id);
  const suggested_issuance_type = args.latestRequestType ?? null;
  const basis = projectEnergyBasis(project, args.pdds, args.methodologies);
  const fromPdd = pddInvestment(project.id, args.pdds);
  const investment_mthb = fromPdd?.value ?? setting.investment_mthb;
  const investment_source = fromPdd ? 'pdd' : setting.investment_mthb !== null ? 'manual' : null;
  const empty = { project, setting, suggested_issuance_type, investment_mthb, investment_source } as const;

  if (!basis.eligible) {
    return { ...empty, eligible: false, annual: { status: 'no_data' }, roi: null, uplift: null };
  }
  const annual = annualMwh(args.records.filter((r) => r.project_id === project.id), basis.driverParam);
  if (annual.status !== 'ok') {
    return { ...empty, eligible: true, annual, roi: null, uplift: null };
  }
  const inputs = {
    capacity_kwp: project.capacity_kwp,
    annual_mwh: annual.annual_mwh,
    issuance_type: setting.issuance_type,
    digital_meter_exempt: setting.digital_meter_exempt,
  };
  const roi = computeRecRoi(inputs, assumptions);
  const uplift = computeIrrUplift({
    project, factors: args.factors, pddSectionData: fromPdd?.sectionData ?? {},
    investment_mthb, inputs, assumptions, path: roi.recommended,
  });
  return { ...empty, eligible: true, annual, roi, uplift };
}
