// Per-project glue between store data and the pure REC ROI math: which
// projects REC applies to, which records feed it, where the investment comes
// from, and the full evaluation the page table and the detail tab both render.
import type {
  EmissionFactor, Methodology, MonitoringRecord, Project, ProjectDesignDocument, RecRoiProjectSetting, UUID,
} from '../types';
import { isBundle } from './pdd-sites';
import { FIN_DEFAULTS } from './pdd';
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

/** The project's registered PDD, else the first found (array order). */
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

/**
 * investment_mthb from the project's PDDs (registered first), as a positive
 * number. Bundle (aggregated) PDDs are skipped: their top-level investment is
 * the whole bundle's, which must never be paired with one project's measured MWh.
 */
function pddInvestment(projectId: UUID, pdds: ProjectDesignDocument[]): { value: number } | null {
  const mine = pdds
    .filter((p) => p.project_id === projectId)
    .sort((a, b) => Number(b.state === 'registered') - Number(a.state === 'registered'));
  for (const p of mine) {
    if (isBundle(p.section_data ?? {})) continue;
    const v = Number(p.section_data?.investment_mthb);
    if (Number.isFinite(v) && v > 0) return { value: v };
  }
  return null;
}

/**
 * Section data of the project's governing non-bundle PDD (registered first),
 * the only place PEA financial overrides are read from. Bundle PDDs describe
 * the whole bundle, never one project's economics.
 */
function governingNonBundleSectionData(projectId: UUID, pdds: ProjectDesignDocument[]): Record<string, unknown> {
  const mine = pdds
    .filter((p) => p.project_id === projectId && !isBundle(p.section_data ?? {}))
    .sort((a, b) => Number(b.state === 'registered') - Number(a.state === 'registered'));
  return mine[0]?.section_data ?? {};
}

// Same semantics as computeFinancialTable's numOrNull (pdd.ts): blank/absent/NaN → not provided.
function finiteOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export type FinancialValueSource = 'pdd' | 'pea_default';
export interface FinancialValue { value: number; source: FinancialValueSource }
/** The three PEA inputs shown to users, with where each one came from. */
export interface FinancialBasis {
  elec_price_thb_kwh: FinancialValue;
  discount_rate_pct: FinancialValue;
  lifetime_years: FinancialValue;
}

function financialBasis(sectionData: Record<string, unknown>): FinancialBasis {
  const pick = (key: keyof FinancialBasis, fallback: number): FinancialValue => {
    const v = finiteOrNull(sectionData[key]);
    return v === null ? { value: fallback, source: 'pea_default' } : { value: v, source: 'pdd' };
  };
  return {
    elec_price_thb_kwh: pick('elec_price_thb_kwh', FIN_DEFAULTS.price),
    discount_rate_pct: pick('discount_rate_pct', FIN_DEFAULTS.discount),
    lifetime_years: pick('lifetime_years', FIN_DEFAULTS.lifetime),
  };
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
  /** PEA inputs behind the uplift, each labelled pdd / pea_default. */
  financial_basis: FinancialBasis;
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
  const overrides = governingNonBundleSectionData(project.id, args.pdds);
  const financial_basis = financialBasis(overrides);
  const empty = { project, setting, suggested_issuance_type, investment_mthb, investment_source, financial_basis } as const;

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
    project, factors: args.factors, pddSectionData: overrides,
    investment_mthb, inputs, assumptions, path: roi.recommended,
  });
  return { ...empty, eligible: true, annual, roi, uplift };
}
