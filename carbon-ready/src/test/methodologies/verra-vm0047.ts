import { buildStandardMethodology } from '../../data/methodologies/shared';

// VM0047 is a Verra removals methodology distinct from AR-ACM0003: it adds the
// area-based vs census-based quantification choice and a dynamic performance
// benchmark (stocking index vs matched control plots) in place of a static baseline.
export const VERRA_VM0047_METHODOLOGY = buildStandardMethodology({
  id: 'meth-verra-vm0047',
  code: 'VM0047', // ⚠︎ verify version against Verra Project Hub
  name: 'VM0047 Afforestation, Reforestation and Revegetation',
  standard: 'Verra',
  version: 'v1.1', // active 2025-05-14
  sectoral_scope: 'Agriculture, Forestry and Other Land Use (AFOLU)',
  calculation: { formula: 'biomass_stock_change', input_param: 'dCO2_removals', input_unit: 'tCO₂e' },
  required_evidence: ['site_photo', 'supporting_evidence', 'commissioning_report'],
  monitoring_params: [
    { key: 'dCO2_removals', label: 'Net GHG removals (net of dynamic benchmark)', unit: 'tCO₂e', method: 'Remote sensing + plot sampling (area-based) or census, vs matched control plots', frequency: 'Annually' },
    { key: 'A_project', label: 'Project area', unit: 'hectares', method: 'GIS boundary', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'quantification_approach', label: 'Quantification approach', type: 'select', options: ['Area-based', 'Census-based'], required: true, help: 'Area-based for land-cover change (remote sensing + plots); census-based for dispersed planting (agroforestry, shelterbelts, urban forestry, revegetation).' },
    { key: 'arr_activity', label: 'ARR activity', type: 'select', options: ['Afforestation', 'Reforestation', 'Revegetation'], required: true },
    { key: 'area_hectares', label: 'Project area', type: 'number', unit: 'ha', required: true },
    { key: 'land_use_change', label: 'Results in land-use change', type: 'boolean', required: true },
  ],
  baselineOptions: ['Non-forest / degraded land vs dynamic performance benchmark (matched control plots)'],
  ghgFields: [
    { key: 'stocking_index_baseline', label: 'Baseline stocking index (SI)', type: 'number', required: true, help: 'Vegetative stocking index of matched control plots — the dynamic performance benchmark.' },
    { key: 'soc_included', label: 'Soil organic carbon pool included', type: 'boolean', required: true },
    { key: 'biomass_burning_emissions', label: 'Biomass burning emissions', type: 'number', unit: 'tCO₂e/yr', required: true },
    { key: 'n_fertilizer_emissions', label: 'N-fertilizer emissions', type: 'number', unit: 'tCO₂e/yr', required: true },
    { key: 'leakage_estimate', label: 'Estimated leakage', type: 'number', unit: 'tCO₂e/yr', required: true },
    { key: 'annual_removal_estimate', label: 'Estimated annual net removal', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'dCO2_removals — annual net GHG removals in tCO₂e per verification period, net of the dynamic performance benchmark.',
  usage: 'Use for Verra VCS registration of Afforestation, Reforestation, or Revegetation (ARR) projects that quantify removals against a dynamic performance benchmark (matched control plots) rather than a static baseline.',
});
