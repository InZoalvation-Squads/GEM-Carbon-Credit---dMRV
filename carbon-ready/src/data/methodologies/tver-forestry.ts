import { buildStandardMethodology } from './shared';

export const TVER_FORESTRY_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-forestry',
  code: 'T-VER-F-01', // ⚠︎ verify
  name: 'การปลูกป่าและฟื้นฟูป่า (Afforestation / Reforestation)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Agriculture, Forestry and Other Land Use (AFOLU)',
  calculation: { formula: 'biomass_stock_change', input_param: 'dC_tree', input_unit: 'tCO2e' },
  required_evidence: ['site_photo', 'supporting_evidence', 'commissioning_report'],
  monitoring_params: [
    { key: 'dC_tree', label: 'Change in tree carbon stock', unit: 'tCO₂e', method: 'Sample plot biomass survey + allometric equations', frequency: 'Annually' },
    { key: 'A_planted', label: 'Planted area', unit: 'hectares', method: 'GPS boundary survey', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'area_hectares', label: 'Project area', type: 'number', unit: 'ha', required: true },
    { key: 'species', label: 'Dominant species', type: 'text', required: true },
    { key: 'land_eligibility', label: 'Land was non-forest at project start', type: 'boolean', required: true },
  ],
  baselineOptions: ['Degraded / non-forest land with no regeneration'],
  ghgFields: [
    { key: 'growth_rate', label: 'Expected annual carbon accumulation', type: 'number', unit: 'tCO₂e/ha/yr', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'dC_tree — annual change in tree carbon stock (already in tCO₂e).',
});
