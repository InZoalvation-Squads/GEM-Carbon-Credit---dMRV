# SF-04 Supplemental Fields + Draft Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Evident Facility ID + Requested Labels on issue requests (create + edit), make drafts editable via the existing PUT, and map both fields into the SF-04 export.

**Architecture:** Additive migration (2 String columns, default '') → server body/serializer plumbing → SPA type/store/api (`updateRecIssue` dual-mode) → `RecIssueModal` edit mode + create-mode prefill-from-previous-request → "แก้ไข" button on draft rows → `EvidentSF04` §1.2 mapping.

**Tech Stack:** Prisma/Fastify/zod (server), React 18 + Zustand (SPA), vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-sf04-fields-and-draft-edit-design.md`

**Codebase facts:**
- Server module: `server/src/modules/rec-issues/` (service.ts serializer `PublicRecIssue` + routes.ts `CreateBody`/`PatchBody`; PatchBody is strict + min-1-field refine; PUT recomputes MWh on period change — keep).
- Tests: `server/src/modules/rec-issues/rec-issues.test.ts` has `REC_ISSUE_PUBLIC_KEYS` shape array — must gain the 2 keys.
- Migration: `cd server && npx prisma migrate dev --name sf04_supplemental_fields` (additive; existing rows need DEFAULT '' — write the columns with `@default("")`? No: match `receiving_org_name` which is plain `String`; for the migration to succeed on non-empty tables the SQL needs `NOT NULL DEFAULT ''` — simplest is to declare `@default("")` in the schema like created_at does with defaults; that keeps prisma-generated SQL additive-safe. Keeping `@default("")` in the schema permanently is fine and self-documenting.)
- SPA: `carbon-ready/src/types/index.ts` `RecIssueRequest`; store `carbon-ready/src/store/index.ts` (demo actions around :613-660, `applyServerRecIssue`, uid helper); `carbon-ready/src/lib/api.ts` rec-issue block (fork pattern; note there is create/submit/approve/reject/delete but **no updateRecIssue yet**); `carbon-ready/src/lib/server-api.ts` `recIssuesApi.update` exists.
- Fixtures: `carbon-ready/src/test/demoFixtures.ts` `demoRecIssues` (RIR-1000 issued / RIR-1001 draft) — add `facility_id`/`requested_labels` fields ('' for RIR-1001; give RIR-1000 `facility_id: 'DEMO-FAC-0001'`, `requested_labels: ''`). All existing `RecIssueRequest` literals (fixtures + any test-built objects) must gain the two fields or tsc breaks — grep for `RecIssueRequest` literals.
- Modal: `carbon-ready/src/components/rec/RecIssueModal.tsx` (canSaveDraft/canSubmit split, receiving guard hint). Page: `carbon-ready/src/pages/RecIssuance.tsx` (draft rows have Submit-guard span + Delete; modal mounted at page level `{creating && <RecIssueModal onClose=.../>}` — check actual state name).
- Export: `carbon-ready/src/templates/EvidentSF04.tsx` §1.2 currently renders Facility ID/code and Requested Labels as blank cells — swap in the values.

---

### Task 1: Server — columns + body/serializer plumbing (TDD)

**Files:**
- Modify: `server/prisma/schema.prisma` (RecIssueRequest +2 columns)
- Create: migration via `prisma migrate dev`
- Modify: `server/src/modules/rec-issues/service.ts`, `routes.ts`
- Test: `server/src/modules/rec-issues/rec-issues.test.ts`

- [ ] **Step 1: Failing tests.** In `rec-issues.test.ts`: add `'facility_id', 'requested_labels'` to `REC_ISSUE_PUBLIC_KEYS`; extend the create test body with `facility_id: 'FAC-TEST-01', requested_labels: 'GoldLabel'` and assert both round-trip; add a PUT case patching `facility_id` on a draft and asserting the response carries it.
- [ ] **Step 2: Run** → FAIL (unknown keys / missing columns).
- [ ] **Step 3: Schema** — add to the RecIssueRequest model, after `receiving_account_id`:

```prisma
  // Evident-assigned Facility ID/code (known only after SF-02 approval) and
  // SF-04 §1.2 Requested Labels — both optional on the official form.
  facility_id      String @default("")
  requested_labels String @default("")
