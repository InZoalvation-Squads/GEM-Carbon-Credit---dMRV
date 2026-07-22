import { describe, it, expect } from 'vitest';
import { getOrCreateIdentity, didKeyFromPublicKey, signBytes, verifyBytes } from './identity';

describe('did:key identity', () => {
  it('derives a spec-shaped did:key (z6Mk… = ed25519 multicodec)', () => {
    const id = getOrCreateIdentity('usr-1');
    expect(id.did.startsWith('did:key:z6Mk')).toBe(true);
    expect(didKeyFromPublicKey(id.publicKey)).toBe(id.did);
  });
  it('is stable per user and distinct across users', () => {
    expect(getOrCreateIdentity('usr-1').did).toBe(getOrCreateIdentity('usr-1').did);
    expect(getOrCreateIdentity('usr-1').did).not.toBe(getOrCreateIdentity('usr-2').did);
  });
  it('signs and verifies; tampering fails', () => {
    const id = getOrCreateIdentity('usr-1');
    const msg = new TextEncoder().encode('payload');
    const sig = signBytes(msg, id);
    expect(verifyBytes(msg, sig, id.publicKey)).toBe(true);
    expect(verifyBytes(new TextEncoder().encode('payload!'), sig, id.publicKey)).toBe(false);
  });
});
