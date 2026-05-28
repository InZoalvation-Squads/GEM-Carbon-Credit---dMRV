# Sprint 3 — Hedera Guardian Anchoring (Simulated) · Design Spec

**Date:** 2026-05-28
**App:** Carbon Ready (`carbon-ready/`, branch `feat/sprint-1-mvp`)
**Mode:** Simulated in-app (no real Hedera infra, no backend, no Docker, no credentials)
**Status:** Design approved — in implementation (plan: `../plans/2026-05-28-carbon-ready-sprint-3.md`)

> Full Disk Access was granted (2026-05-28); the earlier `~/Documents` TCC lock is resolved and implementation is underway.

---

## 1. Goal / เป้าหมาย

Satisfy the three Sprint 3 bullets — **install Guardian · create Credential Schema · anchor verification result to Hedera** — entirely as a faithful in-app simulation that builds on the seams Sprint 2 left (`verification_requests.credential_id` / `anchored_at`, both currently `null`; `hash_value` written on approve; tamper-evident audit chain).

**Success criteria:**
1. An approved verification package can be **anchored** with one click, after which it shows a credential id + HCS topic/sequence + consensus timestamp + a (mock) HashScan link.
2. A defined **Credential Schema** (W3C VC-style JSON) is visible in the app and governs the issued credential's shape.
3. A **Guardian page** lists the schema and a registry of all anchored credentials.
4. Anchoring writes a `VERIFICATION_ANCHORED` row into the existing hash-chained audit log.
5. Nothing real touches Hedera; no backend, no SDK, no credentials. The app stays runnable as-is.

**Non-goals:** real `@hashgraph/sdk` calls, running Guardian (Docker), real DIDs/keys, IPFS, revocation, auto-anchor worker (manual trigger only), credential verification against a real registry.

---

## 2. Design overview / ภาพรวม

Three simulated pieces mirror real Guardian concepts:

| Bullet | Simulated as | File |
|---|---|---|
| ติดตั้ง Guardian | mock Guardian client (issuer DID, HCS topic, network=testnet config) | `lib/guardian.ts` |
| สร้าง Credential Schema | W3C VC-style JSON schema constant + config | `lib/guardian-schema.ts` |
| Anchor ลง Hedera | `anchorVerification()` store action + manual button + `/guardian` page | store + pages |

**Trigger:** manual. After approve, package is `approved` with `credential_id == null` → "anchoring pending". User clicks **Anchor to Hedera Guardian** on the Review Detail page → simulated issuance + HCS submit → fields populated → banner flips to "Anchored ✓".

---

## 3. Data model changes / โครงสร้างข้อมูล

### `types/index.ts`
```ts
// extend VerificationRequest (credential_id, anchored_at already exist)
interface VerificationRequest {
  // …existing…
  hcs_topic_id: string | null;          // e.g. "0.0.483920"
  hcs_sequence_number: number | null;   // HCS message sequence
}

// new
type AuditAction = … | 'VERIFICATION_ANCHORED';

interface CredentialSchema {
  id: string;            // "mrv-approval-v1"
  name: string;
  version: string;
  type: string;          // "VerifiableCredential" subtype
  properties: { key: string; type: string; description: string }[];
}

interface VerifiableCredential {
  id: string;                    // "urn:vc:..." (credential_id)
  schema_id: string;
  issuer_did: string;            // mock issuer DID
  issued_at: string;
  subject: Record<string, unknown>;   // the approval payload
  package_hash: string;          // == verification.hash_value
  hcs: { topic_id: string; sequence_number: number; consensus_timestamp: string; explorer_url: string };
}
```

> `credential_id` on the verification stores the VC `id`. The full `VerifiableCredential` record is kept in a new store slice `credentials[]` (so the Registry + Review Detail can render the VC without bloating the verification row).

### `store` state additions
```ts
credentials: VerifiableCredential[];
guardianConfig: { issuer_did: string; topic_id: string; network: 'testnet' };
```

---

## 4. Components / units

### 4.1 `lib/guardian-schema.ts`
- Exports `MRV_APPROVAL_SCHEMA_V1: CredentialSchema` — fields: `verification_id, project_id, monitoring_period_start/end, reduction_tco2e, factors_snapshot, evidence (array of {id, content_hash}), approval {actor_role, approved_at}, package_hash`.
- Pure data; no deps.

### 4.2 `lib/guardian.ts` (mock Guardian client)
- `buildApprovalSubject(verification, evidence[]): Record<string,unknown>` — canonical subject conforming to the schema.
- `issueCredential(subject, packageHash, config): VerifiableCredential` — generates `urn:vc:<hash>` id, mock issuer DID, `issued_at`, and a mock `hcs` block: `topic_id` from config, `sequence_number` = incrementing, `consensus_timestamp` = now, `explorer_url` = `https://hashscan.io/testnet/topic/<topic>/message/<seq>` (mock, clearly labelled).
- Uses existing `lib/hash.ts` for any hashing. No network, no async required (or wrap in `tick()` via `api.ts` for realism).

