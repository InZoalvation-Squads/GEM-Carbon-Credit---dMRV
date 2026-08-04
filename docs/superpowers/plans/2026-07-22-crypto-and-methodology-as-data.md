# Real Crypto + Methodology-as-Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all fake cryptography with real SHA-256 / Ed25519 / did:key (Guardian migration Phase 0), and make methodologies importable JSON documents with real parameter units.

**Architecture:** Everything stays in the SPA (no backend yet). `lib/hash.ts` becomes real SHA-256 (sync, `@noble/hashes`); new `lib/identity.ts` issues per-account `did:key` Ed25519 identities; VCs gain W3C `@context`/`proof` and offline verification; selective disclosure gains per-field random salts stored privately on the PDD; evidence hashes real file bytes. A new `lib/methodology-schema.ts` (zod) validates methodology JSON for import/export, and `MonitoringRecord` gains explicit `param_key`/`unit`.

**Tech Stack:** React 18, TypeScript, zustand, vitest; new deps: `@noble/hashes`, `@noble/curves`, `@scure/base`, `zod`.

**Specs:** `docs/superpowers/specs/2026-07-22-guardian-api-migration-design.md`, `docs/superpowers/specs/2026-07-22-methodology-as-data-design.md`

**Working dir:** all paths relative to `carbon-ready/`. Run tests with `npm test` (vitest). Existing suites MUST stay green after every task. Keep the store persist key at `carbon-ready-store-v14` bumping to `-v15` ONLY in Task 9 (schema of persisted records changes there).

---

### Task 1: Dependencies

**Files:** Modify: `package.json` (via npm)

- [ ] **Step 1:** `cd carbon-ready && npm install @noble/hashes @noble/curves @scure/base zod`
- [ ] **Step 2:** `npm test` — expected: all suites pass (baseline).
- [ ] **Step 3:** Commit: `git add package.json package-lock.json && git commit -m "chore: add noble crypto + zod deps"`

### Task 2: Real SHA-256 in `lib/hash.ts`

**Files:**
- Modify: `src/lib/hash.ts`
- Modify: `src/lib/guardian.ts` (CID/id derivation sites that strip `…`)
- Test: `src/lib/hash.test.ts` (new)

- [ ] **Step 1: Write failing test** `src/lib/hash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shortHash, sha256Hex, sha256HexBytes, canonical } from './hash';

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
  it('canonical is stable across key order', () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }))
      .toBe(canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });
});
```

- [ ] **Step 2:** `npm test -- hash.test` — expected FAIL (`sha256Hex` not exported).
- [ ] **Step 3:** Rewrite `src/lib/hash.ts` (keep `canonical` as-is, replace `shortHash` body):

```ts
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

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
```

- [ ] **Step 4:** In `src/lib/guardian.ts`, the digest no longer carries `…`; simplify the two strip sites:
  - `toIpfsCid`: `const hex = contentHash.replace('sha256-', '');` (drop the `'…'` replace; keep `padEnd(20,'0').slice(0,20)` behavior).
  - `issueCredential` id: `` const id = `urn:vc:${shortHash(`${packageHash}|${sequenceNumber}`).replace('sha256-', '').slice(0, 24)}`; ``
- [ ] **Step 5:** `npm test` — fix any suite that asserted 12-hex digests (update expectations to the `[0-9a-f]{64}` shape, never hardcode digests except NIST vectors). Expected: all pass.
- [ ] **Step 6:** Commit: `git commit -am "feat(crypto): real SHA-256 content hashing via @noble/hashes"`

### Task 3: Salted selective disclosure

**Files:**
- Modify: `src/lib/pdd.ts` (`splitDisclosure` signature), `src/types/index.ts` (PDD gains `disclosure_salts`), `src/store/index.ts` (`registerProject`)
- Test: `src/lib/pdd.test.ts` (extend)

