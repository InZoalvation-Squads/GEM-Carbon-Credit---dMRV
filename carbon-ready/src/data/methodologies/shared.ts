import type {
  Methodology, PddSectionSchema, PddFieldSchema, MethodologyCalculation,
  EvidenceCategory, MonitoringParam, Standard,
} from '../../types';

// Additionality (section C) is near-identical across methodologies — share it.
export const stdAdditionalitySection: PddSectionSchema = {
  key: 'additionality',
  title: 'C. Additionality / ความเพิ่มเติม',
  fields: [
    { key: 'barrier_type', label: 'Primary barrier', type: 'select', options: ['Investment', 'Technological', 'Institutional'], required: true },
    { key: 'investment_metric', label: 'Investment metric used', type: 'select', options: ['IRR', 'NPV', 'LCOE'], required: true, showIf: { field: 'barrier_type', equals: 'Investment' } },
    { key: 'barrier_explanation', label: 'Barrier analysis', type: 'textarea', required: true, help: 'Explain why the project is not the baseline / business-as-usual.' },
    { key: 'common_practice', label: 'Not common practice in the region', type: 'boolean', required: true },
  ],
};

// Monitoring plan (section E) — parametrised by the monitored parameter label.
export function stdMonitoringSection(monitoredParamHelp: string): PddSectionSchema {
  return {
    key: 'monitoring_plan',
    title: 'E. Monitoring plan / แผนการติดตาม',
    fields: [
      { key: 'monitored_parameter', label: 'Monitored parameter', type: 'text', required: true, help: monitoredParamHelp },
      { key: 'measurement_method', label: 'Measurement method', type: 'text', required: true },
      { key: 'monitoring_frequency', label: 'Frequency', type: 'select', options: ['Continuous', 'Monthly', 'Quarterly', 'Annually'], required: true },
      { key: 'qaqc_procedure', label: 'QA/QC procedure', type: 'textarea', required: true },
    ],
  };
}

export interface MethodologyConfig {
  id: string;
  code: string;                 // ⚠︎ verify against the registry
  name: string;
  standard: Standard;
  version: string;
  sectoral_scope: string;
  calculation: MethodologyCalculation;
  required_evidence: EvidenceCategory[];
  monitoring_params: MonitoringParam[];
  /** Section A fields AFTER the two shared computed fields (location, commission_date). */
  projectFields: PddFieldSchema[];
  /** Section B baseline scenario options. */
  baselineOptions: string[];
  /** Section D fields (ex-ante estimate as plain inputs — no computed). */
  ghgFields: PddFieldSchema[];
  monitoredParamHelp: string;
}

// Assembles the standard A–E PDD for a non-Solar methodology.
export function buildStandardMethodology(c: MethodologyConfig): Methodology {
  const projectInfo: PddSectionSchema = {
    key: 'project_info',
    title: 'A. Project description / ข้อมูลโครงการ',
    help: 'Core project identity. Location and commissioning date are pulled from the project record.',
    fields: [
      { key: 'project_location', label: 'Location', type: 'computed', source: 'project_location', required: false },
      { key: 'commission_date', label: 'Commissioning date', type: 'computed', source: 'commission_date', required: false },
      ...c.projectFields,
    ],
  };
  const baseline: PddSectionSchema = {
    key: 'baseline',
    title: 'B. Baseline & methodology / เส้นฐาน',
    fields: [
      { key: 'baseline_scenario', label: 'Baseline scenario', type: 'select', options: c.baselineOptions, required: true },
    ],
  };
  const ghg: PddSectionSchema = {
    key: 'ghg_reduction',
    title: 'D. GHG emission reduction (ex-ante) / การลดก๊าซเรือนกระจก',
    help: 'Ex-ante estimate entered by the proponent and checked by the validator.',
    fields: c.ghgFields,
  };
  return {
    id: c.id, code: c.code, name: c.name, standard: c.standard, version: c.version,
    sectoral_scope: c.sectoral_scope, status: 'active', calculation: c.calculation,
    required_evidence: c.required_evidence, monitoring_params: c.monitoring_params,
    pdd_sections: [projectInfo, baseline, stdAdditionalitySection, ghg, stdMonitoringSection(c.monitoredParamHelp)],
  };
}
