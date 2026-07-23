// Content-addressed blob store under config.STORAGE_DIR.
//
// Uploads stream to a tmp file while an incremental node:crypto SHA-256 runs
// over the same bytes; the finished file is renamed to `<STORAGE_DIR>/<hex>`.
// Identical bytes therefore always land on the same path (dedupe) and the
// digest is computed server-side without ever buffering the file in memory.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';

const HEX64 = /^[0-9a-f]{64}$/;

export interface SavedBlob {
  /** Lowercase hex SHA-256 of the stored bytes (also the blob's file name). */
  sha256hex: string;
  /** Byte count actually written. */
  size: number;
  /** Full path of the blob: `<dir>/<sha256hex>`. */
  path: string;
  /**
   * True when an identical blob already existed — this call stored no new
   * file, so a later "undo" (e.g. client_hash mismatch) must NOT delete it.
   */
  existed: boolean;
}

export async function ensureStorageDir(dir: string = config.STORAGE_DIR): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Stream `readable` to disk, hashing as it flows. On any stream error the tmp
 * file is removed and the error rethrown (the caller maps it to an HTTP code).
 */
export async function saveStream(
  readable: Readable,
  dir: string = config.STORAGE_DIR,
): Promise<SavedBlob> {
  await ensureStorageDir(dir);
  const tmp = join(dir, `tmp-${randomBytes(8).toString('hex')}`);
  const hasher = createHash('sha256');
  let size = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hasher.update(chunk);
      size += chunk.length;
      cb(null, chunk);
    },
  });

  try {
    // 'wx' — the random tmp name must not already exist; never overwrite.
    await pipeline(readable, tap, createWriteStream(tmp, { flags: 'wx' }));
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }

  const sha256hex = hasher.digest('hex');
  const path = join(dir, sha256hex);
  let existed = true;
  try {
    await stat(path); // dedupe: same bytes already stored — drop the tmp copy
    await rm(tmp, { force: true });
  } catch {
    existed = false;
    await rename(tmp, path);
  }
  return { sha256hex, size, path, existed };
}

/** Open a stored blob for reading; null when absent (or not a valid hash). */
export async function openFile(
  sha256hex: string,
  dir: string = config.STORAGE_DIR,
): Promise<{ stream: ReadStream; size: number } | null> {
  if (!HEX64.test(sha256hex)) return null; // also blocks any path traversal
  const path = join(dir, sha256hex);
  try {
    const s = await stat(path);
    return { stream: createReadStream(path), size: s.size };
  } catch {
    return null;
  }
}

/**
 * Delete a stored blob (used to undo a rejected upload of FRESH bytes —
 * callers must check `SavedBlob.existed` first: deduped blobs stay).
 */
export async function removeBlob(sha256hex: string, dir: string = config.STORAGE_DIR): Promise<void> {
  if (!HEX64.test(sha256hex)) return;
  await rm(join(dir, sha256hex), { force: true });
}
