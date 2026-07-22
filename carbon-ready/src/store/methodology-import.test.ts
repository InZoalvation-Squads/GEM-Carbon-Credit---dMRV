import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';
import { methodologyToJson } from '../lib/methodology-schema';

describe('importMethodology', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().resetToSeed();
    // Act as the Standard Registry (Guardian: only this role imports).
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'admin' } }));
  });

  it('imports a valid document under a fresh id and audit-logs it', () => {
    const doc = JSON.parse(methodologyToJson(useStore.getState().methodologies[0]));
    doc.code = 'TEST-001';
    doc.name = 'Imported test methodology';
    const r = useStore.getState().importMethodology(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    expect(useStore.getState().methodologies.some((m) => m.code === 'TEST-001')).toBe(true);
    expect(useStore.getState().audit[0].action).toBe('METHODOLOGY_IMPORTED');
  });

  it('rejects duplicate code+version', () => {
    const doc = methodologyToJson(useStore.getState().methodologies[0]);
    expect(useStore.getState().importMethodology(doc).ok).toBe(false);
  });

  it('rejects an invalid document with readable errors', () => {
    const r = useStore.getState().importMethodology('{"schema_version":1}');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('blocks non-admin roles', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    const doc = JSON.parse(methodologyToJson(useStore.getState().methodologies[0]));
    doc.code = 'TEST-002';
    expect(useStore.getState().importMethodology(JSON.stringify(doc)).ok).toBe(false);
  });
});
