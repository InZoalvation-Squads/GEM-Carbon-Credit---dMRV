import type { Methodology } from '../types';

// T-VER solar rooftop methodology, modeled as a Guardian Policy schema.
// One methodology drives the whole PDD form + required evidence + monitoring params.
export const TVER_SOLAR_METHODOLOGY: Methodology = {
  id: 'meth-tver-solar',
  code: 'T-VER-S-01',
  name: 'การผลิตพลังงานไฟฟ้าจากพลังงานแสงอาทิตย์ (Grid-connected Solar PV)',
  standard: 'T-VER',
  version: 'v3.0',
  sectoral_scope: 'Energy industries (renewable/non-renewable sources)',
  status: 'active',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['commissioning_report', 'site_photo', 'supporting_evidence'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity supplied to the grid', unit: 'kWh', method: 'Revenue-grade bi-directional meter', frequency: 'Monthly' },
    { key: 'EF_grid', label: 'Grid emission factor', unit: 'kgCO₂e/kWh', method: 'Official EGAT/TGO published factor', frequency: 'Annually' },
  ],
  pdd_sections: [
    {
      key: 'project_info',
      title: 'A. Project description / ข้อมูลโครงการ',
      help: 'Core project identity. Some values are pulled from the registered project record.',
      fields: [
        { key: 'project_location', label: 'Location', type: 'computed', source: 'project_location', required: false },
        { key: 'capacity_kwp', label: 'Installed capacity', type: 'computed', source: 'capacity_kwp', required: false, unit: 'kWp' },
        { key: 'commission_date', label: 'Commissioning date', type: 'computed', source: 'commission_date', required: false },
        { key: 'technology', label: 'Technology', type: 'select', options: ['Solar PV rooftop', 'Solar PV ground-mounted'], required: true },
        { key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true },
      ],
    },
    {
      key: 'baseline',
      title: 'B. Baseline & methodology / เส้นฐาน',
      fields: [
        { key: 'grid_factor', label: 'Grid emission factor (current)', type: 'computed', source: 'grid_factor', required: false, unit: 'kgCO₂e/kWh' },
        { key: 'baseline_scenario', label: 'Baseline scenario', type: 'select', options: ['Grid electricity displaced by solar generation'], required: true },
      ],
    },
    {
      key: 'additionality',
      title: 'C. Additionality / ความเพิ่มเติม',
      fields: [
        { key: 'barrier_type', label: 'Primary barrier', type: 'select', options: ['Investment', 'Technological', 'Institutional'], required: true },
        { key: 'investment_metric', label: 'Investment metric used', type: 'select', options: ['IRR', 'NPV', 'LCOE'], required: true, showIf: { field: 'barrier_type', equals: 'Investment' } },
        { key: 'barrier_explanation', label: 'Barrier analysis', type: 'textarea', required: true, help: 'Explain why the project is not the baseline / business-as-usual.' },
        { key: 'common_practice', label: 'Not common practice in the region', type: 'boolean', required: true },
      ],
    },
    {
      key: 'ghg_reduction',
      title: 'D. GHG emission reduction (ex-ante) / การลดก๊าซเรือนกระจก',
      help: 'Ex-ante estimate. The annual reduction is auto-calculated from capacity × grid factor × performance ratio.',
      fields: [
        { key: 'performance_ratio', label: 'Performance ratio', type: 'number', required: true, help: 'Typical rooftop solar PR ≈ 0.75–0.85.' },
        { key: 'er_estimate', label: 'Estimated annual reduction', type: 'computed', source: 'er_estimate', required: false, unit: 'tCO₂e/yr' },
      ],
    },
    {
      key: 'monitoring_plan',
      title: 'E. Monitoring plan / แผนการติดตาม',
      fields: [
        { key: 'monitored_parameter', label: 'Monitored parameter', type: 'text', required: true, help: 'e.g. EG_PJ — net electricity to grid.' },
        { key: 'measurement_method', label: 'Measurement method', type: 'text', required: true },
        { key: 'monitoring_frequency', label: 'Frequency', type: 'select', options: ['Continuous', 'Monthly', 'Quarterly'], required: true },
        { key: 'qaqc_procedure', label: 'QA/QC procedure', type: 'textarea', required: true },
      ],
    },
  ],
};
