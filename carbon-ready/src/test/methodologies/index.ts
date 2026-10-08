// TEST-ONLY methodologies. They were retired from the app's catalog but still
// give the demo fixtures one project per calculation path (wind/biomass/biogas →
// grid_displacement, LFG → ch4_avoidance, VM0042/VM0047/AR-ACM0003 → removals).
import type { Methodology } from '../../types';
import { TVER_WIND_METHODOLOGY } from './tver-wind';
import { TVER_BIOMASS_METHODOLOGY } from './tver-biomass';
import { TVER_BIOGAS_METHODOLOGY } from './tver-biogas';
import { TVER_WASTE_LFG_METHODOLOGY } from './tver-waste-lfg';
import { VERRA_VM0042_METHODOLOGY } from './verra-vm0042';
import { VERRA_VM0047_METHODOLOGY } from './verra-vm0047';
import { CDM_ARACM0003_METHODOLOGY } from './cdm-ar-acm0003';

export {
  TVER_WIND_METHODOLOGY, TVER_BIOMASS_METHODOLOGY, TVER_BIOGAS_METHODOLOGY,
  TVER_WASTE_LFG_METHODOLOGY,
  VERRA_VM0042_METHODOLOGY, VERRA_VM0047_METHODOLOGY, CDM_ARACM0003_METHODOLOGY,
};

export const TEST_ONLY_METHODOLOGIES: Methodology[] = [
  TVER_WIND_METHODOLOGY,
  TVER_BIOMASS_METHODOLOGY,
  TVER_BIOGAS_METHODOLOGY,
  TVER_WASTE_LFG_METHODOLOGY,
  VERRA_VM0042_METHODOLOGY,
  VERRA_VM0047_METHODOLOGY,
  CDM_ARACM0003_METHODOLOGY,
];
