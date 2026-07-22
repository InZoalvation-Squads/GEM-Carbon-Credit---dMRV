import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';

// Per-account Ed25519 identity, persisted in localStorage. did:key is the
// W3C-registered method for raw public keys: multibase(base58btc,
// 0xed 0x01 ‖ publicKey) with a leading 'z'.
export interface LocalIdentity {
  did: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

const STORE_KEY = 'carbon-ready-keys-v1';

function loadAll(): Record<string, { pub: string; priv: string }> {
  try { return JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? '{}'); }
  catch { return {}; }
}

export function didKeyFromPublicKey(publicKey: Uint8Array): string {
  const multicodec = new Uint8Array(2 + publicKey.length);
  multicodec.set([0xed, 0x01]); multicodec.set(publicKey, 2);
  return `did:key:z${base58.encode(multicodec)}`;
}

export function getOrCreateIdentity(userId: string): LocalIdentity {
  const all = loadAll();
  if (all[userId]) {
    const pub = hexToBytes(all[userId].pub);
    return { did: didKeyFromPublicKey(pub), publicKey: pub, privateKey: hexToBytes(all[userId].priv) };
  }
  const priv = ed25519.utils.randomSecretKey();
  const pub = ed25519.getPublicKey(priv);
  all[userId] = { pub: bytesToHex(pub), priv: bytesToHex(priv) };
  try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(all)); } catch { /* ephemeral env */ }
  return { did: didKeyFromPublicKey(pub), publicKey: pub, privateKey: priv };
}

export function signBytes(msg: Uint8Array, id: LocalIdentity): string {
  return bytesToHex(ed25519.sign(msg, id.privateKey));
}

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
