import { buildStandardMethodology } from '../../data/methodologies/shared';

export const TVER_WIND_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-wind',
  code: 'T-VER-S-02', // ⚠︎ verify against TGO registry
  name: 'การผลิตพลังงานไฟฟ้าจากพลังงานลม (Grid-connected Wind)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Energy industries (renewable/non-renewable sources)',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['commissioning_report', 'site_photo', 'supporting_evidence'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity supplied to the grid', unit: 'kWh', method: 'Revenue-grade bi-directional meter', frequency: 'Monthly' },
    { key: 'EF_grid', label: 'Grid emission factor', unit: 'kgCO₂e/kWh', method: 'Official EGAT/TGO published factor', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'turbine_count', label: 'Number of turbines', type: 'number', required: true },
    { key: 'rated_capacity_mw', label: 'Rated capacity', type: 'number', unit: 'MW', required: true },
    { key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true },
  ],
  baselineOptions: ['Grid electricity displaced by wind generation'],
  ghgFields: [
    { key: 'capacity_factor', label: 'Expected capacity factor', type: 'number', required: true, help: 'Typical onshore wind ≈ 0.25–0.40.' },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'EG_PJ — net electricity to grid.',
});