- [ ] **Step 1: Failing tests** (append to `src/lib/pdd.test.ts`; reuse that file's existing methodology fixture, referred to here as `m`, with a field marked `sensitive: true` — add one to the fixture if absent):

```ts
import { splitDisclosure, verifyDisclosedValue } from './pdd';

describe('salted selective disclosure', () => {
  const data = { investment_metric: 'IRR 4.2%', project_name: 'X' };
  it('redacts with a per-field salt so equal values hash differently across salts', () => {
    const a = splitDisclosure(m, data, { investment_metric: 'aa'.repeat(16) });
    const b = splitDisclosure(m, data, { investment_metric: 'bb'.repeat(16) });
    expect(a.redacted[0].value_hash).not.toBe(b.redacted[0].value_hash);
  });
  it('verifies a disclosed value against hash+salt, and rejects a tampered value', () => {
    const salts = { investment_metric: 'ab'.repeat(16) };
    const split = splitDisclosure(m, data, salts);
    const r = split.redacted.find((x) => x.key === 'investment_metric')!;
    expect(verifyDisclosedValue('IRR 4.2%', salts.investment_metric, r.value_hash)).toBe(true);
    expect(verifyDisclosedValue('IRR 9.9%', salts.investment_metric, r.value_hash)).toBe(false);
  });
});
```

- [ ] **Step 2:** `npm test -- pdd.test` — expected FAIL.
- [ ] **Step 3:** Implement in `src/lib/pdd.ts`:

```ts
/** Guardian-style selective disclosure. Salts (hex, per sensitive field key)
 *  keep published hashes non-guessable; the owner retains them privately. */
export function splitDisclosure(
  m: Methodology,
  data: Record<string, unknown>,
  salts: Record<string, string> = {},
): DisclosureSplit {
  // ...same loop as today, but for sensitive fields:
  // redacted.push({ key: field.key, value_hash: saltedValueHash(salts[field.key] ?? '', v) });
}

export function saltedValueHash(salt: string, value: unknown): string {
  return shortHash(`${salt}|${canonical(value)}`);
}

export function verifyDisclosedValue(value: unknown, salt: string, value_hash: string): boolean {
  return saltedValueHash(salt, value) === value_hash;
}
```

- [ ] **Step 4:** `src/types/index.ts` — add to `ProjectDesignDocument`: `disclosure_salts?: Record<string, string>; // hex salt per sensitive field, private side of selective disclosure`
- [ ] **Step 5:** `src/store/index.ts` `registerProject`: before issuing the VC, build salts for every sensitive+visible+filled field with `randomSaltHex()`, pass them to `splitDisclosure(m, pdd.section_data, salts)`, and persist `disclosure_salts: salts` on the frozen PDD update.
- [ ] **Step 6:** `npm test` — all pass (existing 2-arg `splitDisclosure` callers still compile via the default). Commit: `git commit -am "feat(crypto): salted selective disclosure with offline value verification"`

### Task 4: Evidence content hash from real file bytes

**Files:**
- Modify: `src/store/index.ts` (`uploadEvidence`/`replaceEvidence` accept optional `content_hash`), `src/components/EvidenceUploadModal.tsx` + `src/components/FileDrop.tsx` (compute hash from `File`)
- Test: `src/store/` existing evidence test file if present, else `src/store/evidence.test.ts` (new)

- [ ] **Step 1: Failing test** (`src/store/evidence.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { useStore } from './index';
import { sha256HexBytes } from '../lib/hash';

describe('evidence content hashing', () => {
  it('uses the caller-supplied byte hash when provided', () => {
    const bytes = new TextEncoder().encode('meter,2026-01-01,1234');
    const digest = `sha256-${sha256HexBytes(bytes)}`;
    const ev = useStore.getState().uploadEvidence('prj-test', {
      file_name: 'jan.csv', kind: 'xlsx', file_size: bytes.length,
      category: 'meter_reading', content_hash: digest,
    });
    expect(ev.content_hash).toBe(digest);
  });
  it('falls back to metadata hash when bytes are unavailable', () => {
    const ev = useStore.getState().uploadEvidence('prj-test', {
      file_name: 'a.pdf', kind: 'pdf', file_size: 10, category: 'site_photo',
    });
    expect(ev.content_hash).toMatch(/^sha256-[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2:** Run — FAIL (unknown `content_hash` input). Implement: extend the `uploadEvidence` input type with `content_hash?: string`, use it when present (`content_hash: input.content_hash ?? shortHash(input.file_name + input.file_size)`); same for `replaceEvidence`.
- [ ] **Step 3:** UI wiring: where the upload modal currently has the selected `File`, add

```ts
async function hashFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `sha256-${sha256HexBytes(bytes)}`;
}
```

and pass the result through the existing `api` call into `uploadEvidence`/`replaceEvidence`. Read `EvidenceUploadModal.tsx` first; if it only tracks file metadata (no `File` object), thread the `File` from `FileDrop` through its `onSelect` callback.
- [ ] **Step 4:** `npm test` — all pass. Commit: `git commit -am "feat(crypto): evidence content hash computed from real file bytes"`

### Task 5: `did:key` identities (`lib/identity.ts`)

**Files:**
- Create: `src/lib/identity.ts`
- Test: `src/lib/identity.test.ts` (new)

- [ ] **Step 1: Failing test**:

```ts
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
```

- [ ] **Step 2:** Run — FAIL (module missing). Create `src/lib/identity.ts`:

```ts
import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
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
  const priv = ed25519.utils.randomPrivateKey();
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
```

- [ ] **Step 3:** `npm test -- identity` — PASS. Commit: `git commit -am "feat(crypto): per-account did:key Ed25519 identities"`

### Task 6: Signed W3C VCs + offline verification + UI verify

**Files:**
- Modify: `src/types/index.ts` (`VerifiableCredential` gains W3C fields), `src/lib/guardian.ts` (`issueCredential` signs), `src/store/index.ts` (pass issuer identity), `src/pages/Guardian.tsx` (Verify button)
- Create: `src/lib/vc.ts` (sign/verify helpers)
- Test: `src/lib/vc.test.ts` (new)

- [ ] **Step 1:** Types — add optional fields to `VerifiableCredential`:

```ts
  context?: string[];         // ['https://www.w3.org/ns/credentials/v2']
  vc_type?: string[];         // ['VerifiableCredential', schema.type]
  proof?: {
    type: 'Ed25519Signature2020';
    created: string;
    verificationMethod: string;   // issuer did:key
    proofValue: string;           // hex signature over sha256(canonical(vc sans proof))
  };
```

(Optional so seed credentials — issued before signing existed — still type-check; the UI labels those "unsigned seed data".)

- [ ] **Step 2: Failing test** `src/lib/vc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { signCredential, verifyCredential } from './vc';
import { getOrCreateIdentity } from './identity';

const base = {
  id: 'urn:vc:test', schema_id: 's1', issuer_did: '', issued_at: '2026-07-22T00:00:00Z',
  subject: { a: 1 }, package_hash: 'sha256-ab',
  hcs: { topic_id: '0.0.1', sequence_number: 1, consensus_timestamp: 'x', explorer_url: 'y' },
};

describe('vc sign/verify', () => {
  it('signs and verifies offline', () => {
    const issuer = getOrCreateIdentity('registry');
    const vc = signCredential({ ...base, issuer_did: issuer.did }, issuer);
    expect(vc.proof?.type).toBe('Ed25519Signature2020');
    expect(verifyCredential(vc)).toBe('valid');
  });
  it('flags tampered subjects', () => {
    const issuer = getOrCreateIdentity('registry');
    const vc = signCredential({ ...base, issuer_did: issuer.did }, issuer);
    expect(verifyCredential({ ...vc, subject: { a: 2 } })).toBe('invalid');
  });
  it('reports unsigned for seed-era credentials', () => {
    expect(verifyCredential(base)).toBe('unsigned');
  });
});
```

- [ ] **Step 3:** Run — FAIL. Create `src/lib/vc.ts`:

```ts
import type { VerifiableCredential } from '../types';
import { canonical, sha256Hex } from './hash';
import { hexToBytes } from '@noble/hashes/utils';
import { signBytes, verifyBytes, publicKeyFromDidKey, type LocalIdentity } from './identity';

export type VcVerdict = 'valid' | 'invalid' | 'unsigned';

const W3C_CONTEXT = ['https://www.w3.org/ns/credentials/v2'];

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
  const pub = publicKeyFromDidKey(vc.proof.verificationMethod);
  if (!pub) return 'invalid';
  return verifyBytes(signingInput(vc), vc.proof.proofValue, pub) ? 'valid' : 'invalid';
}
```

- [ ] **Step 4:** Wire issuance: in `src/lib/guardian.ts` `issueCredential(...)` add a final param `issuer: LocalIdentity` and return `signCredential(vcObject, issuer)` (set `vc_type: ['VerifiableCredential', schema.type]`). In `src/store/index.ts` (`anchorVerification`, `registerProject`), obtain `const issuer = getOrCreateIdentity(\`issuer:${get().organization.id}\`)` and pass it. The registry's did:key replaces `issuer_did` on new credentials; `DEFAULT_GUARDIAN_CONFIG.issuer_did` remains only as display fallback for seed rows.
- [ ] **Step 5:** UI: in `src/pages/Guardian.tsx` credential card add a "Verify signature" button calling `verifyCredential(vc)` and showing verdict (`valid` → green check "Signature valid (Ed25519)", `invalid` → red, `unsigned` → neutral "Unsigned (seed data)"). Follow the existing badge/button components in that file.
- [ ] **Step 6:** `npm test` (guardian.test.ts will need the new issuer param in direct `issueCredential` calls — update fixtures with `getOrCreateIdentity('test-issuer')`). Expected: all pass. Commit: `git commit -am "feat(crypto): Ed25519-signed W3C credentials with offline verification"`

### Task 7: Methodology zod schema (`lib/methodology-schema.ts`)

**Files:**
- Create: `src/lib/methodology-schema.ts`
- Test: `src/lib/methodology-schema.test.ts` (new)

- [ ] **Step 1: Failing test**:

```ts
import { describe, it, expect } from 'vitest';
import { parseMethodologyJson, methodologyToJson } from './methodology-schema';
import { seedMethodologies } from '../data/seed';

describe('methodology JSON schema v2', () => {
  it('accepts every bundled methodology (export → import parity)', () => {
    for (const m of seedMethodologies) {
      const r = parseMethodologyJson(methodologyToJson(m));
      expect(r.ok, `${m.code}: ${JSON.stringify(!r.ok && r.errors)}`).toBe(true);
    }
  });
  it('rejects calculation.input_param not present in monitoring_params', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.calculation.input_param = 'nope';
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });
  it('rejects unit mismatch between calculation and its driver param', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.calculation.input_unit = 'bananas';
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });
  it('rejects showIf pointing at a nonexistent field', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    bad.pdd_sections[0].fields[0].showIf = { field: 'ghost', equals: 'x' };
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });
  it('rejects duplicate field keys across sections', () => {
    const bad = JSON.parse(methodologyToJson(seedMethodologies[0]));
    const f = { ...bad.pdd_sections[0].fields[0] };
    bad.pdd_sections[bad.pdd_sections.length - 1].fields.push(f);
    expect(parseMethodologyJson(JSON.stringify(bad)).ok).toBe(false);
  });
});
```

- [ ] **Step 2:** Run — FAIL. Implement `src/lib/methodology-schema.ts`: zod schemas mirroring the TS types (`PddFieldSchema` incl. `sensitive`, `showIf`, computed `source` enum; `MonitoringParam`; `MethodologyCalculation` with formula enum), plus `.superRefine` cross-checks: input_param exists, input_unit equals that param's unit, showIf targets exist, select ⇒ options non-empty, computed ⇒ source present, unique field keys, `gwp_ch4` required iff formula `ch4_avoidance`. Export:

```ts
export type ParseResult =
  | { ok: true; methodology: Omit<Methodology, 'id'> }
  | { ok: false; errors: string[] };
export function parseMethodologyJson(text: string): ParseResult { /* zod parse + refine */ }
export function methodologyToJson(m: Methodology): string {
  const { id: _id, ...doc } = m;
  return JSON.stringify({ schema_version: 2, ...doc }, null, 2);
}
```

`parseMethodologyJson` accepts documents with `schema_version: 2` (reject others with a clear error) and strips it from the returned methodology.
- [ ] **Step 3:** `npm test -- methodology-schema` — PASS. Commit: `git commit -am "feat(methodology): zod schema v2 + JSON export/import parsing"`

### Task 8: Import/export in store + Methodologies page

**Files:**
- Modify: `src/types/index.ts` (`AuditAction` += `'METHODOLOGY_IMPORTED'`), `src/store/index.ts` (`importMethodology`), `src/pages/Methodologies.tsx` (Import/Export UI)
- Test: `src/store/methodology-import.test.ts` (new)

- [ ] **Step 1: Failing test**:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';
import { methodologyToJson } from '../lib/methodology-schema';

describe('importMethodology', () => {
  beforeEach(() => {
    useStore.getState().resetToSeed();
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'admin' } }));
  });
  it('imports a valid document under a fresh id and audit-logs it', () => {
    const doc = JSON.parse(methodologyToJson(useStore.getState().methodologies[0]));
    doc.code = 'TEST-001'; doc.name = 'Imported test methodology';
    const r = useStore.getState().importMethodology(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    expect(useStore.getState().methodologies.some((m) => m.code === 'TEST-001')).toBe(true);
    expect(useStore.getState().audit[0].action).toBe('METHODOLOGY_IMPORTED');
  });
  it('rejects duplicate code+version', () => {
    const doc = methodologyToJson(useStore.getState().methodologies[0]);
    expect(useStore.getState().importMethodology(doc).ok).toBe(false);
  });
  it('blocks non-admin roles', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    const doc = JSON.parse(methodologyToJson(useStore.getState().methodologies[0]));
    doc.code = 'TEST-002';
    expect(useStore.getState().importMethodology(JSON.stringify(doc)).ok).toBe(false);
  });
});
```

- [ ] **Step 2:** Run — FAIL. Implement store action:

```ts
importMethodology: (json: string): { ok: boolean; error?: string } => {
  if (get().currentUser.role !== 'admin') return { ok: false, error: 'Only the Standard Registry can import methodologies.' };
  const parsed = parseMethodologyJson(json);
  if (!parsed.ok) return { ok: false, error: parsed.errors.join('; ') };
  const doc = parsed.methodology;
  if (get().methodologies.some((m) => m.code === doc.code && m.version === doc.version))
    return { ok: false, error: `${doc.code} v${doc.version} already exists.` };
  const m: Methodology = { id: uid('mth'), ...doc };
  set((s) => ({ methodologies: [...s.methodologies, m] }));
  get().audit_write('METHODOLOGY_IMPORTED', 'methodology', m.id,
    { code: m.code, version: m.version }, { new_value: { code: m.code, version: m.version } });
  return { ok: true };
},
```

- [ ] **Step 3:** UI in `Methodologies.tsx`: per-card "Export JSON" (Blob download of `methodologyToJson(m)` named `<code>-v<version>.json`) for all roles; "Import methodology" button (admin only) opening a file input, reading text, calling `api`-wrapped `importMethodology`, toasting the error string on failure. Follow the page's existing Button/Toast patterns.
- [ ] **Step 4:** `npm test` — PASS. Commit: `git commit -am "feat(methodology): JSON import/export with registry-only import + audit"`

### Task 9: Monitoring params get explicit key + unit

**Files:**
- Modify: `src/types/index.ts` (`MonitoringRecord` += `param_key?`, `unit?`), `src/store/index.ts` (`addMonitoringRecords` stamps driver param; bump persist key to `carbon-ready-store-v15`), `src/lib/calc.ts` (filter to driver param), `src/pages/Upload.tsx` (unit label)
- Test: `src/lib/calc.test.ts` (extend)

- [ ] **Step 1: Failing test** (append to `calc.test.ts`):

```ts
it('sums only the driver param and treats legacy rows (no param_key) as the driver', () => {
  const recs = [
    { id: '1', project_id: 'p', record_date: '2026-01-01', generation_kwh: 100, source: 's', uploaded_at: 't', param_key: 'generation_kwh', unit: 'kWh' },
    { id: '2', project_id: 'p', record_date: '2026-01-02', generation_kwh: 50,  source: 's', uploaded_at: 't' },                        // legacy
    { id: '3', project_id: 'p', record_date: '2026-01-03', generation_kwh: 999, source: 's', uploaded_at: 't', param_key: 'aux_temp', unit: 'C' }, // ignored
  ];
  const out = calculateCarbon(recs, factors, undefined,
    { formula: 'grid_displacement', input_param: 'generation_kwh', input_unit: 'kWh' });
  expect(out.totals.generation_kwh).toBe(150);
});
```

- [ ] **Step 2:** Run — FAIL (999 included). Implement: at the top of `calculateCarbon`, when `calculation` is provided filter `records = records.filter((r) => !r.param_key || r.param_key === calculation.input_param)`.
- [ ] **Step 3:** Store: `addMonitoringRecords(project_id, rows)` resolves the project's methodology (via `pddByProject` → `methodologies`) and stamps `param_key: m.calculation.input_param, unit: m.calculation.input_unit` on each new record (omit both when the project has no registered methodology). Bump persist name to `'carbon-ready-store-v15'`.
- [ ] **Step 4:** `Upload.tsx`: where the value column/label assumes kWh, show the registered methodology's driver unit (`m.calculation.input_unit`), falling back to kWh.
- [ ] **Step 5:** `npm test` — all pass. Commit: `git commit -am "feat(methodology): explicit monitoring param key + unit on records"`

### Task 10: Full verification

- [ ] **Step 1:** `npm test` — every suite green.
- [ ] **Step 2:** `npx tsc -b` — zero errors. `npm run build` — succeeds.
- [ ] **Step 3:** Manual smoke via dev server: register a PDD (check Restricted chip still renders, credential shows "Signature valid"), upload evidence with a real file, anchor + mint as admin, export a methodology, re-import with changed code.
- [ ] **Step 4:** Final commit of any stragglers.
