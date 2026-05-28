# Sprint 3 — Guardian Anchoring (Simulated) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simulated Hedera Guardian anchoring flow to Carbon Ready — define a credential schema, "issue" a Verifiable Credential, and anchor an approved verification to a mock HCS topic, all in-app with no real Hedera infra.

**Architecture:** Pure helpers (`lib/guardian-schema.ts`, `lib/guardian.ts`) build the credential + mock HCS coordinates. A zustand action `anchorVerification(id)` writes the result onto the approved package and appends a `VERIFICATION_ANCHORED` row to the existing hash-chained audit log. A manual "Anchor" button on Review Detail triggers it; a new `/guardian` page shows the schema and a registry of issued credentials.

**Tech Stack:** React 18 + TypeScript (strict) + Zustand 4 (persist) + Tailwind 3 + React Router 6 + Vitest 1. Existing Sprint 1 components (`Card`, `Table`, `Badge`, `PageHeader`, `EmptyState`, `Button`).

> ✅ **Prerequisite (met):** Full Disk Access granted (2026-05-28); repo is readable/writable. Baseline verified: `npx tsc -b` passes and the existing 25 tests are green before starting.

---

## File Structure

**New files**
- `src/lib/guardian-schema.ts` — the `MRV_APPROVAL_SCHEMA_V1` credential schema constant.
- `src/lib/guardian.ts` — `DEFAULT_GUARDIAN_CONFIG`, `buildApprovalSubject()`, `issueCredential()` (pure, mock Guardian client).
- `src/lib/guardian.test.ts` — unit tests for the two pure functions.
- `src/store/anchor.test.ts` — unit test for the `anchorVerification` store action + chain integrity.
- `src/pages/Guardian.tsx` — `/guardian` page (Schema + Registry tabs).

**Edited files**
- `src/types/index.ts` — `VerificationRequest` (+2 hcs fields), `AuditAction` (+`VERIFICATION_ANCHORED`), new `CredentialSchema` + `VerifiableCredential` + `GuardianConfig`.
- `src/store/index.ts` — `credentials`/`guardianConfig` state, `anchorVerification`, persist key `v2→v3`, `resetToSeed`.
- `src/lib/api.ts` — `anchorVerification` facade.
- `src/data/seed.ts` — `seedCredentials`, pre-anchored `VR-1000`, chained `VERIFICATION_ANCHORED` audit row.
- `src/pages/ReviewDetail.tsx` — anchor button + anchored display in the approved banner.
- `src/pages/AuditLog.tsx` — `VERIFICATION_ANCHORED` in `ACTIONS` + `TONE`.
- `src/App.tsx` — `/guardian` route.
- `src/components/Sidebar.tsx` — Guardian nav link.
- `README.md`, `docs/dMRV-Working-Doc.md` — Sprint 3 note.

---

## Task 1: Types for credential schema, VC, and anchoring

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add `VERIFICATION_ANCHORED` to `AuditAction`**

In the `AuditAction` union, after `'VERIFICATION_REJECTED'`, add:
```ts
  | 'VERIFICATION_ANCHORED';
```

- [ ] **Step 2: Add HCS fields to `VerificationRequest`**

In `interface VerificationRequest`, directly after the existing `hash_value`, `credential_id`, `anchored_at` lines, add:
```ts
  hcs_topic_id: string | null;
  hcs_sequence_number: number | null;
```

- [ ] **Step 3: Append the new Sprint 3 types at the end of the file**

