import { buildStandardMethodology } from './shared';

export const CDM_ARACM0003_METHODOLOGY = buildStandardMethodology({
  id: 'meth-cdm-aracm0003',
  code: 'AR-ACM0003', // ⚠︎ verify version against UNFCCC CDM
  name: 'AR-ACM0003 Afforestation & Reforestation of Lands',
  standard: 'CDM',
  version: 'v2.0', // ⚠︎ verify
  sectoral_scope: 'Afforestation and reforestation',
  calculation: { formula: 'biomass_stock_change', input_param: 'dC_actual', input_unit: 'tCO₂e' },
  required_evidence: ['site_photo', 'supporting_evidence', 'commissioning_report'],
  monitoring_params: [
    { key: 'dC_actual', label: 'Actual net GHG removals by sinks', unit: 'tCO₂e', method: 'Permanent sample plots + allometric models', frequency: 'Annually' },
    { key: 'A_planted', label: 'Afforested area', unit: 'hectares', method: 'Stratified boundary survey', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'area_hectares', label: 'Project area', type: 'number', unit: 'ha', required: true },
    { key: 'strata_count', label: 'Number of strata', type: 'number', required: true },
    { key: 'land_eligibility', label: 'Land eligible (non-forest since 31 Dec 1989)', type: 'boolean', required: true },
  ],
  baselineOptions: ['Pre-project degraded land with negligible woody biomass'],
  ghgFields: [
    { key: 'leakage_estimate', label: 'Estimated leakage', type: 'number', unit: 'tCO₂e/yr', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual net removal', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'dC_actual — annual net GHG removals (already in tCO₂e).',
});
