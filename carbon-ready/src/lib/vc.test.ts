import { describe, it, expect } from 'vitest';
import { signCredential, verifyCredential } from './vc';
import { getOrCreateIdentity } from './identity';

const base = {
  id: 'urn:vc:test', schema_id: 's1', issuer_did: '', issued_at: '2026-07-22T00:00:00Z',
  subject: { a: 1 }, package_hash: 'sha256-ab',
  hcs: { topic_id: '0.0.1', sequence_number: 1, consensus_timestamp: 'x', explorer_url: 'y' },
};

describe('vc sign/verify', () => {
  it('signs and verifies offline', () => {
    const issuer = getOrCreateIdentity('registry');
    const vc = signCredential({ ...base, issuer_did: issuer.did }, issuer);
    expect(vc.proof?.type).toBe('Ed25519Signature2020');
    expect(verifyCredential(vc)).toBe('valid');
  });
  it('flags tampered subjects', () => {
    const issuer = getOrCreateIdentity('registry');
    const vc = signCredential({ ...base, issuer_did: issuer.did }, issuer);
    expect(verifyCredential({ ...vc, subject: { a: 2 } })).toBe('invalid');
  });
  it('reports unsigned for seed-era credentials', () => {
    expect(verifyCredential(base)).toBe('unsigned');
  });
});
