import { buildStandardMethodology } from './shared';

export const TVER_WASTE_LFG_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-waste-lfg',
  code: 'T-VER-W-01', // ⚠︎ verify
  name: 'การจัดการของเสียและการดักจับก๊าซจากหลุมฝังกลบ (Landfill Gas Capture)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Waste handling and disposal',
  calculation: { formula: 'ch4_avoidance', input_param: 'M_CH4', input_unit: 't CH4', gwp_ch4: 28 },
  required_evidence: ['commissioning_report', 'supporting_evidence', 'maintenance_report'],
  monitoring_params: [
    { key: 'M_CH4', label: 'Methane captured & destroyed', unit: 't CH4', method: 'Flow meter × CH₄ fraction × density', frequency: 'Continuous' },
    { key: 'flare_uptime', label: 'Flare/engine uptime', unit: '%', method: 'SCADA log', frequency: 'Monthly' },
  ],
  projectFields: [
    { key: 'destruction_device', label: 'Destruction device', type: 'select', options: ['Enclosed flare', 'Open flare', 'Gas engine'], required: true },
    { key: 'site_type', label: 'Site type', type: 'select', options: ['Municipal landfill', 'Industrial wastewater', 'Composting'], required: true },
    { key: 'baseline_flaring', label: 'No methane capture in baseline', type: 'boolean', required: true },
  ],
  baselineOptions: ['Uncontrolled methane emission to atmosphere'],
  ghgFields: [
    { key: 'collection_efficiency', label: 'Gas collection efficiency', type: 'number', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'M_CH4 — tonnes of methane captured and destroyed.',
  source_path: 'carbon-ready/src/data/methodologies/tver-waste-lfg.ts',
  usage: 'Use for TGO T-VER registration of a landfill-gas, wastewater-biogas, or composting project that captures and destroys methane that would otherwise vent uncontrolled.',
});
