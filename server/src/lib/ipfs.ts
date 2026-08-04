// Real IPFS pinning via a Kubo node's HTTP API (POST /api/v0/add). The
// pinned bytes are EXACTLY the canonical preimage of the PDD content hash,
// so anyone can fetch the CID and re-derive `content_hash` offline.
// When no node is configured/reachable the caller keeps the deterministic
// simulated CID (guardian-sim.toIpfsCid) — pinning is best-effort.
import { config } from '../config.js';

export function ipfsEnabled(env: { IPFS_API_URL?: string } = config): boolean {
  if (process.env.NODE_ENV === 'test') return false; // tests mock this module
  return Boolean(env.IPFS_API_URL);
}

/** Add + pin raw bytes; returns the CIDv1 string. Throws on any failure. */
export async function ipfsAddBytes(bytes: Uint8Array | string): Promise<string> {
  const base = String(config.IPFS_API_URL ?? '').replace(/\/+$/, '');
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const copy = new Uint8Array(raw); // fresh ArrayBuffer keeps BlobPart happy
  const form = new FormData();
  form.append('file', new Blob([copy]));
  const res = await fetch(`${base}/api/v0/add?pin=true&cid-version=1`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ipfs add failed: ${res.status}`);
  const json = (await res.json()) as { Hash?: string };
  if (!json.Hash) throw new Error('ipfs add returned no Hash');
  return json.Hash;
}
