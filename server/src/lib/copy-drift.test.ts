// Guards the "copied from carbon-ready — source of truth until workspaces
// (Phase 1b)" contract: every lib file ported from the SPA must stay in sync
// with its source. Full copies must equal the source modulo the header comment
// and import lines; partial ports must have every top-level declaration appear
// VERBATIM (whitespace-normalized) in the SPA source. When one of these tests
// fails, re-copy from carbon-ready — never edit the server copy independently.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const SERVER_LIB = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SERVER_LIB, '..', '..', '..');
const SPA_SRC = join(REPO_ROOT, 'carbon-ready', 'src');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * Strip everything that is ALLOWED to differ between copy and source:
 * comments (header + inline) and import statements (which point at different
 * relative paths / drop DOM-only deps). Line-based state machine so multi-line
 * imports and block comments are handled.
 */
function stripCommentsAndImports(src: string): string {
  const out: string[] = [];
  let inBlockComment = false;
  let inImport = false;
  for (const line of src.split('\n')) {
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    if (inImport) {
      if (line.includes(';')) inImport = false;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('import ') || trimmed === 'import') {
      if (!trimmed.includes(';')) inImport = true;
      continue;
    }
    if (trimmed === '') continue;
    out.push(line);
  }
  return out.join('\n');
}

/** Collapse all whitespace so wrapping/indentation differences don't matter. */
function normalize(src: string): string {
  return src.replace(/\s+/g, ' ').trim();
}

/** Top-level exported declarations of a (stripped) module. */
function exportedChunks(stripped: string): string[] {
  return stripped
    .split(/^(?=export )/m)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('export '));
}

/**
 * Assert every exported declaration of the server file appears verbatim
 * (normalized) in the SPA source file — the check for PARTIAL ports.
 */
function expectChunksInSource(serverFile: string, spaFile: string): void {
  const chunks = exportedChunks(stripCommentsAndImports(read(serverFile)));
  expect(chunks.length).toBeGreaterThan(0);
  const source = normalize(stripCommentsAndImports(read(spaFile)));
  for (const chunk of chunks) {
    const name = chunk.split('\n')[0]!.slice(0, 80);
    expect(source, `drifted from SPA source: "${name}…"`).toContain(normalize(chunk));
  }
}

describe('copied libs stay in sync with their carbon-ready sources', () => {
  it('methodology-schema.ts is a full copy (equal modulo header + imports)', () => {
    const server = normalize(stripCommentsAndImports(read(join(SERVER_LIB, 'methodology-schema.ts'))));
    const spa = normalize(stripCommentsAndImports(read(join(SPA_SRC, 'lib', 'methodology-schema.ts'))));
    expect(server).toBe(spa);
  });

  it('hash.ts declarations match (partial: DOM-only hashFileBytes dropped)', () => {
    expectChunksInSource(join(SERVER_LIB, 'hash.ts'), join(SPA_SRC, 'lib', 'hash.ts'));
  });

  it('methodology-types.ts blocks match the SPA type file note-for-note', () => {
    expectChunksInSource(join(SERVER_LIB, 'methodology-types.ts'), join(SPA_SRC, 'types', 'index.ts'));
  });

  it('pdd-sites.ts functions match (partial: parseSites/isBundle only)', () => {
    expectChunksInSource(join(SERVER_LIB, 'pdd-sites.ts'), join(SPA_SRC, 'lib', 'pdd-sites.ts'));
  });

  it('pdd.ts functions match (partial: resolveComputed/gridFactor dropped)', () => {
    expectChunksInSource(join(SERVER_LIB, 'pdd.ts'), join(SPA_SRC, 'lib', 'pdd.ts'));
  });

  it('guardian-sim.ts stand-ins match guardian.ts (partial: pure parts only)', () => {
    expectChunksInSource(join(SERVER_LIB, 'guardian-sim.ts'), join(SPA_SRC, 'lib', 'guardian.ts'));
  });

  it('identity.ts matches (partial: verify path only — no keygen/signing/custody)', () => {
    expectChunksInSource(join(SERVER_LIB, 'identity.ts'), join(SPA_SRC, 'lib', 'identity.ts'));
  });

  it('vc.ts matches (partial: verify path only — signCredential stays in the browser)', () => {
    expectChunksInSource(join(SERVER_LIB, 'vc.ts'), join(SPA_SRC, 'lib', 'vc.ts'));
  });

  it('vc-types.ts blocks match the SPA type file note-for-note', () => {
    expectChunksInSource(join(SERVER_LIB, 'vc-types.ts'), join(SPA_SRC, 'types', 'index.ts'));
  });
});
