import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';

describe('anchorVerification', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().resetToSeed();
  });

  it('anchors an approved, unanchored package and appends a VERIFICATION_ANCHORED audit row', () => {
    // Arrange: make VR-1001 a fresh approved + unanchored package
    useStore.setState((s) => ({
      verifications: s.verifications.map((v) =>
        v.id === 'VR-1001'
          ? { ...v, state: 'approved' as const, locked_at: '2026-05-20T00:00:00Z', hash_value: 'sha256-vr1001', credential_id: null, anchored_at: null, hcs_topic_id: null, hcs_sequence_number: null }
          : v),
    }));
    const auditBefore = useStore.getState().audit.length;
    const credsBefore = useStore.getState().credentials.length;

    // Act
    useStore.getState().anchorVerification('VR-1001');

    // Assert
    const v = useStore.getState().verifications.find((x) => x.id === 'VR-1001')!;
    expect(v.credential_id).not.toBeNull();
    expect(v.anchored_at).not.toBeNull();
    expect(v.hcs_topic_id).not.toBeNull();
    expect(useStore.getState().credentials.length).toBe(credsBefore + 1);
    expect(useStore.getState().audit.length).toBe(auditBefore + 1);
    expect(useStore.getState().audit[0].action).toBe('VERIFICATION_ANCHORED');
  });

  it('is a no-op on an already-anchored package (VR-1000)', () => {
    const before = useStore.getState().credentials.length;
    useStore.getState().anchorVerification('VR-1000');
    expect(useStore.getState().credentials.length).toBe(before);
  });
});