```

Run `cd server && npx prisma migrate dev --name sf04_supplemental_fields` (additive; regenerates client).
- [ ] **Step 4: Service + routes** — `CreateBody`/`PatchBody` gain `facility_id: z.string().trim().optional()` and `requested_labels: z.string().trim().optional()`; `createRecIssue` passes `facility_id: input.facility_id ?? ''` etc.; `updateRecIssue` includes them in the patchable set; serializer + `PublicRecIssue` gain both keys.
- [ ] **Step 5: Run** module tests green → full server suite green → `npm run typecheck` (3 pre-existing errors only).
- [ ] **Step 6: Commit** — `git add server/prisma/schema.prisma server/prisma/migrations server/src/modules/rec-issues && git commit --no-verify -m "feat(rec-issue): facility_id + requested_labels columns for SF-04"`

---

### Task 2: SPA data layer — type, store update action, api fork (TDD)

**Files:**
- Modify: `carbon-ready/src/types/index.ts` (RecIssueRequest +2 fields)
- Modify: `carbon-ready/src/store/index.ts` (createRecIssue stores them; new `updateRecIssue` demo action; interface signatures)
- Modify: `carbon-ready/src/lib/api.ts` (`updateRecIssue` fork)
- Modify: `carbon-ready/src/test/demoFixtures.ts` (fixture fields per Codebase facts)
- Test: `carbon-ready/src/store/rec-issues.test.ts`

- [ ] **Step 1: Failing test** — add to `rec-issues.test.ts`:

```ts
  it('updateRecIssue patches draft fields and recomputes MWh when the period changes', async () => {
    // create a draft via api.createRecIssue on prj-0010 (period Feb 2026 → 0.999 MWh)
    // await api.updateRecIssue(id, { facility_id: 'FAC-XYZ', period_start: '2026-03-01', period_end: '2026-03-31' })
    // assert store row: facility_id 'FAC-XYZ', total_production_mwh 6 (Mar 2026 fixture records)
  });
