import { describe, it, expect } from 'vitest';
import { shortHash, sha256Hex, sha256HexBytes, canonical, randomSaltHex } from './hash';

describe('sha256', () => {
  it('matches the NIST vector for "abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('hashes raw bytes identically to the string path for ascii', () => {
    expect(sha256HexBytes(new TextEncoder().encode('abc'))).toBe(sha256Hex('abc'));
  });
  it('shortHash keeps the sha256- prefix contract, now with a full digest', () => {
    const h = shortHash('hello');
    expect(h).toMatch(/^sha256-[0-9a-f]{64}$/);
  });
  it('hashes non-ascii bytes identically to the string path', () => {
    expect(sha256HexBytes(new TextEncoder().encode('∅'))).toBe(sha256Hex('∅'));
  });
  it('randomSaltHex returns 32 hex chars and differs per call', () => {
    const a = randomSaltHex();
    const b = randomSaltHex();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
  it('canonical is stable across key order', () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }))
      .toBe(canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });
});