### 4.3 store action `anchorVerification(id)`
- Guard: verification exists, `state === 'approved'`, `credential_id == null`.
- Build subject → `issueCredential(...)` → push to `credentials[]` → set `credential_id`, `anchored_at`, `hcs_topic_id`, `hcs_sequence_number` on the verification.
- `audit_write('VERIFICATION_ANCHORED', 'verification', id, { credential_id, topic, seq }, { previous_value:{ anchored:false }, new_value:{ credential_id, hcs_topic_id, hcs_sequence_number } })` — chains into the existing audit hash.
- Exposed via `lib/api.ts` as `api.anchorVerification(id)`.

### 4.4 Review Detail page (`pages/ReviewDetail.tsx`)
- Locked banner for `approved`:
  - if `credential_id == null` → "🔒 Approved · anchoring pending" + **[ Anchor to Hedera Guardian ]** button.
  - if anchored → "⛓ Anchored ✓" + credential id, HCS topic/sequence, consensus timestamp, HashScan link (mock badge), schema name.

### 4.5 New page `pages/Guardian.tsx` (`/guardian`, sidebar item)
- **Schema tab:** render `MRV_APPROVAL_SCHEMA_V1` (table of fields) + `guardianConfig` (issuer DID, topic, network). A "demo / not a real Hedera connection" notice.
- **Registry tab:** table of `credentials[]` — VC id, project, tCO₂e, HCS topic/seq, anchored_at, explorer link.
- Reuses Sprint 1 components (`Card`, `Table`, `Badge`, `PageHeader`, `EmptyState`).

### 4.6 Wiring
- `App.tsx`: add `/guardian` route.
- `Sidebar.tsx`: add "Guardian" link (icon e.g. `ShieldCheck` / `Link2`).
- `AuditLog.tsx`: add `VERIFICATION_ANCHORED` to `ACTIONS` + `TONE`.
- `seed.ts`: optionally pre-anchor `VR-1000` (so the Registry isn't empty on first load) — issue one seed VC + set its fields, and add a chained `VERIFICATION_ANCHORED` audit row. (Bump persist key `v2 → v3` so the new state shape loads.)

---

## 5. Data flow / ลำดับ

```
approve (Sprint 2)  →  state=approved, hash_value set, credential_id=null  ("anchoring pending")
        │
   user clicks "Anchor"  →  api.anchorVerification(id)
        │
   buildApprovalSubject → issueCredential (mock VC + mock HCS coords)
        │
   store: push credentials[]; set credential_id/anchored_at/hcs_*; audit VERIFICATION_ANCHORED (hash-chained)
        │
   UI: banner → "Anchored ✓"; /guardian Registry shows the VC
```

---

## 6. Error / edge handling

- Anchor button only rendered when `approved && credential_id == null` → no double-anchor.
- `anchorVerification` is a no-op (guarded) if called on a non-approved or already-anchored package.
- Mock explorer URL + a visible "Simulated · not a live Hedera transaction" label everywhere a credential/anchor is shown — so no one mistakes it for a real on-chain record.

---

## 7. Testing

- Unit: `lib/guardian-schema.ts` shape; `guardian.issueCredential()` determinism (same input → same VC id/hash); subject conforms to schema keys.
- Unit: `anchorVerification` guard (rejects non-approved / already-anchored), and that it appends exactly one `VERIFICATION_ANCHORED` audit row keeping the chain valid (`verifyChain` still ✓).
- Keep existing 25 tests green.

---

## 8. File-by-file change list

**New**
- `src/lib/guardian-schema.ts`
- `src/lib/guardian.ts`
- `src/pages/Guardian.tsx`
- (tests) `src/lib/guardian.test.ts`

**Edit**
- `src/types/index.ts` — VerificationRequest (+hcs fields), AuditAction (+VERIFICATION_ANCHORED), new CredentialSchema/VerifiableCredential
- `src/store/index.ts` — state (`credentials`, `guardianConfig`), `anchorVerification`, persist key → v3, resetToSeed
- `src/lib/api.ts` — `anchorVerification`
- `src/data/seed.ts` — pre-anchored VR-1000 VC + chained audit row
- `src/pages/ReviewDetail.tsx` — anchor button + anchored display
- `src/pages/AuditLog.tsx` — new action in filters/tones
- `src/App.tsx` — `/guardian` route
- `src/components/Sidebar.tsx` — Guardian link
- `README.md` + `docs/dMRV-Working-Doc.md` — note Sprint 3 simulated anchoring

---

## 9. Out of scope (future, real Sprint 3)

Real `@hashgraph/sdk`, running Guardian (Docker stack), real DID/keys, IPFS, auto-anchor worker (outbox consumer), credential revocation, on-chain verification. The simulation is structured so each mock (`lib/guardian.ts`, `api.anchorVerification`) is the exact seam a real implementation would replace — same as how `lib/api.ts` will become real `fetch()`.
