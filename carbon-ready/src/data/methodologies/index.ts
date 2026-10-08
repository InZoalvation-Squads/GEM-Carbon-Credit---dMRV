import type { Methodology } from '../../types';
import { TVER_SOLAR_METHODOLOGY } from '../methodology-tver-solar';
import { TVER_FORESTRY_METHODOLOGY } from './tver-forestry';
import { REC_SOLAR_METHODOLOGY } from './rec-solar';

export { TVER_FORESTRY_METHODOLOGY, REC_SOLAR_METHODOLOGY };

// The registry's catalog: only the methodologies GEM actually registers against.
export const ALL_METHODOLOGIES: Methodology[] = [
  TVER_SOLAR_METHODOLOGY,
  TVER_FORESTRY_METHODOLOGY,
  REC_SOLAR_METHODOLOGY,
];
