import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';
import { seedDemo } from '../test/demoFixtures';

const SEED_VC = 'urn:vc:vr1000seed'; // anchored credential in the demo fixtures (24.55 tCO₂e)

describe('mintToken — Standard Registry mints a VCU after issuance', () => {
  beforeEach(() => {
    localStorage.clear();
    seedDemo();
    // Act as the Standard Registry (Guardian: only this role mints).
    useStore.getState().setRole('admin');
  });

  it('mints one token for an anchored credential and writes a TOKEN_MINTED audit row', () => {
    const auditBefore = useStore.getState().audit.length;

    const token = useStore.getState().mintToken(SEED_VC);

    expect(token).not.toBeNull();
    const tokens = useStore.getState().tokens;
    expect(tokens).toHaveLength(1);
    expect(tokens[0].credential_id).toBe(SEED_VC);
    expect(tokens[0].amount_tco2e).toBe(24.55);
    expect(tokens[0].serial_number).toBe(1);
    expect(useStore.getState().audit.length).toBe(auditBefore + 1);
    expect(useStore.getState().audit[0].action).toBe('TOKEN_MINTED');
  });

  it('refuses to mint the same credential twice', () => {
    useStore.getState().mintToken(SEED_VC);
    const second = useStore.getState().mintToken(SEED_VC);

    expect(second).toBeNull();
    expect(useStore.getState().tokens).toHaveLength(1);
  });

  it('refuses to mint when the current role is not the Standard Registry', () => {
    useStore.getState().setRole('project_owner');
    const token = useStore.getState().mintToken(SEED_VC);

    expect(token).toBeNull();
    expect(useStore.getState().tokens).toHaveLength(0);
  });

  it('returns null for a credential that does not exist', () => {
    const token = useStore.getState().mintToken('urn:vc:does-not-exist');
    expect(token).toBeNull();
    expect(useStore.getState().tokens).toHaveLength(0);
  });
});