```

(Concretize with the exact api call results; demo-mode only.)
- [ ] **Step 2: Run** → FAIL (api.updateRecIssue missing).
- [ ] **Step 3: Implement** — type fields (`facility_id: string; requested_labels: string;` after `receiving_account_id`); store `createRecIssue` sets them from input (`?? ''`); new demo action:

```ts
updateRecIssue: (id, patch) => {
  let updated: RecIssueRequest | undefined;
  set((st) => ({
    recIssues: st.recIssues.map((r) => {
      if (r.id !== id || r.state !== 'draft') return r;
      const next = { ...r, ...patch } as RecIssueRequest;
      if (patch.period_start || patch.period_end) {
        const kwh = st.records
          .filter((m) => m.project_id === r.project_id
            && m.record_date >= next.period_start && m.record_date <= next.period_end)
          .reduce((sum, m) => sum + m.generation_kwh, 0);
        next.total_production_mwh = Math.round((kwh / 1000) * 1e6) / 1e6;
      }
      updated = next;
      return next;
    }),
  }));
  return updated;
},
```

`api.updateRecIssue(id, patch)` fork: server → `recIssuesApi.update` + `applyServerRecIssue` + toast 'Issue request updated'; demo → store action + toast + tick. Fixtures per Codebase facts (and fix any other RecIssueRequest literals tsc flags).
- [ ] **Step 4: Run** store tests + full SPA suite + `npx tsc -b` green.
- [ ] **Step 5: Commit** — `git add carbon-ready/src/types/index.ts carbon-ready/src/store/index.ts carbon-ready/src/store/rec-issues.test.ts carbon-ready/src/lib/api.ts carbon-ready/src/test/demoFixtures.ts && git commit --no-verify -m "feat(rec-issue): SPA update action + supplemental fields"`

---

### Task 3: Modal edit mode + prefill + edit button + export mapping (TDD)

**Files:**
- Modify: `carbon-ready/src/components/rec/RecIssueModal.tsx`
- Modify: `carbon-ready/src/pages/RecIssuance.tsx`
- Modify: `carbon-ready/src/templates/EvidentSF04.tsx` (§1.2 values)
- Test: `carbon-ready/src/pages/recissuance.ui.test.tsx`, `carbon-ready/src/templates/evident-sf04.ui.test.tsx`

- [ ] **Step 1: Failing tests.**
- recissuance.ui.test.tsx: (a) draft row shows "แก้ไข"; clicking opens the modal prefilled (receiving org input shows the row's value, project select disabled); typing a Facility ID + "Save changes" updates the store row (waitFor `facility_id`). (b) create modal prefills Facility ID from the project's latest request: set RIR-1000.facility_id='DEMO-FAC-0001' fixture (Task 2) → open create modal → Facility ID input already shows 'DEMO-FAC-0001'.
- evident-sf04.ui.test.tsx: RIR-1000 export shows 'DEMO-FAC-0001' in §1.2.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Modal** — prop `editing?: RecIssueRequest`; initial state from `editing` when present (project fixed = `editing.project_id`, select `disabled`, period/type/applied/receiving/facility/labels prefilled); two new labelled inputs "Evident Facility ID/code" + "Requested Labels" (optional, no guard changes); create-mode prefill: `const prev = recIssues.filter((r) => r.project_id === projectId).at(0)` (list is newest-first) → initial facility/labels from `prev` — recompute when projectId changes (useEffect resetting only if user hasn't typed; simplest: derive initial on projectId change via key on inputs or setState in a projectId-change effect — keep it simple and predictable, note the chosen mechanism in code). Buttons in edit mode: "Save changes" → `api.updateRecIssue(editing.id, patch)`; "Save & Submit" → update then submit. Create mode passes the two new values into `api.createRecIssue`.
- [ ] **Step 4: Page** — draft rows: `<Button size="sm" variant="ghost" onClick={() => setEditingRow(r)}>แก้ไข</Button>` before Submit; page state `editingRow` mounts `<RecIssueModal editing={editingRow} onClose={...} />`.
- [ ] **Step 5: Export** — §1.2 rows use `str('facility_id')`-equivalent from the rec row (blank when '').
- [ ] **Step 6: Run** — targeted files green → full SPA suite green → `npx tsc -b` clean → `cd carbon-ready && npm run build` clean.
- [ ] **Step 7: Commit** — `git add carbon-ready/src/components/rec/RecIssueModal.tsx carbon-ready/src/pages/RecIssuance.tsx carbon-ready/src/pages/recissuance.ui.test.tsx carbon-ready/src/templates/EvidentSF04.tsx carbon-ready/src/templates/evident-sf04.ui.test.tsx && git commit --no-verify -m "feat(rec-issue): edit drafts + facility id/labels flow into SF-04 export"`

---

## Self-review notes

- **Spec coverage:** columns/migration (T1§1), server plumbing incl. optional-at-submit (T1), SPA type/store/api (T2 = spec §3), modal edit + prefill (T3 = spec §4), edit button (T3 = spec §5), export mapping (T3 = spec §6), error handling unchanged (server guards), tests per spec across tasks.
- **Type consistency:** field names `facility_id`/`requested_labels` everywhere; `updateRecIssue(id, patch)` signature identical in store/api; `editing` prop name matches page usage.
- **Judgment calls to adapt in place (report if changed):** exact page state name for the create modal; prefill-reset mechanism on project change; PUBLIC_KEYS ordering.
