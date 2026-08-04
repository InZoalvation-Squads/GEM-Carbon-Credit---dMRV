# Per-project Topics + Trust Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue PDD and MRV credentials on a deterministic per-project HCS topic and surface the PDD credential (VC + CID + HCS ref) in the Guardian Trust Chain.

**Architecture:** One pure helper `projectTopicId()`; the two credential-issuing store actions override `guardianConfig.topic_id` with it and count sequences per topic. `TrustChainTab` enriches the "PDD registered" step from the PDD's credential.

**Tech Stack:** TypeScript, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-07-20-project-topics-trustchain-design.md`

All commands run from `carbon-ready/`.

---

### Task 1: `projectTopicId()` helper

**Files:**
- Modify: `carbon-ready/src/lib/guardian.ts`
- Test: `carbon-ready/src/lib/guardian.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `carbon-ready/src/lib/guardian.test.ts` (add `projectTopicId` to the `./guardian` import):

```ts
describe('projectTopicId', () => {
  it('is deterministic and shaped like a Hedera topic id', () => {
    expect(projectTopicId('prj-0001')).toBe(projectTopicId('prj-0001'));
    expect(projectTopicId('prj-0001')).toMatch(/^0\.0\.481\d{3}$/);
  });

  it('differs across projects', () => {
    expect(projectTopicId('prj-0001')).not.toBe(projectTopicId('prj-0002'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/guardian.test.ts`
Expected: FAIL — `projectTopicId` not exported.

- [ ] **Step 3: Implement**

In `carbon-ready/src/lib/guardian.ts` (after `DEFAULT_GUARDIAN_CONFIG`):

```ts
// Guardian creates one HCS topic per project under the policy topic. Simulated as a
// deterministic id in the 0.0.481000–0.0.481999 range so re-derivation is stable.
export function projectTopicId(projectId: string): string {
  let digest = 0;
  for (let i = 0; i < projectId.length; i++) digest = (Math.imul(digest, 31) + projectId.charCodeAt(i)) >>> 0;
  return `0.0.${481000 + (digest % 1000)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/guardian.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardian.ts src/lib/guardian.test.ts
git commit -m "feat(guardian): deterministic per-project HCS topic id"
```

---

### Task 2: Credentials issue on the project topic with per-topic sequences

**Files:**
- Modify: `carbon-ready/src/store/index.ts` (registerProject + anchorVerification)
- Test: `carbon-ready/src/store/registration.test.ts` (existing assertion ~line 117), `carbon-ready/src/store/anchor.test.ts`

- [ ] **Step 1: Update/write the failing tests**

In `carbon-ready/src/store/registration.test.ts`, import `projectTopicId` from
`../lib/guardian` and replace the registry-topic assertion in the anchor test:

```ts
    expect(vc.hcs.topic_id).toBe(projectTopicId('prj-0004'));
    expect(vc.hcs.sequence_number).toBe(1);   // first credential on this project's topic
```

In `carbon-ready/src/store/anchor.test.ts`, import `projectTopicId` from `../lib/guardian`
and strengthen the not-null assertion (the anchored verification is for project `prj-0001` —
confirm the fixture's project id and use it):

```ts
    expect(v.hcs_topic_id).toBe(projectTopicId('prj-0001'));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/store/registration.test.ts src/store/anchor.test.ts`
Expected: the two updated assertions FAIL (credentials still land on `0.0.480100`).

- [ ] **Step 3: Implement in the store**

In `carbon-ready/src/store/index.ts` import `projectTopicId` from `../lib/guardian`.

In `registerProject`, replace the sequence/issue lines:

```ts
        const topic_id = projectTopicId(pdd.project_id);
        const sequenceNumber = get().credentials.filter((c) => c.hcs.topic_id === topic_id).length + 1;
        const vc = issueCredential(
          buildPddSubject(frozen, get().evidence, ipfs_cid),
          content_hash, sequenceNumber, { ...get().guardianConfig, topic_id }, PDD_REGISTRATION_SCHEMA_V1, validated_at,
        );
```

In `anchorVerification`, replace the sequence/issue lines:

```ts
        const topic_id = projectTopicId(v.project_id);
        const sequenceNumber = get().credentials.filter((c) => c.hcs.topic_id === topic_id).length + 1;
        const subject = buildApprovalSubject(v, get().evidence);
        const vc = issueCredential(subject, v.hash_value, sequenceNumber, { ...get().guardianConfig, topic_id }, MRV_APPROVAL_SCHEMA_V1, issuedAt);
```

- [ ] **Step 4: Run the store tests**

Run: `npm test -- src/store/registration.test.ts src/store/anchor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/store/registration.test.ts src/store/anchor.test.ts
git commit -m "feat(guardian): issue credentials on per-project HCS topics"
```

---

### Task 3: Trust Chain shows the PDD anchor

**Files:**
- Modify: `carbon-ready/src/pages/Guardian.tsx` (TrustChainTab ~line 177-203)
- Test: `carbon-ready/src/pages/guardian.ui.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside the Guardian page describe block of `guardian.ui.test.tsx` (reuse the
existing render/mint helpers; the seeded token's PDD is legacy — assert the graceful
path — and register a fresh anchor for the enriched path only if a fixture allows it;
at minimum):

```ts
  it('trust chain shows the PDD credential reference when the PDD is anchored', () => {
    // Anchor the seeded PDD by registering its credential id + cid directly.
    useStore.setState((s) => ({
      pdds: s.pdds.map((p) => (p.id === 'PDD-2000'
        ? { ...p, ipfs_cid: 'bafkreitestcid000000000', credential_id: 'urn:vc:vr1000seed' }
        : p)),
    }));
    useStore.getState().setRole('admin');
    useStore.getState().mintToken('urn:vc:vr1000seed');
    renderGuardian();
    fireEvent.click(screen.getByRole('button', { name: /Trust Chain/i }));
    expect(screen.getByText(/ipfs bafkreitestcid000000000/i)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/pages/guardian.ui.test.tsx`
Expected: the new test FAILS (no ipfs text rendered); existing tests PASS.

- [ ] **Step 3: Implement in TrustChainTab**

In `carbon-ready/src/pages/Guardian.tsx`, inside `TrustChainTab` after `pdd` is resolved:

```ts
  const pddCredential = credentials.find((c) => c.id === pdd?.credential_id);
```

and change the first step to:

```ts
    { label: 'PDD registered', detail: pdd
        ? `${pdd.id} · ${pdd.methodology_snapshot}${pddCredential ? ` · VC ${pddCredential.id} · HCS ${pddCredential.hcs.topic_id} #${pddCredential.hcs.sequence_number}` : ''}${pdd.ipfs_cid ? ` · ipfs ${pdd.ipfs_cid}` : ''}`
        : '—', at: pdd?.validated_at ?? null },
```

- [ ] **Step 4: Full suite + typecheck + build**

Run: `npm test && npx tsc -b && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Guardian.tsx src/pages/guardian.ui.test.tsx
git commit -m "feat(guardian): trust chain traces back to the PDD credential"
```
