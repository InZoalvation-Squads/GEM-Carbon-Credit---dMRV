import { buildStandardMethodology } from './shared';

export const TVER_BIOMASS_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-biomass',
  code: 'T-VER-S-03', // ⚠︎ verify
  name: 'การผลิตไฟฟ้าจากชีวมวล (Grid-connected Biomass Power)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Energy industries (renewable/non-renewable sources)',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['commissioning_report', 'supporting_evidence', 'maintenance_report'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity supplied to the grid', unit: 'kWh', method: 'Revenue-grade bi-directional meter', frequency: 'Monthly' },
    { key: 'M_biomass', label: 'Biomass consumed', unit: 'tonnes', method: 'Weighbridge log', frequency: 'Monthly' },
  ],
  projectFields: [
    { key: 'feedstock_type', label: 'Biomass feedstock', type: 'select', options: ['Rice husk', 'Bagasse', 'Wood chips', 'Palm residue'], required: true },
    { key: 'sustainable_sourcing', label: 'Feedstock is sustainably sourced', type: 'boolean', required: true },
    { key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true },
  ],
  baselineOptions: ['Grid electricity displaced by biomass generation'],
  ghgFields: [
    { key: 'plant_load_factor', label: 'Plant load factor', type: 'number', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'EG_PJ — net electricity to grid.',
});
