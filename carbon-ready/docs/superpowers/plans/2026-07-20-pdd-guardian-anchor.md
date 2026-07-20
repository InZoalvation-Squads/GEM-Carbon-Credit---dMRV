# PDD Guardian Anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On project registration, issue a PDD Registration credential and freeze a simulated IPFS CID + HCS reference on the PDD, mirroring Guardian's hash-and-pointer storage model.

**Architecture:** Two pure helpers in the Guardian seam (`toIpfsCid`, `buildPddSubject`) + a new credential schema; `registerProject()` in the store composes them with the existing `issueCredential()`. A read-only "Guardian anchor" block on the Registration detail page surfaces CID/credential/HCS link.

**Tech Stack:** TypeScript, zustand, vitest.

**Spec:** `carbon-ready/docs/superpowers/specs/2026-07-20-pdd-guardian-anchor-design.md`

All commands run from `carbon-ready/`.

---

### Task 1: Guardian seam helpers + schema

**Files:**
- Modify: `carbon-ready/src/lib/guardian.ts`
- Modify: `carbon-ready/src/lib/guardian-schema.ts`
- Modify: `carbon-ready/src/types/index.ts` (ProjectDesignDocument ~line 351)
- Modify: `carbon-ready/src/data/seed.ts` (seedPdds ~line 109-127)
- Test: `carbon-ready/src/lib/guardian.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `carbon-ready/src/lib/guardian.test.ts`:

```ts
describe('toIpfsCid', () => {
  it('is deterministic and CIDv1-shaped', () => {
    const a = toIpfsCid('sha256-0a1b2c3d4e5f…');
    expect(a).toBe(toIpfsCid('sha256-0a1b2c3d4e5f…'));
    expect(a).toMatch(/^bafkrei[0-9a-z]{20}$/);
  });

  it('differs for different hashes', () => {
    expect(toIpfsCid('sha256-aaaaaaaaaaaa…')).not.toBe(toIpfsCid('sha256-bbbbbbbbbbbb…'));
  });
});

describe('buildPddSubject', () => {
  const pdd = {
    id: 'PDD-X1', project_id: 'prj-1', methodology_id: 'meth-1',
    methodology_snapshot: 'T-VER-S 1.0', state: 'registered',
    section_data: {}, evidence_ids: ['ev-2', 'ev-1'],
    assigned_validator_name: 'V', submitted_at: null,
    validated_at: '2026-07-20T00:00:00Z', content_hash: 'sha256-cafe00000000…',
    ipfs_cid: null, credential_id: null,
  } as ProjectDesignDocument;
  const evidence = [
    { id: 'ev-1', content_hash: 'sha256-e1…' },
    { id: 'ev-2', content_hash: 'sha256-e2…' },
    { id: 'ev-3', content_hash: 'sha256-e3…' },
  ] as EvidenceFile[];

  it('includes only linked evidence sorted by id, plus hash + cid + snapshot', () => {
    const s = buildPddSubject(pdd, evidence, 'bafkreicafe');
    expect(s.pdd_id).toBe('PDD-X1');
    expect(s.project_id).toBe('prj-1');
    expect(s.methodology).toBe('T-VER-S 1.0');
    expect(s.content_hash).toBe('sha256-cafe00000000…');
    expect(s.ipfs_cid).toBe('bafkreicafe');
    expect(s.registered_at).toBe('2026-07-20T00:00:00Z');
    expect(s.evidence).toEqual([
      { id: 'ev-1', content_hash: 'sha256-e1…' },
      { id: 'ev-2', content_hash: 'sha256-e2…' },
    ]);
  });
});
```

Add the needed imports at the top of the test file: `toIpfsCid`, `buildPddSubject` from `./guardian`; `ProjectDesignDocument`, `EvidenceFile` types from `../types`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/guardian.test.ts`
Expected: FAIL — `toIpfsCid`/`buildPddSubject` are not exported.

- [ ] **Step 3: Implement**

In `carbon-ready/src/types/index.ts`, extend `ProjectDesignDocument` (after `content_hash`):

```ts
  ipfs_cid: string | null;        // simulated IPFS CID, frozen at register
  credential_id: string | null;   // PDD Registration VC id
```

