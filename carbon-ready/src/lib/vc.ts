import type { VerifiableCredential } from '../types';
import { canonical, sha256Hex } from './hash';
import { hexToBytes } from '@noble/hashes/utils.js';
import { signBytes, verifyBytes, publicKeyFromDidKey, type LocalIdentity } from './identity';

export type VcVerdict = 'valid' | 'invalid' | 'unsigned';

const W3C_CONTEXT = ['https://www.w3.org/ns/credentials/v2'];

// The signature covers sha256(canonical(vc without proof)), so any field edit —
// subject, issuer, HCS coordinates — invalidates the proof offline.
function signingInput(vc: VerifiableCredential): Uint8Array {
  const { proof: _p, ...unsigned } = vc;
  return hexToBytes(sha256Hex(canonical(unsigned)));
}

export function signCredential(vc: VerifiableCredential, issuer: LocalIdentity): VerifiableCredential {
  const prepared: VerifiableCredential = {
    ...vc,
    context: W3C_CONTEXT,
    vc_type: vc.vc_type ?? ['VerifiableCredential'],
    issuer_did: issuer.did,
  };
  return {
    ...prepared,
    proof: {
      type: 'Ed25519Signature2020',
      created: prepared.issued_at,
      verificationMethod: issuer.did,
      proofValue: signBytes(signingInput(prepared), issuer),
    },
  };
}

export function verifyCredential(vc: VerifiableCredential): VcVerdict {
  if (!vc.proof) return 'unsigned';
  // Issuer binding: prevents re-signing under a different key while claiming another issuer.
  if (vc.issuer_did !== vc.proof.verificationMethod) return 'invalid';
  const pub = publicKeyFromDidKey(vc.proof.verificationMethod);
  if (!pub) return 'invalid';
  return verifyBytes(signingInput(vc), vc.proof.proofValue, pub) ? 'valid' : 'invalid';
}
