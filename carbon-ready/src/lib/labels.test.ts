import { describe, it, expect } from 'vitest';
import { ROLE_LABEL } from './labels';

// The app maps its internal roles onto the Hedera Guardian VM0047 actor triad
// (Project Proponent / Standard Registry / VVB). Enum values stay the same;
// only the display labels follow Guardian terminology.
describe('ROLE_LABEL — Guardian VM0047 actor terminology', () => {
  it('labels project_owner as the Project Proponent', () => {
    expect(ROLE_LABEL.project_owner).toBe('Project Proponent');
  });

  it('labels admin as the Standard Registry', () => {
    expect(ROLE_LABEL.admin).toBe('Standard Registry');
  });

  it('labels verifier as the VVB', () => {
    expect(ROLE_LABEL.verifier).toBe('VVB (Validation & Verification Body)');
  });

  it('keeps ESG Manager, which is outside the Guardian triad', () => {
    expect(ROLE_LABEL.esg_manager).toBe('ESG Manager');
  });
});