```ts
// ============================================================
// Sprint 3 — Hedera Guardian (simulated)
// ============================================================
export interface GuardianConfig {
  issuer_did: string;
  topic_id: string;
  network: 'testnet';
}

export interface CredentialSchemaProperty {
  key: string;
  type: string;
  description: string;
}

export interface CredentialSchema {
  id: string;
  name: string;
  version: string;
  type: string;
  properties: CredentialSchemaProperty[];
}

export interface VerifiableCredential {
  id: string;                 // also stored as VerificationRequest.credential_id
  schema_id: string;
  issuer_did: string;
  issued_at: string;
  subject: Record<string, unknown>;
  package_hash: string;
  hcs: {
    topic_id: string;
    sequence_number: number;
    consensus_timestamp: string;
    explorer_url: string;
  };
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc -b`
Expected: PASS (no usages yet; this only adds optional/standalone types and two new non-optional fields on `VerificationRequest` — seed entries get them in Task 6, so tsc may report missing fields on seed objects. If so, that's expected until Task 6; you may run this check again after Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Guardian credential schema, VC, and anchoring types"
```

---

## Task 2: Credential schema constant

**Files:**
- Create: `src/lib/guardian-schema.ts`

- [ ] **Step 1: Write the schema**

```ts
import type { CredentialSchema } from '../types';

// W3C Verifiable-Credential-style schema for an MRV carbon-reduction approval.
// In a real Guardian deployment this would be a published schema bound to a policy.
export const MRV_APPROVAL_SCHEMA_V1: CredentialSchema = {
  id: 'mrv-approval-v1',
  name: 'MRV Carbon Reduction Approval',
  version: '1.0.0',
  type: 'VerifiableCredential',
  properties: [
    { key: 'verification_id', type: 'string', description: 'Verification package id' },
    { key: 'project_id', type: 'string', description: 'Project id' },
    { key: 'monitoring_period_start', type: 'date', description: 'Monitoring period start (ISO date)' },
    { key: 'monitoring_period_end', type: 'date', description: 'Monitoring period end (ISO date)' },
    { key: 'reduction_tco2e', type: 'number', description: 'Verified carbon reduction (tCO2e)' },
    { key: 'factors_snapshot', type: 'string', description: 'Emission factor snapshot used' },
    { key: 'evidence', type: 'array', description: 'Evidence items as {id, content_hash}' },
    { key: 'approval_role', type: 'string', description: 'Role that approved the package' },
    { key: 'approved_at', type: 'date', description: 'Approval (lock) timestamp' },
    { key: 'package_hash', type: 'string', description: 'Hash of the approved package' },
  ],
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/guardian-schema.ts
git commit -m "feat(guardian): add MRV approval credential schema"
```

---

## Task 3: Mock Guardian client (pure functions) — TDD

**Files:**
- Create: `src/lib/guardian.ts`
- Test: `src/lib/guardian.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildApprovalSubject, issueCredential, DEFAULT_GUARDIAN_CONFIG } from './guardian';
import { MRV_APPROVAL_SCHEMA_V1 } from './guardian-schema';
import type { EvidenceFile, VerificationRequest } from '../types';

const v: VerificationRequest = {
  id: 'VR-T1', project_id: 'prj-x', created_by: 'u1', owner_name: 'O', assigned_verifier_name: 'V',
  state: 'approved', monitoring_period_start: '2026-04-01', monitoring_period_end: '2026-04-30',
  reduction_kgco2e: 23700, factors_snapshot: 'CEA 2025-v2', evidence_ids: ['ev-b', 'ev-a'],
  required_categories: ['meter_reading'], submitted_at: '2026-05-01T00:00:00Z',
  locked_at: '2026-05-10T00:00:00Z', sla_target_days: 7,
  hash_value: 'sha256-deadbeef', credential_id: null, anchored_at: null,
  hcs_topic_id: null, hcs_sequence_number: null,
};
const ev: EvidenceFile[] = [
  { id: 'ev-a', project_id: 'prj-x', parent_id: null, category: 'meter_reading', file_name: 'a.pdf', kind: 'pdf', file_size: 1, version_number: 1, status: 'active', content_hash: 'sha256-aaa', uploaded_by: 'u1', uploaded_by_name: 'O', uploaded_at: '2026-04-02T00:00:00Z' },
  { id: 'ev-b', project_id: 'prj-x', parent_id: null, category: 'utility_bill', file_name: 'b.pdf', kind: 'pdf', file_size: 1, version_number: 1, status: 'active', content_hash: 'sha256-bbb', uploaded_by: 'u1', uploaded_by_name: 'O', uploaded_at: '2026-04-02T00:00:00Z' },
];

describe('buildApprovalSubject', () => {
  it('maps verification + evidence into the schema subject, evidence sorted by id', () => {
    const s = buildApprovalSubject(v, ev);
    expect(s.verification_id).toBe('VR-T1');
    expect(s.reduction_tco2e).toBe(23.7);
    expect(s.package_hash).toBe('sha256-deadbeef');
    expect(s.evidence).toEqual([
      { id: 'ev-a', content_hash: 'sha256-aaa' },
      { id: 'ev-b', content_hash: 'sha256-bbb' },
    ]);
  });
});

describe('issueCredential', () => {
  it('is deterministic for the same inputs and embeds mock HCS coordinates', () => {
    const subject = buildApprovalSubject(v, ev);
    const a = issueCredential(subject, v.hash_value!, 7, DEFAULT_GUARDIAN_CONFIG, MRV_APPROVAL_SCHEMA_V1, '2026-05-10T00:00:00Z');
    const b = issueCredential(subject, v.hash_value!, 7, DEFAULT_GUARDIAN_CONFIG, MRV_APPROVAL_SCHEMA_V1, '2026-05-10T00:00:00Z');
    expect(a.id).toBe(b.id);
    expect(a.id.startsWith('urn:vc:')).toBe(true);
    expect(a.schema_id).toBe('mrv-approval-v1');
    expect(a.hcs.topic_id).toBe(DEFAULT_GUARDIAN_CONFIG.topic_id);
    expect(a.hcs.sequence_number).toBe(7);
    expect(a.hcs.explorer_url).toContain('/topic/' + DEFAULT_GUARDIAN_CONFIG.topic_id + '/message/7');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/guardian.test.ts`
Expected: FAIL — `Failed to resolve import './guardian'` / functions not defined.

- [ ] **Step 3: Write the implementation**

```ts
import type { CredentialSchema, EvidenceFile, GuardianConfig, VerifiableCredential, VerificationRequest } from '../types';
import { shortHash } from './hash';

// Stand-in for a Hedera Guardian deployment. Each function here is the exact seam
// a real implementation would replace (Guardian REST + @hashgraph/sdk). No network.
export const DEFAULT_GUARDIAN_CONFIG: GuardianConfig = {
  issuer_did: 'did:hedera:testnet:CarbonReadyIssuer;hedera:testnet:tid=0.0.480001',
  topic_id: '0.0.480100',
  network: 'testnet',
};

export function buildApprovalSubject(v: VerificationRequest, evidence: EvidenceFile[]): Record<string, unknown> {
  const linked = evidence
    .filter((e) => v.evidence_ids.includes(e.id))
    .map((e) => ({ id: e.id, content_hash: e.content_hash }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    verification_id: v.id,
    project_id: v.project_id,
    monitoring_period_start: v.monitoring_period_start,
    monitoring_period_end: v.monitoring_period_end,
    reduction_tco2e: v.reduction_kgco2e / 1000,
    factors_snapshot: v.factors_snapshot,
    evidence: linked,
    approval_role: 'verifier',
    approved_at: v.locked_at,
    package_hash: v.hash_value,
  };
}

export function issueCredential(
  subject: Record<string, unknown>,
  packageHash: string,
  sequenceNumber: number,
  config: GuardianConfig,
  schema: CredentialSchema,
  issuedAt: string,
): VerifiableCredential {
  const id = `urn:vc:${shortHash(`${packageHash}|${sequenceNumber}`).replace('sha256-', '').replace('…', '')}`;
  return {
    id,
    schema_id: schema.id,
    issuer_did: config.issuer_did,
    issued_at: issuedAt,
    subject,
    package_hash: packageHash,
    hcs: {
      topic_id: config.topic_id,
      sequence_number: sequenceNumber,
      consensus_timestamp: issuedAt,
      explorer_url: `https://hashscan.io/${config.network}/topic/${config.topic_id}/message/${sequenceNumber}`,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/guardian.test.ts`
Expected: PASS (3 assertions across 2 describes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardian.ts src/lib/guardian.test.ts
git commit -m "feat(guardian): mock client — buildApprovalSubject + issueCredential (TDD)"
```

---

## Task 4: Seed a pre-anchored credential for VR-1000

**Files:**
- Modify: `src/data/seed.ts`

> VR-1000 is already `approved` with a `hash_value` in the Sprint 2 seed. Here we (a) give every seed `VerificationRequest` the two new HCS fields, (b) pre-anchor VR-1000 so the Registry isn't empty, and (c) add a chained `VERIFICATION_ANCHORED` audit row.

- [ ] **Step 1: Import the new helpers/types**

At the top, extend the type import and add a value import:
```ts
import type {
  Organization, Project, MonitoringRecord, EmissionFactor, User, AuditLog,
  EvidenceFile, VerificationRequest, VerificationComment,
  AuditAction, EntityType, UserRole, VerifiableCredential,
} from '../types';
import { shortHash } from '../lib/hash';
import { auditRowHash } from '../store/audit';
import { DEFAULT_GUARDIAN_CONFIG } from '../lib/guardian';
```

- [ ] **Step 2: Add the two HCS fields to every seed verification**

In each object inside `seedVerifications`, add these two lines next to the existing `hash_value/credential_id/anchored_at`. For the three non-anchored packages (`VR-1001`, `VR-1002`, `VR-1003`) and the soon-to-be-anchored `VR-1000`, set them to `null` initially:
```ts
    hcs_topic_id: null, hcs_sequence_number: null,
```
Then change **VR-1000 only** so it is pre-anchored — replace its `credential_id: null, anchored_at: null, hcs_topic_id: null, hcs_sequence_number: null` with:
```ts
    credential_id: 'urn:vc:vr1000seed', anchored_at: '2026-04-15T08:30:00Z',
    hcs_topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, hcs_sequence_number: 1,
```

- [ ] **Step 3: Export a seed credential for VR-1000**

After `seedComments`, add:
```ts
export const seedCredentials: VerifiableCredential[] = [
  {
    id: 'urn:vc:vr1000seed',
    schema_id: 'mrv-approval-v1',
    issuer_did: DEFAULT_GUARDIAN_CONFIG.issuer_did,
    issued_at: '2026-04-15T08:30:00Z',
    package_hash: shortHash('VR-1000-approval-payload'),
    subject: {
      verification_id: 'VR-1000', project_id: 'prj-0001',
      monitoring_period_start: '2026-03-01', monitoring_period_end: '2026-03-31',
      reduction_tco2e: 24.55, factors_snapshot: 'CEA 2025-v2 · 0.79 kgCO₂e/kWh',
      evidence: [{ id: 'ev-0003', content_hash: shortHash('pune-commissioning') }],
      approval_role: 'esg_manager', approved_at: '2026-04-15T08:22:00Z',
      package_hash: shortHash('VR-1000-approval-payload'),
    },
    hcs: {
      topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, sequence_number: 1,
      consensus_timestamp: '2026-04-15T08:30:00Z',
      explorer_url: `https://hashscan.io/${DEFAULT_GUARDIAN_CONFIG.network}/topic/${DEFAULT_GUARDIAN_CONFIG.topic_id}/message/1`,
    },
  },
];
```

- [ ] **Step 4: Add a chained `VERIFICATION_ANCHORED` audit spec**

Inside the `buildChain([...])` array passed to `seedAudit`, immediately **after** the `aud-0010` (`VERIFICATION_APPROVED` for VR-1000) entry, insert:
```ts
  { id: 'aud-0010b', user_role: 'esg_manager', action: 'VERIFICATION_ANCHORED', entity_type: 'verification', entity_id: 'VR-1000', payload: { credential_id: 'urn:vc:vr1000seed', topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, sequence_number: 1 }, previous_value: { anchored: false }, new_value: { credential_id: 'urn:vc:vr1000seed', hcs_topic_id: DEFAULT_GUARDIAN_CONFIG.topic_id, hcs_sequence_number: 1 }, created_at: '2026-04-15T08:30:00Z' },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: PASS (all seed verifications now satisfy `VerificationRequest`).

- [ ] **Step 6: Commit**

```bash
git add src/data/seed.ts
git commit -m "feat(seed): pre-anchor VR-1000 with a seed credential + chained audit row"
```

---

## Task 5: Store — `credentials`/`guardianConfig` state + `anchorVerification` (TDD)

**Files:**
- Modify: `src/store/index.ts`
- Test: `src/store/anchor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';

describe('anchorVerification', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.getState().resetToSeed();
  });

  it('anchors an approved, unanchored package and appends a VERIFICATION_ANCHORED audit row', () => {
    // Arrange: make VR-1001 a fresh approved + unanchored package
    useStore.setState((s) => ({
      verifications: s.verifications.map((v) =>
        v.id === 'VR-1001'
          ? { ...v, state: 'approved' as const, locked_at: '2026-05-20T00:00:00Z', hash_value: 'sha256-vr1001', credential_id: null, anchored_at: null, hcs_topic_id: null, hcs_sequence_number: null }
          : v),
    }));
    const auditBefore = useStore.getState().audit.length;
    const credsBefore = useStore.getState().credentials.length;

    // Act
    useStore.getState().anchorVerification('VR-1001');

    // Assert
    const v = useStore.getState().verifications.find((x) => x.id === 'VR-1001')!;
    expect(v.credential_id).not.toBeNull();
    expect(v.anchored_at).not.toBeNull();
    expect(v.hcs_topic_id).not.toBeNull();
    expect(useStore.getState().credentials.length).toBe(credsBefore + 1);
    expect(useStore.getState().audit.length).toBe(auditBefore + 1);
    expect(useStore.getState().audit[0].action).toBe('VERIFICATION_ANCHORED');
  });

  it('is a no-op on an already-anchored package (VR-1000)', () => {
    const before = useStore.getState().credentials.length;
    useStore.getState().anchorVerification('VR-1000');
    expect(useStore.getState().credentials.length).toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/anchor.test.ts`
Expected: FAIL — `anchorVerification is not a function` / `credentials` undefined.

- [ ] **Step 3: Extend imports in `src/store/index.ts`**

Update the type import to include the new types and add value imports:
```ts
import type {
  Project, MonitoringRecord, EmissionFactor, CalculationResult,
  AuditLog, User, Organization, UUID, AuditAction, EntityType,
  EvidenceFile, EvidenceCategory, VerificationRequest, VerificationComment,
  VerifiableCredential, GuardianConfig,
} from '../types';
import {
  seedOrg, seedUser, seedFactors, seedProjects, seedRecords, seedAudit,
  seedEvidence, seedVerifications, seedComments, seedCredentials,
} from '../data/seed';
import { newAudit, type AuditExtra } from './audit';
import { shortHash } from '../lib/hash';
import { buildApprovalSubject, issueCredential, DEFAULT_GUARDIAN_CONFIG } from '../lib/guardian';
import { MRV_APPROVAL_SCHEMA_V1 } from '../lib/guardian-schema';
```

- [ ] **Step 4: Add state fields to the `AppState` interface**

After `comments: VerificationComment[];` add:
```ts
  credentials: VerifiableCredential[];
  guardianConfig: GuardianConfig;
```
And in the actions section (after `addComment`), add the signature:
```ts
  anchorVerification: (id: UUID) => void;
```

- [ ] **Step 5: Add initial state**

In the store initializer object, after `comments: seedComments,` add:
```ts
      credentials: seedCredentials,
      guardianConfig: DEFAULT_GUARDIAN_CONFIG,
```

- [ ] **Step 6: Implement the action**

Add this action (place it right after `addComment`):
```ts
      anchorVerification: (id) => {
        const v = get().verifications.find((x) => x.id === id);
        if (!v || v.state !== 'approved' || v.credential_id || !v.hash_value) return;
        const issuedAt = new Date().toISOString();
        const sequenceNumber = get().credentials.length + 1;
        const subject = buildApprovalSubject(v, get().evidence);
        const vc = issueCredential(subject, v.hash_value, sequenceNumber, get().guardianConfig, MRV_APPROVAL_SCHEMA_V1, issuedAt);
        set((s) => ({
          credentials: [vc, ...s.credentials],
          verifications: s.verifications.map((x) =>
            x.id === id
              ? { ...x, credential_id: vc.id, anchored_at: issuedAt, hcs_topic_id: vc.hcs.topic_id, hcs_sequence_number: vc.hcs.sequence_number }
              : x),
        }));
        get().audit_write('VERIFICATION_ANCHORED', 'verification', id,
          { credential_id: vc.id, topic_id: vc.hcs.topic_id, sequence_number: vc.hcs.sequence_number },
          { previous_value: { anchored: false }, new_value: { credential_id: vc.id, hcs_topic_id: vc.hcs.topic_id, hcs_sequence_number: vc.hcs.sequence_number } });
      },
```

- [ ] **Step 7: Update `resetToSeed` and bump persist key**

In `resetToSeed`, add the two new slices:
```ts
      resetToSeed: () => set({
        projects: seedProjects, records: seedRecords, factors: seedFactors, calculations: [], audit: seedAudit,
        evidence: seedEvidence, verifications: seedVerifications, comments: seedComments,
        credentials: seedCredentials, guardianConfig: DEFAULT_GUARDIAN_CONFIG,
      }),
```
Change the persist name at the bottom from `'carbon-ready-store-v2'` to:
```ts
    { name: 'carbon-ready-store-v3' }
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/store/anchor.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS — 27 tests (25 existing + 2 new) plus Task 3's guardian tests = 30 total. (Exact count: csv 13, calc 12, guardian 2 describes, anchor 2 = all green.)

- [ ] **Step 10: Commit**

```bash
git add src/store/index.ts src/store/anchor.test.ts
git commit -m "feat(store): anchorVerification action + credentials state, persist v3 (TDD)"
```

---

## Task 6: API facade method

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add the method**

Inside the `api` object, after `rejectVerification`, add:
```ts
  async anchorVerification(id: UUID): Promise<void> {
    useStore.getState().anchorVerification(id);
    return tick(undefined);
  },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api): expose anchorVerification"
```

---

## Task 7: Review Detail — anchor button + anchored display

**Files:**
- Modify: `src/pages/ReviewDetail.tsx`

- [ ] **Step 1: Add imports**

Add to the lucide import line: `Link2`. Add store + label imports near the top:
```ts
import { Link2 } from 'lucide-react';
```
(Append `Link2` to the existing `lucide-react` import rather than duplicating the import.)

- [ ] **Step 2: Read credential + anchor action from the store**

Inside the component, after the existing `useStore` selectors, add:
```ts
  const anchorVerification = useStore((s) => s.anchorVerification);
  const credential = useStore((s) => s.credentials.find((c) => c.id === (v?.credential_id ?? '')));
```

- [ ] **Step 3: Replace the approved branch of the locked banner**

Find the locked banner block. Replace the **approved** branch (`{v.state === 'approved' ? (...) : (...)}`) so that the approved case shows either an Anchor button (when `credential_id == null`) or the anchored details. Use this exact JSX for the approved branch content:
```tsx
              v.credential_id == null ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span>Package <strong>locked</strong> on {v.locked_at ? fmtDate(v.locked_at) : 'approval'} · evidence read-only.{' '}
                    <span className="font-mono text-xs">hash {v.hash_value}</span> · 🔒 anchoring pending.</span>
                  <Button size="sm" onClick={() => anchorVerification(v.id)}>
                    <Link2 size={14} /> Anchor to Hedera Guardian
                  </Button>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 font-medium text-brand-800">⛓ Anchored on Hedera Guardian (simulated)</div>
                  <div className="mt-1 grid gap-0.5 text-xs text-brand-700 font-mono">
                    <span>credential: {v.credential_id}</span>
                    <span>HCS: topic {v.hcs_topic_id} · msg #{v.hcs_sequence_number} · {v.anchored_at ? fmtDateTime(v.anchored_at) : ''}</span>
                    {credential && <a className="underline" href={credential.hcs.explorer_url} target="_blank" rel="noreferrer">View on HashScan (mock) ↗</a>}
                  </div>
                  <div className="mt-1 text-[11px] text-ink-400">Simulated · not a live Hedera transaction.</div>
                </div>
              )
```
> Note: this replaces only the `v.state === 'approved'` side of the ternary; keep the existing rejected side (`else` → "Package was rejected…") unchanged. Ensure `fmtDateTime` is imported (it already is in this file) and `Button` is imported (it already is).

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, open `http://localhost:5173/verifications`, open an `approved` unanchored package (approve `VR-1001` first via the UI, or open VR-1000 to see the already-anchored display). Click **Anchor to Hedera Guardian** → banner flips to "⛓ Anchored… (simulated)" with credential id, HCS topic/msg, and a HashScan link.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ReviewDetail.tsx
git commit -m "feat(review): anchor button + anchored credential display"
```

---

## Task 8: Guardian page (`/guardian`)

**Files:**
- Create: `src/pages/Guardian.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useState } from 'react';
import { ShieldCheck, FileJson, ExternalLink } from 'lucide-react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { useStore } from '../store';
import { MRV_APPROVAL_SCHEMA_V1 } from '../lib/guardian-schema';
import { fmtDateTime } from '../lib/date';
import { formatNumber } from '../lib/format';
import clsx from 'clsx';

type Tab = 'schema' | 'registry';

export function Guardian() {
  const credentials = useStore((s) => s.credentials);
  const config = useStore((s) => s.guardianConfig);
  const verifications = useStore((s) => s.verifications);
  const [tab, setTab] = useState<Tab>('schema');

  return (
    <div>
      <PageHeader title="Guardian" subtitle="Credential schema and the registry of anchored verification results. Simulated — not a live Hedera connection." />

      <Card className="mb-4 border-brand-200 bg-brand-50">
        <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm">
          <span className="flex items-center gap-2 font-medium text-brand-800"><ShieldCheck size={16} /> Guardian (mock)</span>
          <span className="text-brand-700">Network: <strong>{config.network}</strong></span>
          <span className="text-brand-700 font-mono text-xs">Topic {config.topic_id}</span>
          <span className="text-brand-700 font-mono text-xs truncate">{config.issuer_did}</span>
        </CardBody>
      </Card>

      <div className="mb-4 flex items-center gap-1 border-b border-ink-200">
        {([['schema', 'Schema'], ['registry', 'Credential Registry']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={clsx('relative px-4 py-2.5 text-sm font-medium transition-colors', tab === key ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900')}>
            {label}
            {key === 'registry' && credentials.length > 0 && <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600">{credentials.length}</span>}
            {tab === key && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" />}
          </button>
        ))}
      </div>

      {tab === 'schema' ? (
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><FileJson size={16} /> {MRV_APPROVAL_SCHEMA_V1.name} <Badge tone="gray">v{MRV_APPROVAL_SCHEMA_V1.version}</Badge></span>} />
          <CardBody className="p-0">
            <Table>
              <THead><TR><TH>Property</TH><TH>Type</TH><TH>Description</TH></TR></THead>
              <tbody>
                {MRV_APPROVAL_SCHEMA_V1.properties.map((p) => (
                  <TR key={p.key}>
                    <TD className="font-mono text-xs text-ink-900">{p.key}</TD>
                    <TD><Badge tone="blue">{p.type}</Badge></TD>
                    <TD className="text-ink-500">{p.description}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="p-0">
            {credentials.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={32} />} title="No credentials anchored yet" hint="Approve a verification package, then click Anchor to Hedera Guardian on its review page." />
            ) : (
              <Table>
                <THead><TR><TH>Credential</TH><TH>Project</TH><TH className="text-right">Reduction</TH><TH>HCS</TH><TH>Anchored</TH><TH><span className="sr-only">Explorer</span></TH></TR></THead>
                <tbody>
                  {credentials.map((c) => {
                    const v = verifications.find((x) => x.id === (c.subject.verification_id as string));
                    return (
                      <TR key={c.id}>
                        <TD className="font-mono text-xs text-ink-900">{c.id}</TD>
                        <TD className="text-ink-700">{v?.project_id ?? (c.subject.project_id as string)}</TD>
                        <TD className="text-right">{formatNumber(Number(c.subject.reduction_tco2e), 2)} tCO₂e</TD>
                        <TD className="font-mono text-xs text-ink-500">{c.hcs.topic_id} · #{c.hcs.sequence_number}</TD>
                        <TD className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(c.issued_at)}</TD>
                        <TD><a className="inline-flex items-center gap-1 text-brand-700 hover:underline text-xs" href={c.hcs.explorer_url} target="_blank" rel="noreferrer">HashScan <ExternalLink size={12} /></a></TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Guardian.tsx
git commit -m "feat(guardian): /guardian page — schema + credential registry"
```

---

## Task 9: Wire route, sidebar link, and audit-log action

**Files:**
- Modify: `src/App.tsx`, `src/components/Sidebar.tsx`, `src/pages/AuditLog.tsx`

- [ ] **Step 1: Add the route in `src/App.tsx`**

Add the import:
```ts
import { Guardian } from './pages/Guardian';
```
Add the route after the `/verifications/:id` route:
```tsx
          <Route path="/guardian" element={<Guardian />} />
```

- [ ] **Step 2: Add the sidebar link in `src/components/Sidebar.tsx`**

Add `Link2` to the lucide import, then add to the `links` array right after the Verifications entry:
```ts
  { to: '/guardian',           label: 'Guardian',          icon: Link2 },
```

- [ ] **Step 3: Add the action to AuditLog filters/tones in `src/pages/AuditLog.tsx`**

Append `'VERIFICATION_ANCHORED'` to the end of the `ACTIONS` array, and add to the `TONE` map:
```ts
  VERIFICATION_ANCHORED: 'green',
```

- [ ] **Step 4: Type-check + full suite**

Run: `npx tsc -b && npm test`
Expected: PASS (all tests green).

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`. Confirm: **Guardian** appears in the sidebar; `/guardian` Schema tab lists the 10 schema properties; Registry tab shows VR-1000's seed credential; **Audit Log** filter dropdown includes `VERIFICATION_ANCHORED` and the seed VR-1000 anchor row appears with the green badge and a valid hash-chain banner.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx src/pages/AuditLog.tsx
git commit -m "feat: wire /guardian route, sidebar link, and audit action"
```

---

## Task 10: Docs

**Files:**
- Modify: `README.md`, `docs/dMRV-Working-Doc.md`

- [ ] **Step 1: Update README**

Under the Sprint bullets, change the Sprint 3 line to reflect it now ships (simulated):
```md
- **Sprint 3** — simulated Hedera Guardian anchoring: a credential schema, mock VC issuance, and a manual "Anchor" action that fills `credential_id`/`anchored_at`/HCS fields on approved packages, plus a `/guardian` page (Schema + Registry). No real Hedera infra.
```
Add `/guardian` to any route list and note the persist key is now `carbon-ready-store-v3` (update the reset snippet to `localStorage.removeItem('carbon-ready-store-v3')`).

- [ ] **Step 2: Update the working doc**

In `docs/dMRV-Working-Doc.md` section 12 (Hedera Guardian Readiness), add a short "Sprint 3 (simulated) — shipped" note describing `lib/guardian.ts`, `lib/guardian-schema.ts`, `anchorVerification`, and the `/guardian` page; mention the real seam swap is `lib/guardian.ts` → `@hashgraph/sdk` + Guardian REST.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/dMRV-Working-Doc.md
git commit -m "docs: document Sprint 3 simulated Guardian anchoring"
```

---

## Self-Review (completed by plan author)

**Spec coverage:** install Guardian → Task 3 (mock client) + Task 8 (config display); create Credential Schema → Task 2 + Task 8 Schema tab; anchor → Tasks 5–7; `/guardian` page → Task 8; audit `VERIFICATION_ANCHORED` → Tasks 1, 4, 9; seed pre-anchor → Task 4; "Simulated" labels → Tasks 7, 8. All spec sections covered.

**Placeholder scan:** none — every code step contains complete code and exact commands.

**Type consistency:** `VerifiableCredential` shape, `issueCredential(subject, packageHash, sequenceNumber, config, schema, issuedAt)` signature, `buildApprovalSubject(v, evidence)` signature, and field names (`credential_id`, `hcs_topic_id`, `hcs_sequence_number`, `hcs.sequence_number`) are identical across Tasks 1, 3, 4, 5, 7, 8. Persist key bumped exactly once (v2→v3, Task 5). `seedCredentials` defined in Task 4, consumed in Task 5.
