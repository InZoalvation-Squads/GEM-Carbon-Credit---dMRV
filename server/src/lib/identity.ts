// Ported (VERIFY path only) from carbon-ready/src/lib/identity.ts — source of
// truth until workspaces (Phase 1b). Bodies are verbatim. Key generation,
// signing and localStorage custody intentionally stay in the browser: private
// keys never reach the server, which only extracts public keys out of did:key
// identifiers and verifies Ed25519 signatures.
import { ed25519 } from '@noble/curves/ed25519.js';
import { hexToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';

export function verifyBytes(msg: Uint8Array, sigHex: string, publicKey: Uint8Array): boolean {
  try { return ed25519.verify(hexToBytes(sigHex), msg, publicKey); } catch { return false; }
}

/** Extract the raw Ed25519 public key back out of a did:key. */
export function publicKeyFromDidKey(did: string): Uint8Array | null {
  if (!did.startsWith('did:key:z')) return null;
  try {
    const bytes = base58.decode(did.slice('did:key:z'.length));
    if (bytes[0] !== 0xed || bytes[1] !== 0x01) return null;
    return bytes.slice(2);
  } catch { return null; }
}
