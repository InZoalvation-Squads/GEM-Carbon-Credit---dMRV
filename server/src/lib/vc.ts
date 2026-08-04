// Ported (VERIFY path only) from carbon-ready/src/lib/vc.ts — source of truth
// until workspaces (Phase 1b). Bodies are verbatim. signCredential is
// intentionally NOT ported: VCs are signed in the browser (the issuer keys
// never leave the client); the server's job is to verify the Ed25519 proof of
// whatever signed object the client POSTs before persisting it.
import { hexToBytes } from '@noble/hashes/utils.js';
import { canonical, sha256Hex } from './hash.js';
import { publicKeyFromDidKey, verifyBytes } from './identity.js';
import type { VerifiableCredential } from './vc-types.js';

// The signature covers sha256(canonical(vc without proof/anchor)), so any field edit —
// subject, issuer, HCS coordinates — invalidates the proof offline.
// (Module-private, exactly like the SPA source.)
function signingInput(vc: VerifiableCredential): Uint8Array {
  const { proof: _p, anchor: _a, ...unsigned } = vc;
  return hexToBytes(sha256Hex(canonical(unsigned)));
}

export type VcVerdict = 'valid' | 'invalid' | 'unsigned';

export function verifyCredential(vc: VerifiableCredential): VcVerdict {
  if (!vc.proof) return 'unsigned';
  // Issuer binding: prevents re-signing under a different key while claiming another issuer.
  if (vc.issuer_did !== vc.proof.verificationMethod) return 'invalid';
  const pub = publicKeyFromDidKey(vc.proof.verificationMethod);
  if (!pub) return 'invalid';
  return verifyBytes(signingInput(vc), vc.proof.proofValue, pub) ? 'valid' : 'invalid';
}