In `carbon-ready/src/data/seed.ts`, add to BOTH seedPdds entries (the mapped solar
entries and the `PDD-VM0047-01` literal):

```ts
    ipfs_cid: null, credential_id: null,
```

If `src/test/demoFixtures.ts` (or any other file) constructs PDD literals, add the same
two fields there — run `npx tsc --noEmit` to find every site.

In `carbon-ready/src/lib/guardian.ts`, add (import `ProjectDesignDocument` in the type import):

```ts
// Deterministic stand-in for the IPFS CID Guardian records after uploading the
// signed PDD document. Derived from the content hash so re-registration of the
// same frozen payload yields the same CID.
export function toIpfsCid(contentHash: string): string {
  const hex = contentHash.replace('sha256-', '').replace('…', '');
  return `bafkrei${hex.padEnd(20, '0').slice(0, 20)}`;
}

export function buildPddSubject(pdd: ProjectDesignDocument, evidence: EvidenceFile[], ipfsCid: string): Record<string, unknown> {
  const linked = evidence
    .filter((e) => pdd.evidence_ids.includes(e.id))
    .map((e) => ({ id: e.id, content_hash: e.content_hash }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    pdd_id: pdd.id,
    project_id: pdd.project_id,
    methodology: pdd.methodology_snapshot,
    content_hash: pdd.content_hash,
    ipfs_cid: ipfsCid,
    evidence: linked,
    registered_at: pdd.validated_at,
  };
}
```

In `carbon-ready/src/lib/guardian-schema.ts`, add:

```ts
// Schema for the credential issued when a PDD passes validation and the project
// is registered. The full PDD stays off-chain; this VC carries hash + CID.
export const PDD_REGISTRATION_SCHEMA_V1: CredentialSchema = {
  id: 'pdd-registration-v1',
  name: 'PDD Project Registration',
  version: '1.0.0',
  type: 'VerifiableCredential',
  properties: [
    { key: 'pdd_id', type: 'string', description: 'Project Design Document id' },
    { key: 'project_id', type: 'string', description: 'Project id' },
    { key: 'methodology', type: 'string', description: 'Methodology code + version snapshot' },
    { key: 'content_hash', type: 'string', description: 'Hash of the frozen PDD payload' },
    { key: 'ipfs_cid', type: 'string', description: 'IPFS CID of the published PDD document' },
    { key: 'evidence', type: 'array', description: 'Evidence items as {id, content_hash}' },
    { key: 'registered_at', type: 'date', description: 'Registration timestamp' },
  ],
};
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- src/lib/guardian.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors (fix any PDD literal sites tsc reports).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardian.ts src/lib/guardian.test.ts src/lib/guardian-schema.ts src/types/index.ts src/data/seed.ts src/test/demoFixtures.ts
git commit -m "feat(guardian): PDD credential subject, schema and simulated IPFS CID"
```

---

### Task 2: `registerProject()` issues the PDD credential

**Files:**
- Modify: `carbon-ready/src/store/index.ts` (registerProject ~line 403)
- Test: `carbon-ready/src/store/registration.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('registration store')` block of
`carbon-ready/src/store/registration.test.ts`:

