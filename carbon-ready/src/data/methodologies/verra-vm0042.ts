import { buildStandardMethodology } from './shared';

export const VERRA_VM0042_METHODOLOGY = buildStandardMethodology({
  id: 'meth-verra-vm0042',
  code: 'VM0042', // ⚠︎ verify version against Verra Project Hub
  name: 'VM0042 Improved Agricultural Land Management',
  standard: 'Verra',
  version: 'v2.1', // ⚠︎ verify
  sectoral_scope: 'Agriculture, Forestry and Other Land Use (AFOLU)',
  calculation: { formula: 'direct_entry', input_param: 'ER_soc', input_unit: 'tCO₂e' },
  required_evidence: ['supporting_evidence', 'site_photo', 'commissioning_report'],
  monitoring_params: [
    { key: 'ER_soc', label: 'Net emission reduction (SOC + N₂O + CH₄)', unit: 'tCO₂e', method: 'Soil sampling + model per VM0042', frequency: 'Annually' },
    { key: 'A_project', label: 'Project area under practice', unit: 'hectares', method: 'GIS boundary', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'practice_change', label: 'ALM practice adopted', type: 'select', options: ['Reduced tillage', 'Cover cropping', 'Nutrient management', 'Improved grazing'], required: true },
    { key: 'crop_type', label: 'Primary crop', type: 'text', required: true },
    { key: 'quantification_approach', label: 'Quantification approach', type: 'select', options: ['Measurement (soil sampling)', 'Modeling', 'Hybrid'], required: true },
  ],
  baselineOptions: ['Conventional land management (business-as-usual practice)'],
  ghgFields: [
    { key: 'soc_uncertainty', label: 'SOC uncertainty deduction', type: 'number', unit: '%', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'ER_soc — net reduction in tCO₂e, entered per verification period.',
});
