# Selective Disclosure — Design Spec

**Date:** 2026-07-20
**Goal:** Mirror Guardian's selective-disclosure model: the PDD credential publishes only
**public** attributes; sensitive fields appear as salted-free content hashes (provable,
not readable). The in-app document view marks restricted fields and offers a "Public
view" that renders what an outside verifier would see.

Background: in Guardian, an admin marks schema fields as not-for-public; the public VP
derived from the VC carries only public attributes and is what lands on IPFS.

## Components

### 1. Schema flag (`src/types/index.ts`, methodology data)

- `PddFieldSchema.sensitive?: boolean` (optional — absent means public).
- Marked sensitive (commercially confidential in real PDDs): `investment_metric` and
  `barrier_explanation` — in `stdAdditionalitySection` (`src/data/methodologies/shared.ts`,
  covers the 8 standard methodologies) and the identical fields in
  `src/data/methodology-tver-solar.ts`.

### 2. Disclosure split (`src/lib/pdd.ts`)

`splitDisclosure(m: Methodology, data: Record<string, unknown>): { disclosed: Record<string, unknown>; redacted: Array<{ key: string; value_hash: string }> }`
- Walks `m.pdd_sections`; skips `computed` fields and fields not visible under `showIf`;
  skips empty values (same emptiness rule as `validatePdd`).
- Sensitive fields → `redacted` entry with `value_hash = shortHash(canonical(value))`,
  sorted by key. Everything else → `disclosed[key] = value`.

### 3. Credential subject (`src/lib/guardian.ts`, store)

- `buildPddSubject(pdd, evidence, ipfsCid, disclosure)` — new 4th parameter; the subject
  gains `disclosed` and `redacted` from it (replacing nothing existing).
- `registerProject()` computes `splitDisclosure(m, pdd.section_data)` and passes it in.
  The published VC therefore carries public answers in the clear and sensitive answers
  only as hashes.

### 4. Document view (`src/pages/PddDocument.tsx`)

- Sensitive fields get a small "Restricted" chip (lock icon) next to the label.
- A "Public view" toggle in the toolbar renders the document as the public VP would:
  sensitive values masked as `•••` (chip stays). Default off (in-app actors are
  authorized viewers).

## Testing (TDD)

- `pdd.test.ts`: `splitDisclosure` separates sensitive fields with deterministic hashes;
  respects `showIf` (hidden sensitive field appears in neither list); skips computed and
  empty fields.
- `guardian.test.ts`: `buildPddSubject` embeds `disclosed`/`redacted` verbatim.
- `registration.test.ts`: registered VC subject discloses public fields (e.g.
  `technology`) and redacts `barrier_explanation` (hash only, value absent).
- `pdddocument.ui.test.tsx` (new): Restricted chip renders for a sensitive field; Public
  view masks its value.

## Out of scope (YAGNI)

Role-gated access requests, per-field admin configuration UI, real BBS+ signatures /
cryptographic selective disclosure, redaction of evidence files.