```ts
  it('registerProject anchors the PDD: credential + ipfs_cid + hcs reference', () => {
    const s = useStore.getState();
    s.selectMethodology('prj-0004', 'meth-tver-solar');
    const pdd = s.pddByProject('prj-0004')!;
    s.savePddDraft(pdd.id, {
      technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
      baseline_scenario: 'Grid electricity displaced by solar generation',
      barrier_type: 'Technological', barrier_explanation: 'x', common_practice: true,
      performance_ratio: 0.8, monitored_parameter: 'EG_PJ', measurement_method: 'meter',
      monitoring_frequency: 'Monthly', qaqc_procedure: 'checks',
    }, []);
    s.submitPdd(pdd.id);
    s.startValidation(pdd.id);
    const credsBefore = useStore.getState().credentials.length;
    s.registerProject(pdd.id);

    const after = useStore.getState();
    const regPdd = after.pdds.find((p) => p.id === pdd.id)!;
    expect(regPdd.ipfs_cid).toMatch(/^bafkrei/);
    expect(regPdd.credential_id).toBeTruthy();
    expect(after.credentials.length).toBe(credsBefore + 1);
    const vc = after.credentials.find((c) => c.id === regPdd.credential_id)!;
    expect(vc.schema_id).toBe('pdd-registration-v1');
    expect(vc.subject.content_hash).toBe(regPdd.content_hash);
    expect(vc.subject.ipfs_cid).toBe(regPdd.ipfs_cid);
    expect(vc.hcs.topic_id).toBe(after.guardianConfig.topic_id);
  });

  it('a refused registration issues no credential', () => {
    const s = useStore.getState();
    const pdd = s.pddByProject('prj-0004')!;   // seed draft is incomplete
    s.submitPdd(pdd.id);
    s.startValidation(pdd.id);
    const credsBefore = useStore.getState().credentials.length;
    s.registerProject(pdd.id);
    expect(useStore.getState().credentials.length).toBe(credsBefore);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/store/registration.test.ts`
Expected: the 2 new tests FAIL (`ipfs_cid`/`credential_id` undefined, credential count unchanged); existing tests PASS.

- [ ] **Step 3: Implement in `registerProject`**

In `carbon-ready/src/store/index.ts`, import `toIpfsCid`, `buildPddSubject` from
`../lib/guardian` and `PDD_REGISTRATION_SCHEMA_V1` from `../lib/guardian-schema`
(extend the existing import lines). Then replace the body after `content_hash` is
computed:

```ts
        const snapshot = pdd.methodology_snapshot || `${m.code} ${m.version}`;
        const content_hash = pddContentHash({ methodology_snapshot: snapshot, section_data: pdd.section_data, evidence_ids: pdd.evidence_ids });
        const validated_at = new Date().toISOString();
        const ipfs_cid = toIpfsCid(content_hash);
        const frozen = { ...pdd, methodology_snapshot: snapshot, validated_at, content_hash };
        const sequenceNumber = get().credentials.length + 1;
        const vc = issueCredential(
          buildPddSubject(frozen, get().evidence, ipfs_cid),
          content_hash, sequenceNumber, get().guardianConfig, PDD_REGISTRATION_SCHEMA_V1, validated_at,
        );
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'registered', methodology_snapshot: snapshot, validated_at, content_hash, ipfs_cid, credential_id: vc.id } : p)),
          projects: s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'registered' as const } : p)),
          credentials: [vc, ...s.credentials],
        }));
        get().audit_write('PROJECT_REGISTERED', 'pdd', pdd_id,
          { methodology: snapshot, credential_id: vc.id, ipfs_cid, topic_id: vc.hcs.topic_id, sequence_number: vc.hcs.sequence_number },
          { previous_value: { state: pdd.state }, new_value: { state: 'registered', content_hash, ipfs_cid, credential_id: vc.id } });
        return true;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/store/registration.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/store/registration.test.ts
git commit -m "feat(guardian): registerProject anchors PDD credential with IPFS CID"
```

---

### Task 3: Guardian-anchor block on the Registration detail

**Files:**
- Modify: `carbon-ready/src/pages/Registration.tsx` (registered-state detail view — locate the block rendered when `pdd.state === 'registered'`)

- [ ] **Step 1: Add the read-only anchor block**

Where the registered PDD detail shows `content_hash` (or beside the registered status
panel), render:

```tsx
{pdd.state === 'registered' && pdd.ipfs_cid && (
  <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50/50 p-3 text-xs">
    <div className="mb-1 font-semibold uppercase tracking-wide text-ink-400">Guardian anchor</div>
    <div className="space-y-1 font-mono text-[11px] text-ink-600">
      <div>IPFS CID: {pdd.ipfs_cid}</div>
      {pdd.credential_id && <div>Credential: {pdd.credential_id}</div>}
    </div>
  </div>
)}
```

Adapt the exact placement and class names to the surrounding markup of the page —
follow the file's existing card/label idiom rather than this snippet verbatim.

- [ ] **Step 2: Run the full suite + typecheck + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Registration.tsx
git commit -m "feat(guardian): show PDD Guardian anchor on registration detail"
```
