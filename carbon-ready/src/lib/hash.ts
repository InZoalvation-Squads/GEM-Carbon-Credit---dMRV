import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Real SHA-256 (sync, pure JS). shortHash keeps its historical name and
// `sha256-` prefix so persisted stores/UI keep rendering, but the digest is
// now a genuine 64-hex SHA-256 (previously a 12-hex FNV stand-in).
export function sha256Hex(input: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(input)));
}

export function sha256HexBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

export function shortHash(input: string): string {
  return `sha256-${sha256Hex(input)}`;
}

export function randomSaltHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

// Stable JSON: sort keys so the same logical value always hashes identically.
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}
