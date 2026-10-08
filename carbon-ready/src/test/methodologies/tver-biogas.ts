import { buildStandardMethodology } from '../../data/methodologies/shared';

export const TVER_BIOGAS_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-biogas',
  code: 'T-VER-S-04', // ⚠︎ verify
  name: 'การผลิตไฟฟ้าจากก๊าซชีวภาพ (Biogas-to-power)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Energy industries (renewable/non-renewable sources)',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['commissioning_report', 'supporting_evidence', 'maintenance_report'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity supplied to the grid', unit: 'kWh', method: 'Revenue-grade bi-directional meter', frequency: 'Monthly' },
    { key: 'V_biogas', label: 'Biogas captured', unit: 'm³', method: 'Gas flow meter', frequency: 'Continuous' },
  ],
  projectFields: [
    { key: 'substrate', label: 'Substrate source', type: 'select', options: ['Livestock manure', 'Wastewater', 'Food waste'], required: true },
    { key: 'digester_type', label: 'Digester type', type: 'select', options: ['Covered lagoon', 'CSTR', 'UASB'], required: true },
    { key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true },
  ],
  baselineOptions: ['Grid electricity displaced by biogas generation', 'Fossil fuel displaced by biogas'],
  ghgFields: [
    { key: 'capture_efficiency', label: 'Methane capture efficiency', type: 'number', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'EG_PJ — net electricity to grid.',
});
