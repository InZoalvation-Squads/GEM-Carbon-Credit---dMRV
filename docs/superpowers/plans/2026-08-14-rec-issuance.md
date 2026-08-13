# SF-04 REC Issuance Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** REC-registered projects can create, submit, and track I-REC(E) Issue Requests (SF-04) with server-computed MWh from monitoring records; verifier/admin approves as Local Issuer.

**Architecture:** New Prisma model `RecIssueRequest` + enum `RecIssueState` (parallel to `VerificationRequest`, never entangled with it). New server module `modules/rec-issues/` (zod bodies, serializer allowlist, audit entries in transactions). SPA: new `recIssues` store slice (dual demo/server), `recIssuesApi` client, new page `/rec-issuance` with create modal and role-aware actions.

**Tech Stack:** Fastify + Prisma/Postgres + zod (server), React 18 + Zustand + Tailwind (SPA), vitest both sides.

**Spec:** `docs/superpowers/specs/2026-08-14-rec-issuance-design.md`
**Source form:** `docs/reference/rec/sf-04-issue-request-v1.2.1.pdf`

**Codebase facts the implementer must respect** (verified 2026-08-14):

- Module mount: `server/src/app.ts` — import ~line 17-20, `app.register(<x>Routes, { prefix: '/api/v1' })` ~line 123-132. Use the bare `/api/v1` prefix style (like `pddsRoutes`) because routes span `/projects/:id/rec-issues` and `/rec-issues/...`.
- Role guards: `app.authenticate` + `app.requireRole(...)` (see `server/src/modules/verifications/routes.ts:47-49` for the two named preHandler arrays idiom).
- Errors: **throw** `appError(status, code, message)` from `server/src/lib/errors.ts` — never `reply.code(4xx).send`. Codes must be in `ERROR_CODES` (`BAD_REQUEST`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, ...).
- Ids: `uid('RIR')` from `server/src/lib/uid.ts`.
- Audit: `writeAudit(tx, {...})` inside `prisma.$transaction`, actor via `actorFromRequest(req)` (`server/src/lib/audit.ts`). `AuditAction` is a **string union** in `server/src/lib/audit.ts:14-46` AND mirrored at `carbon-ready/src/types/index.ts:5-30`; `EntityType` likewise (server `audit.ts:49-51`, SPA `types/index.ts:32-34`). `AuditLog.action` is a plain String column — **no migration needed for new actions**.
- `carbon-ready/src/lib/labels.ts` `ACTION_LABEL` is an exhaustive `Record<AuditAction, string>` — build breaks until labels added; `carbon-ready/src/lib/labels.test.ts:30-37` hand-maintains the same action list.
- Serializer: explicit allowlist type + function, never a spread (`server/src/modules/verifications/service.ts:32-81`). `DateTime?` → `?.toISOString() ?? null`.
- Org scoping: look rows up via `project: { organization_id: actor.org }` and 404 on miss (`verifications/service.ts:119-127`); illegal state transitions → 409 CONFLICT (`illegalTransition` idiom, `service.ts:129-134`).
- Migrations: `npx prisma migrate dev --name rec_issue_requests` (regenerates the client), commit the migration folder. Tests bootstrap with `migrate deploy` automatically (`server/src/test/db.ts`). Add the back-relation `rec_issue_requests RecIssueRequest[]` on `Project` (`schema.prisma:134-140`) or validation fails.
- `MonitoringRecord.record_date` is an ISO **string** column — range filters `{ gte, lte }` are lexicographic and correct for `YYYY-MM-DD`; boundaries inclusive.
- REC eligibility: project must have a `Pdd` with `state: 'registered'` whose `Methodology.standard === 'REC'`. Snapshot keys in `Pdd.section_data`: `evident_org_id`, `organisation_name`, `facility_name`, `fuel_code`, `fuel_description`, `technology_code`, `technology_description`.
- SPA store: state field ~`store/index.ts:54`, initial value ~322, `resetToSeed` 802-807, `hydrateFromServer` slices 240-272, `refreshFromServer` 294-311, persist key `carbon-ready-store-v15` at :809 → bump to `v16`. Demo fixtures: `carbon-ready/src/test/demoFixtures.ts` `seedDemo()` at 380-397. `carbon-ready/src/data/seed.ts:201` pattern: `export const seedVerifications: VerificationRequest[] = [];`.
- SPA server clients: `carbon-ready/src/lib/server-api.ts` (`apiFetch` line 186, `query` 285, `verificationsApi` 437-488 as the template). API layer fork: `carbon-ready/src/lib/api.ts:121-203` (`serverMode()` branch calling `useStore.getState().applyServer...`; demo branch calling local store action + `tick`).
- Page templates: `carbon-ready/src/pages/Verifications.tsx` (list page, role gating via `useStore((s) => s.currentUser.role)`), `carbon-ready/src/components/evidence/RequestVerificationModal.tsx` (create modal with computed value + period inputs). Badge: add a parallel `RecIssueStatusBadge` next to `PddStatusBadge` in `carbon-ready/src/components/ui/StatusBadge.tsx:43-53`.
- Routes: `carbon-ready/src/App.tsx:56-57` region; Sidebar group `'Verify & Anchor'` at `carbon-ready/src/components/layout/Sidebar.tsx:41-48`.
- Server test harness: copy the `beforeAll` shape of `server/src/modules/verifications/verifications.test.ts:38-73` (`setupTestDatabase`, `resetDatabase`, `seed`, `buildApp`, `registerUser`, `createAdmin` from `server/src/test/fixtures.ts`); no per-test rollback — avoid data collisions with unique periods. Include a `*_PUBLIC_KEYS` serializer-shape test (verifications.test.ts:21-27).

---

### Task 1: Prisma model + migration

**Files:**
- Modify: `server/prisma/schema.prisma` (enum section ~line 62; Project relations 134-140; new model after `Pdd`)
- Create: `server/prisma/migrations/<timestamp>_rec_issue_requests/` (generated)

- [ ] **Step 1: Add the enum** (in the Enums section, after `ProjectLifecycle`/near `VerificationState`):

```prisma
enum RecIssueState {
  draft
  submitted
  issued
  rejected
}
```

- [ ] **Step 2: Add the model** (after the `Pdd` model):

```prisma
// SF-04: I-REC(E) Issue Request — one row per production period claimed for a
// REC-registered project. Parallel to VerificationRequest; never mixed with it.
model RecIssueRequest {
  id                     String        @id
  project_id             String
  created_by             String
  owner_name             String
  assigned_reviewer_name String
  state                  RecIssueState
  request_type           String // 'Normal' | 'Self consumption' (SF-04 §1.1)
  period_start           String // ISO date
  period_end             String // ISO date
  // Σ MonitoringRecord.generation_kwh in period ÷ 1000, 6 dp — server-computed,
  // recomputed & frozen at submit.
  total_production_mwh   Float
  applied_mwh            Float? // SF-04 "I-REC(E) applied for"; null = total
  facility_snapshot      Json // org/facility/fuel/tech copied from the REC Pdd section_data
  receiving_org_name     String
  receiving_account_id   String
  evidence_ids           String[]
  submitted_at           DateTime?
  issued_at              DateTime?
  rejection_reason       String?
  created_at             DateTime      @default(now())
  updated_at             DateTime      @updatedAt

  project Project @relation(fields: [project_id], references: [id])

  @@index([project_id])
  @@map("rec_issue_requests")
}
```

- [ ] **Step 3: Add the back-relation on `Project`** (relations block, after `pdds Pdd[]`):

```prisma
  rec_issue_requests RecIssueRequest[]
```

- [ ] **Step 4: Create the migration** (regenerates the Prisma client):

Run: `cd server && npx prisma migrate dev --name rec_issue_requests`
Expected: new folder under `server/prisma/migrations/`, `Your database is now in sync`. Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit --no-verify -m "feat(rec-issue): RecIssueRequest model + migration"
```

---

### Task 2: Shared types, audit actions, labels, badge

**Files:**
- Modify: `carbon-ready/src/types/index.ts` (AuditAction :5-30, EntityType :32-34, new types near VerificationRequest ~:204)
- Modify: `server/src/lib/audit.ts:14-51` (union mirrors)
- Modify: `carbon-ready/src/lib/labels.ts` (ACTION_LABEL, ENTITY_LABEL)
- Modify: `carbon-ready/src/lib/labels.test.ts:30-37` (action list)
- Modify: `carbon-ready/src/components/ui/StatusBadge.tsx` (RecIssueStatusBadge)
- Test: `carbon-ready/src/lib/labels.test.ts`

- [ ] **Step 1: Extend the SPA AuditAction union** (`types/index.ts`, after `TOKEN_MINTED`):

```ts
  | 'REC_ISSUE_CREATED'
  | 'REC_ISSUE_SUBMITTED'
  | 'REC_ISSUE_ISSUED'
  | 'REC_ISSUE_REJECTED'
  | 'REC_ISSUE_DELETED'
```

Extend `EntityType` with `| 'rec_issue'`.

- [ ] **Step 2: Add the SPA domain types** (after `VerificationComment`/near `VerificationRequest`):

```ts
// ============================================================
// REC Issuance — SF-04 Issue Request (see docs/reference/rec/)
// ============================================================
export type RecIssueState = 'draft' | 'submitted' | 'issued' | 'rejected';

/** Org/facility/fuel data copied from the REC registration at request creation. */
export interface RecFacilitySnapshot {
  evident_org_id: string;
  organisation_name: string;
  facility_name: string;
  fuel_code: string;
  fuel_description: string;
  technology_code: string;
  technology_description: string;
}

export interface RecIssueRequest {
  id: UUID;
  project_id: UUID;
  created_by: string;
  owner_name: string;
  assigned_reviewer_name: string;
  state: RecIssueState;
  request_type: 'Normal' | 'Self consumption';
  period_start: string; // ISO date
  period_end: string;   // ISO date
  total_production_mwh: number; // server-computed; frozen at submit
  applied_mwh: number | null;   // SF-04 "I-REC(E) applied for"; null = total
  facility_snapshot: RecFacilitySnapshot;
  receiving_org_name: string;
  receiving_account_id: string;
  evidence_ids: UUID[];
  submitted_at: string | null;
  issued_at: string | null;
  rejection_reason?: string | null;
}
```

- [ ] **Step 3: Mirror the unions server-side** — `server/src/lib/audit.ts`: add the same five `REC_ISSUE_*` members to `AuditAction` and `'rec_issue'` to `EntityType` (keep ordering style; server union is a documented superset of the SPA one).

- [ ] **Step 4: Labels** — `carbon-ready/src/lib/labels.ts`:

```ts
  REC_ISSUE_CREATED: 'REC Issue Request Created',
  REC_ISSUE_SUBMITTED: 'REC Issue Request Submitted',
  REC_ISSUE_ISSUED: 'REC Certificates Issued',
  REC_ISSUE_REJECTED: 'REC Issue Request Rejected',
  REC_ISSUE_DELETED: 'REC Issue Request Deleted',
```

and in `ENTITY_LABEL`: `rec_issue: 'REC Issue Request',`. Add the five action strings to the hand-maintained list in `labels.test.ts:30-37`.

- [ ] **Step 5: Badge** — in `StatusBadge.tsx`, next to `PddStatusBadge`, add:

```tsx
const recIssueTone: Record<RecIssueState, Tone> = {
  draft: 'gray', submitted: 'blue', issued: 'green', rejected: 'red',
};
const REC_ISSUE_LABEL: Record<RecIssueState, string> = {
  draft: 'Draft', submitted: 'Submitted', issued: 'Issued', rejected: 'Rejected',
};
export function RecIssueStatusBadge({ state }: { state: RecIssueState }) {
  return <Badge tone={recIssueTone[state]}>{REC_ISSUE_LABEL[state]}</Badge>;
}
```

(import `RecIssueState` from `../../types`.)

- [ ] **Step 6: Run** `cd carbon-ready && npx vitest run src/lib/labels.test.ts && npx tsc -b` — PASS/clean. `cd server && npm run typecheck` — clean.

- [ ] **Step 7: Commit**

```bash
git add carbon-ready/src/types/index.ts carbon-ready/src/lib/labels.ts carbon-ready/src/lib/labels.test.ts carbon-ready/src/components/ui/StatusBadge.tsx server/src/lib/audit.ts
git commit --no-verify -m "feat(rec-issue): types, audit actions, labels, status badge"
```

---

### Task 3: Server module `rec-issues` (TDD)

**Files:**
- Create: `server/src/modules/rec-issues/service.ts`
- Create: `server/src/modules/rec-issues/routes.ts`
- Modify: `server/src/app.ts` (import + register under `/api/v1`)
- Test: `server/src/modules/rec-issues/rec-issues.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `rec-issues.test.ts` mirroring the harness of `verifications.test.ts:38-73`. Required coverage (write ALL of these; adapt fixture helpers from `server/src/test/fixtures.ts`):

```ts
// Test data setup once in beforeAll, after seed():
// 1. Create a project via POST /api/v1/projects (owner token).
// 2. Register it under REC: POST /api/v1/projects/:id/pdd with methodology_id
//    'meth-rec-solar', then walk it to registered the same way pdds.test.ts does
//    (submit → validation flow) OR insert the Pdd row directly with prisma
//    (state 'registered', methodology_id 'meth-rec-solar', section_data with
//    evident_org_id/organisation_name/facility_name/fuel_code/fuel_description/
//    technology_code/technology_description) — direct insert is fine and faster.
// 3. Insert MonitoringRecords via prisma.monitoringRecord.createMany:
//    2026-01-01: 1500 kWh, 2026-01-15: 2500 kWh, 2026-02-01: 999 kWh.
// 4. A second project WITHOUT a REC registration (carbon-only) for eligibility 400s.

const REC_ISSUE_PUBLIC_KEYS = [
  'id', 'project_id', 'created_by', 'owner_name', 'assigned_reviewer_name',
  'state', 'request_type', 'period_start', 'period_end',
  'total_production_mwh', 'applied_mwh', 'facility_snapshot',
  'receiving_org_name', 'receiving_account_id', 'evidence_ids',
  'submitted_at', 'issued_at', 'rejection_reason',
];

it('creates a draft with server-computed MWh and facility snapshot', ...)
   // POST /api/v1/projects/:id/rec-issues { period_start: '2026-01-01', period_end: '2026-01-31', request_type: 'Normal' }
   // → 201; rec_issue.total_production_mwh === 0.004 (4000 kWh / 1000, 6dp)
   // → facility_snapshot.evident_org_id matches the Pdd section_data
   // → id matches /^RIR-/; state 'draft'; serializer shape === REC_ISSUE_PUBLIC_KEYS
   // → latestAudit: { action: 'REC_ISSUE_CREATED', entity_type: 'rec_issue' }; expectValidChainTail
it('rejects creation for a project without a registered REC registration (400)', ...)
it('rejects a period with zero production (400)', ...) // e.g. 2025-01-01..2025-01-31
it('recomputes MWh when a draft period changes via PUT', ...) // period widened to 2026-01-01..2026-02-28 → 0.004999 → actually 4999/1000 = 4.999 kWh? no: 1500+2500+999 = 4999 kWh = 4.999 MWh — assert 4.999
it('rejects applied_mwh greater than total on submit (400)', ...)
it('submits: freezes totals, requires receiving fields, audits REC_ISSUE_SUBMITTED', ...)
   // submit without receiving_org_name → 400; after PUT filling them → 200 state 'submitted'
it('approve → issued with issued_at set; audits REC_ISSUE_ISSUED (verifier token)', ...)
it('reject requires a reason and sets rejection_reason (verifier token)', ...)
it('409 CONFLICT on illegal transitions (submit a submitted; approve a draft)', ...)
it('403 FORBIDDEN: owner cannot approve; verifier cannot create', ...)
it('cross-org: requests are invisible (404) to another organization', ...)
it('DELETE removes a draft only; audits REC_ISSUE_DELETED; 409 on submitted', ...)
it('GET /projects/:id/rec-issues and GET /rec-issues list org-scoped requests', ...)
```

NOTE the MWh fixture math: 2026-01 period = 1500+2500 = 4000 kWh = **0.004 MWh? NO — 4000 kWh = 4 MWh.** Use 4 exactly: `expect(r.total_production_mwh).toBe(4)`. Widened period total = 4999 kWh = `4.999`. Keep numbers exact so 6-dp rounding is a no-op; add one dedicated unit assertion for rounding: insert a record of `1` kWh in an isolated period → `0.001`; and `1234.5678` kWh → `1.234568` (6-dp round).

- [ ] **Step 2: Run to verify failure** — `cd server && npx vitest run src/modules/rec-issues/rec-issues.test.ts` → FAIL (module missing / 404 routes).

- [ ] **Step 3: Implement `service.ts`:**

```ts
import type { Prisma, PrismaClient, RecIssueRequest, RecIssueState } from '@prisma/client';
import { uid } from '../../lib/uid.js';
import { appError } from '../../lib/errors.js';
import { writeAudit } from '../../lib/audit.js';

// Actor shape produced by actorFromRequest (lib/audit.ts).
type Actor = { userId: string; role: string; org: string; ip: string | null };

export const REC_REVIEWER_NAME = 'EGAT (Local Issuer)';

/** Σ generation_kwh ÷ 1000, rounded to 6 decimal places (SF-04 §1.3). */
export function computeTotalMwh(records: Array<{ generation_kwh: number }>): number {
  const kwh = records.reduce((sum, r) => sum + r.generation_kwh, 0);
  return Math.round((kwh / 1000) * 1e6) / 1e6;
}

export type PublicRecIssue = {
  id: string; project_id: string; created_by: string; owner_name: string;
  assigned_reviewer_name: string; state: RecIssueState; request_type: string;
  period_start: string; period_end: string; total_production_mwh: number;
  applied_mwh: number | null; facility_snapshot: Prisma.JsonValue;
  receiving_org_name: string; receiving_account_id: string; evidence_ids: string[];
  submitted_at: string | null; issued_at: string | null; rejection_reason: string | null;
};

/** Explicit typed allowlist — NEVER a `{ ...row }` spread. */
export function serializeRecIssue(r: RecIssueRequest): PublicRecIssue {
  return {
    id: r.id, project_id: r.project_id, created_by: r.created_by,
    owner_name: r.owner_name, assigned_reviewer_name: r.assigned_reviewer_name,
    state: r.state, request_type: r.request_type,
    period_start: r.period_start, period_end: r.period_end,
    total_production_mwh: r.total_production_mwh, applied_mwh: r.applied_mwh,
    facility_snapshot: r.facility_snapshot,
    receiving_org_name: r.receiving_org_name, receiving_account_id: r.receiving_account_id,
    evidence_ids: r.evidence_ids,
    submitted_at: r.submitted_at?.toISOString() ?? null,
    issued_at: r.issued_at?.toISOString() ?? null,
    rejection_reason: r.rejection_reason ?? null,
  };
}
```

Core service functions (all org-scoped; all mutations in `prisma.$transaction` with `writeAudit`):

```ts
function illegalTransition(action: string, state: RecIssueState): never {
  throw appError(409, 'CONFLICT', `Cannot ${action} a REC issue request in state "${state}"`);
}

async function requireRecIssue(tx: Prisma.TransactionClient, org: string, id: string) {
  const row = await tx.recIssueRequest.findFirst({
    where: { id, project: { organization_id: org } },
  });
  if (!row) throw appError(404, 'NOT_FOUND', 'REC issue request not found');
  return row;
}

/** Project must belong to the org AND hold a registered REC registration. */
async function requireRecProject(tx: Prisma.TransactionClient, org: string, projectId: string) {
  const project = await tx.project.findFirst({ where: { id: projectId, organization_id: org } });
  if (!project) throw appError(404, 'NOT_FOUND', 'Project not found');
  const pdd = await tx.pdd.findFirst({
    where: { project_id: projectId, state: 'registered', methodology: { standard: 'REC' } },
  });
  if (!pdd) {
    throw appError(400, 'BAD_REQUEST', 'Project has no registered REC registration (SF-02) — register it before requesting issuance');
  }
  return { project, pdd };
}

function snapshotFromSectionData(sectionData: Prisma.JsonValue) {
  const d = (sectionData ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  return {
    evident_org_id: s('evident_org_id'), organisation_name: s('organisation_name'),
    facility_name: s('facility_name'), fuel_code: s('fuel_code'),
    fuel_description: s('fuel_description'), technology_code: s('technology_code'),
    technology_description: s('technology_description'),
  };
}

async function mwhForPeriod(tx: Prisma.TransactionClient, projectId: string, start: string, end: string): Promise<number> {
  const records = await tx.monitoringRecord.findMany({
    where: { project_id: projectId, record_date: { gte: start, lte: end } },
    select: { generation_kwh: true },
  });
  return computeTotalMwh(records);
}
```

`createRecIssue(prisma, actor, projectId, input)`:
- `$transaction`: `requireRecProject` → if `input.period_start > input.period_end` → 400 → `mwhForPeriod` → if `total <= 0` → `appError(400, 'BAD_REQUEST', 'No production recorded in the selected period')` → owner name = `(await tx.user.findUnique({ where: { id: actor.userId } }))?.name ?? actor.userId` (check the User model's display-name column in schema.prisma — use the actual field, e.g. `name`) → `tx.recIssueRequest.create` with `id: uid('RIR')`, `state: 'draft'`, `assigned_reviewer_name: REC_REVIEWER_NAME`, `applied_mwh: input.applied_mwh ?? null`, `receiving_org_name/receiving_account_id: input.* ?? ''`, `evidence_ids: input.evidence_ids ?? []`, `facility_snapshot: snapshotFromSectionData(pdd.section_data)` → `writeAudit` `REC_ISSUE_CREATED` (`newValue: { state: 'draft', total_production_mwh }`).

`updateRecIssue(prisma, actor, id, patch)` — draft only (else `illegalTransition('update', state)`); if period fields present recompute MWh (>0 guard); update fields; audit? No — updates are routine; skip audit (matches the quiet PUT on projects).

`submitRecIssue(prisma, actor, id)` — draft only; recompute MWh from records and freeze it; validate `receiving_org_name` and `receiving_account_id` non-empty (400), `applied_mwh` if set must be `> 0` and `<= total` (400); set `submitted_at: new Date()`, state submitted; audit `REC_ISSUE_SUBMITTED` with previous/new state.

`approveRecIssue(prisma, actor, id)` — submitted only; `issued_at: new Date()`, state issued; audit `REC_ISSUE_ISSUED` (`payload: { mwh: r.applied_mwh ?? r.total_production_mwh }`).

`rejectRecIssue(prisma, actor, id, reason)` — submitted only; set `rejection_reason`; audit `REC_ISSUE_REJECTED`.

`deleteRecIssue(prisma, actor, id)` — draft only (else 409); `tx.recIssueRequest.delete`; audit `REC_ISSUE_DELETED`.

`listForProject(prisma, org, projectId)` / `listAll(prisma, org)` — `findMany` ordered `created_at desc`, org-scoped via `project: { organization_id: org }`.

- [ ] **Step 4: Implement `routes.ts`:**

```ts
// REC issuance (SF-04) routes — registered under the bare /api/v1 prefix
// because paths span /projects/:id/rec-issues and /rec-issues/:id.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isoDateString, idParams } from '../../lib/validation.js';
import { actorFromRequest } from '../../lib/audit.js';
import {
  createRecIssue, updateRecIssue, submitRecIssue, approveRecIssue,
  rejectRecIssue, deleteRecIssue, listForProject, listAll, serializeRecIssue,
} from './service.js';

const CreateBody = z.object({
  period_start: isoDateString,
  period_end: isoDateString,
  request_type: z.enum(['Normal', 'Self consumption']),
  applied_mwh: z.number().positive().optional(),
  receiving_org_name: z.string().trim().optional(),
  receiving_account_id: z.string().trim().optional(),
  evidence_ids: z.array(z.string().min(1)).optional(),
});

const PatchBody = z
  .strictObject({
    period_start: isoDateString.optional(),
    period_end: isoDateString.optional(),
    request_type: z.enum(['Normal', 'Self consumption']).optional(),
    applied_mwh: z.number().positive().nullable().optional(),
    receiving_org_name: z.string().trim().optional(),
    receiving_account_id: z.string().trim().optional(),
    evidence_ids: z.array(z.string().min(1)).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, 'at least one field to update is required');

const RejectBody = z.object({ reason: z.string().trim().min(1) });

export async function recIssuesRoutes(app: FastifyInstance): Promise<void> {
  const proponent = [app.authenticate, app.requireRole('project_owner', 'admin', 'esg_manager')];
  const reviewer = [app.authenticate, app.requireRole('verifier', 'admin')];

  app.post('/projects/:id/rec-issues', { preHandler: proponent }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const body = CreateBody.parse(req.body ?? {});
    const row = await createRecIssue(app.prisma, actorFromRequest(req), id, body);
    return reply.code(201).send({ rec_issue: serializeRecIssue(row) });
  });

  app.get('/projects/:id/rec-issues', { preHandler: [app.authenticate] }, async (req) => {
    const { id } = idParams.parse(req.params);
    const rows = await listForProject(app.prisma, req.user!.org, id);
    return { rec_issues: rows.map(serializeRecIssue) };
  });

  app.get('/rec-issues', { preHandler: [app.authenticate] }, async (req) => {
    const rows = await listAll(app.prisma, req.user!.org);
    return { rec_issues: rows.map(serializeRecIssue) };
  });

  app.put('/rec-issues/:id', { preHandler: proponent }, async (req) => {
    const { id } = idParams.parse(req.params);
    const patch = PatchBody.parse(req.body ?? {});
    const row = await updateRecIssue(app.prisma, actorFromRequest(req), id, patch);
    return { rec_issue: serializeRecIssue(row) };
  });

  app.post('/rec-issues/:id/submit', { preHandler: proponent }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await submitRecIssue(app.prisma, actorFromRequest(req), id);
    return { rec_issue: serializeRecIssue(row) };
  });

  app.post('/rec-issues/:id/approve', { preHandler: reviewer }, async (req) => {
    const { id } = idParams.parse(req.params);
    const row = await approveRecIssue(app.prisma, actorFromRequest(req), id);
    return { rec_issue: serializeRecIssue(row) };
  });

  app.post('/rec-issues/:id/reject', { preHandler: reviewer }, async (req) => {
    const { id } = idParams.parse(req.params);
    const { reason } = RejectBody.parse(req.body ?? {});
    const row = await rejectRecIssue(app.prisma, actorFromRequest(req), id, reason);
    return { rec_issue: serializeRecIssue(row) };
  });

  app.delete('/rec-issues/:id', { preHandler: proponent }, async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await deleteRecIssue(app.prisma, actorFromRequest(req), id);
    return reply.code(204).send();
  });
}
```

(Adjust `app.prisma`/`req.user` access to match how `verifications/routes.ts` actually reads them — e.g. if handlers use a module-scoped prisma import or `app.prisma` decorator, mirror it exactly.)

- [ ] **Step 5: Register in `app.ts`** — add import `import { recIssuesRoutes } from './modules/rec-issues/routes.js';` next to the other module imports and `await app.register(recIssuesRoutes, { prefix: '/api/v1' });` next to `pddsRoutes`.

- [ ] **Step 6: Run** `cd server && npx vitest run src/modules/rec-issues/rec-issues.test.ts` — ALL PASS. Then the full server suite `npx vitest run` — all green (baseline 213 + new).

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/rec-issues server/src/app.ts
git commit --no-verify -m "feat(rec-issue): server module — create/submit/approve SF-04 issue requests"
```

---

### Task 4: SPA data layer (client, store slice, api fork, fixtures)

**Files:**
- Modify: `carbon-ready/src/lib/server-api.ts` (add `recIssuesApi` after `verificationsApi`)
- Modify: `carbon-ready/src/store/index.ts` (slice + demo actions + applyServerRecIssue + hydrate/refresh + reset + persist key v16)
- Modify: `carbon-ready/src/data/seed.ts` (`export const seedRecIssues: RecIssueRequest[] = [];`)
- Modify: `carbon-ready/src/lib/api.ts` (rec-issue methods)
- Modify: `carbon-ready/src/test/demoFixtures.ts` (`demoRecIssues` + seedDemo entry)
- Modify: `carbon-ready/src/store/hydrate.test.ts` (`/rec-issues` in HAPPY_ROUTES if route-keyed)
- Test: `carbon-ready/src/store/rec-issues.test.ts` (new)

- [ ] **Step 1: Write the failing store test** `carbon-ready/src/store/rec-issues.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from './index';
import { api } from '../lib/api';

beforeEach(() => seedDemo());

describe('REC issue requests — demo store', () => {
  // prj/monitoring fixture ids: check test/demoFixtures for a project that has
  // monitoring records; if none is REC-registered, the test registers one by
  // pointing an existing project's pdd at 'meth-rec-solar' with state 'registered'
  // via useStore.setState (same trick other tests use).

  it('creates a draft with MWh computed from monitoring records in the period', async () => {
    // arrange: pick a project with known monitoring records (sum S kWh in period P)
    // act: await api.createRecIssue({ project_id, period_start, period_end, request_type: 'Normal' })
    // assert: store.recIssues[0].total_production_mwh === S/1000 (6dp), state 'draft'
  });

  it('submit → submitted; approve → issued with issued_at', async () => { /* walk the machine */ });

  it('reject stores the reason', async () => { /* ... */ });
});
```

(Fill the arrange/act/assert bodies concretely against the fixture data you find in `demoFixtures.ts` — `demoMonitoring`/`demoProjects` names and values are visible there; use exact numbers.)

- [ ] **Step 2: Run to verify failure** — `cd carbon-ready && npx vitest run src/store/rec-issues.test.ts` → FAIL (api method missing).

- [ ] **Step 3: `server-api.ts` client** (after `verificationsApi`):

```ts
export const recIssuesApi = {
  async list(): Promise<RecIssueRequest[]> {
    return (await apiFetch<{ rec_issues: RecIssueRequest[] }>('/rec-issues')).rec_issues;
  },
  async create(projectId: string, input: {
    period_start: string; period_end: string;
    request_type: 'Normal' | 'Self consumption';
    applied_mwh?: number; receiving_org_name?: string; receiving_account_id?: string;
    evidence_ids?: string[];
  }): Promise<RecIssueRequest> {
    return (await apiFetch<{ rec_issue: RecIssueRequest }>(`/projects/${projectId}/rec-issues`, { method: 'POST', body: input })).rec_issue;
  },
  async update(id: string, patch: Record<string, unknown>): Promise<RecIssueRequest> {
    return (await apiFetch<{ rec_issue: RecIssueRequest }>(`/rec-issues/${id}`, { method: 'PUT', body: patch })).rec_issue;
  },
  async submit(id: string): Promise<RecIssueRequest> {
    return (await apiFetch<{ rec_issue: RecIssueRequest }>(`/rec-issues/${id}/submit`, { method: 'POST' })).rec_issue;
  },
  async approve(id: string): Promise<RecIssueRequest> {
    return (await apiFetch<{ rec_issue: RecIssueRequest }>(`/rec-issues/${id}/approve`, { method: 'POST' })).rec_issue;
  },
  async reject(id: string, reason: string): Promise<RecIssueRequest> {
    return (await apiFetch<{ rec_issue: RecIssueRequest }>(`/rec-issues/${id}/reject`, { method: 'POST', body: { reason } })).rec_issue;
  },
  async remove(id: string): Promise<void> {
    await apiFetch<void>(`/rec-issues/${id}`, { method: 'DELETE' });
  },
};
```

- [ ] **Step 4: Store slice** (`store/index.ts`) — five touchpoints:
  1. State: `recIssues: RecIssueRequest[];` + action signatures in the store interface.
  2. Init: `recIssues: seedRecIssues,` (import from `../data/seed`; add `export const seedRecIssues: RecIssueRequest[] = [];` there).
  3. Demo actions (mirror the local `createVerification` mechanics at :493-509, including its audit-write helper):

```ts
createRecIssue: (input) => {
  const s = get();
  const kwh = s.monitoringRecords
    .filter((m) => m.project_id === input.project_id
      && m.record_date >= input.period_start && m.record_date <= input.period_end)
    .reduce((sum, m) => sum + m.generation_kwh, 0);
  const total = Math.round((kwh / 1000) * 1e6) / 1e6;
  const pdd = s.pdds.find((p) => p.project_id === input.project_id && p.state === 'registered'
    && s.methodologies.find((m) => m.id === p.methodology_id)?.standard === 'REC');
  const sd = (pdd?.section_data ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof sd[k] === 'string' ? (sd[k] as string) : '');
  const entity: RecIssueRequest = {
    id: `RIR-${Math.random().toString(36).slice(2, 8)}`,
    project_id: input.project_id,
    created_by: s.currentUser.id, owner_name: s.currentUser.name,
    assigned_reviewer_name: 'EGAT (Local Issuer)', state: 'draft',
    request_type: input.request_type,
    period_start: input.period_start, period_end: input.period_end,
    total_production_mwh: total, applied_mwh: input.applied_mwh ?? null,
    facility_snapshot: {
      evident_org_id: str('evident_org_id'), organisation_name: str('organisation_name'),
      facility_name: str('facility_name'), fuel_code: str('fuel_code'),
      fuel_description: str('fuel_description'), technology_code: str('technology_code'),
      technology_description: str('technology_description'),
    },
    receiving_org_name: input.receiving_org_name ?? '',
    receiving_account_id: input.receiving_account_id ?? '',
    evidence_ids: input.evidence_ids ?? [], submitted_at: null, issued_at: null,
  };
  set((st) => ({ recIssues: [entity, ...st.recIssues] }));
  /* audit write via the same helper createVerification uses, action 'REC_ISSUE_CREATED' */
  return entity;
},
submitRecIssue / approveRecIssue / rejectRecIssue / deleteRecIssue:
  // simple set() state transitions + timestamps + audit, mirroring
  // submitVerification/approveVerification/rejectVerification at :511-541.
applyServerRecIssue: (r) => set((st) => ({
  recIssues: [r, ...st.recIssues.filter((x) => x.id !== r.id)],
})),
```

  4. Hydrate + refresh: add `['recIssues', recIssuesApi.list().then((recIssues) => set({ recIssues }))],` to the `hydrateFromServer` slices (~:269) and the matching task in `refreshFromServer` (~:306). Update `hydrate.test.ts` HAPPY_ROUTES with `/rec-issues` if the mock is route-keyed.
  5. `resetToSeed` (~:802): `recIssues: seedRecIssues,`. Bump the persist key `carbon-ready-store-v15` → `carbon-ready-store-v16` (:809).

- [ ] **Step 5: `api.ts` methods** (after the verification block, same fork pattern):

```ts
async recIssues(): Promise<RecIssueRequest[]> {
  if (serverMode()) return recIssuesApi.list();
  return tick(useStore.getState().recIssues);
},
async createRecIssue(input: { project_id: UUID; period_start: string; period_end: string;
  request_type: 'Normal' | 'Self consumption'; applied_mwh?: number;
  receiving_org_name?: string; receiving_account_id?: string; evidence_ids?: UUID[] }): Promise<RecIssueRequest> {
  if (serverMode()) {
    const { project_id, ...body } = input;
    const r = await recIssuesApi.create(project_id, body);
    useStore.getState().applyServerRecIssue(r);
    toast.success('Issue request created', 'Draft saved.');
    return r;
  }
  const r = useStore.getState().createRecIssue(input);
  toast.success('Issue request created', 'Draft saved.');
  return tick(r);
},
// submitRecIssue / approveRecIssue / rejectRecIssue / deleteRecIssue follow the
// exact submitVerification shape (api.ts:144-153): serverMode() → recIssuesApi.x
// → applyServerRecIssue (delete: filter out of the slice) → toast; else local
// store action → toast → tick.
```

- [ ] **Step 6: Demo fixtures** — in `demoFixtures.ts` add a `demoRecIssues: RecIssueRequest[]` (2 rows: one draft, one issued, tied to an existing demo project id; total MWh values consistent with that project's demo monitoring records) and add `recIssues: demoRecIssues` in `seedDemo()`'s setState. If no demo project is REC-registered, also point one demo pdd fixture at `meth-rec-solar`/registered inside `demoFixtures.ts` (NOT in app seed data).

- [ ] **Step 7: Run** — `cd carbon-ready && npx vitest run src/store/ && npx tsc -b` → all green. Full SPA suite — green.

- [ ] **Step 8: Commit**

```bash
git add carbon-ready/src/lib/server-api.ts carbon-ready/src/lib/api.ts carbon-ready/src/store/index.ts carbon-ready/src/store/rec-issues.test.ts carbon-ready/src/store/hydrate.test.ts carbon-ready/src/data/seed.ts carbon-ready/src/test/demoFixtures.ts
git commit --no-verify -m "feat(rec-issue): SPA data layer — client, store slice, dual-mode api"
```

---

### Task 5: REC Issuance page + modal + routing (TDD)

**Files:**
- Create: `carbon-ready/src/pages/RecIssuance.tsx`
- Create: `carbon-ready/src/components/rec/RecIssueModal.tsx`
- Modify: `carbon-ready/src/App.tsx` (route `/rec-issuance`)
- Modify: `carbon-ready/src/components/layout/Sidebar.tsx` (item under Verifications)
- Test: `carbon-ready/src/pages/recissuance.ui.test.tsx`

- [ ] **Step 1: Failing UI tests** `recissuance.ui.test.tsx` (template: `verifications.ui.test.tsx`):

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecIssuance } from './RecIssuance';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => seedDemo());
function renderPage() { return render(<MemoryRouter><RecIssuance /></MemoryRouter>); }

describe('REC Issuance page', () => {
  it('lists demo requests with state badges and MWh', () => {
    renderPage();
    expect(screen.getByText(/REC Issuance/)).toBeInTheDocument();
    // demoRecIssues rows visible: assert one Draft chip and one Issued chip
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Issued')).toBeInTheDocument();
  });

  it('PP sees the create button; verifier does not', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Issue Request/ })).toBeInTheDocument();
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    renderPage();
    // verifier: no create button, but sees Approve on the submitted row (add a submitted fixture or transition one)
  });

  it('create modal: only REC-registered projects listed; MWh auto-preview; fee estimate', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Issue Request/ }));
    // project <Select> options = projects with registered REC pdd only
    // set period over known demo monitoring records → assert the previewed MWh text
    // assert fee text = mwh * 0.95 (Normal) and switches to 1.33 for Self consumption
  });

  it('submit then approve as verifier walks draft → submitted → issued', async () => { /* ... */ });
});
```

(Concretize all assertions against the fixture values chosen in Task 4 Step 6 — exact MWh numbers, project names.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: `RecIssueModal.tsx`** — mirror `RequestVerificationModal.tsx` structure:
  - Project `<Select>` filtered to REC-registered projects:
    `projects.filter((p) => pdds.some((d) => d.project_id === p.id && d.state === 'registered' && methodologies.find((m) => m.id === d.methodology_id)?.standard === 'REC'))`
  - Period `<Input type="date">` pair; MWh preview `useMemo` (same sum as the store action; display with `data-testid="mwh-preview"`; warn when 0 and disable submit).
  - `request_type` `<Select>`: `Normal` / `Self consumption`.
  - Optional `applied_mwh` number input (validate ≤ preview), receiving org/account text inputs.
  - Fee estimate line: `฿{(mwh * (type === 'Self consumption' ? 1.33 : 0.95)).toFixed(2)} (EGAT FN-01 2026 — โดยประมาณ)` with `data-testid="fee-estimate"`.
  - Help note (SF-04A warrant): `ไฟฟ้างวดนี้ต้องไม่ถูกเคลมในกลไกอื่น (T-VER ฯลฯ) — ตามคำประกาศ SF-04A`.
  - Buttons: `Save draft` → `api.createRecIssue(...)`; `Save & Submit` → create then `api.submitRecIssue(id)`; busy/disabled handling as in the template modal.

- [ ] **Step 4: `RecIssuance.tsx`** — mirror `Verifications.tsx`:
  - `const role = useStore((s) => s.currentUser.role);` `canCreate = role === 'project_owner' || role === 'esg_manager';` `canReview = role === 'verifier' || role === 'admin';`
  - PageHeader `title="REC Issuance"` subtitle `"SF-04 Issue Requests — ขอออกใบรับรอง I-REC(E) จากข้อมูลการผลิตจริง"`, action = create button when `canCreate`.
  - KPI row: counts by state + Σ issued MWh.
  - Table columns: Project, Period, MWh (applied ?? total), Request type, State (`RecIssueStatusBadge`), Actions.
  - Row actions: draft + canCreate → Submit / Delete; submitted + canReview → Approve / Reject (reject prompts a reason via `window.prompt` or a small inline input — match how Verifications handles reject); issued → show `issued_at` date.
  - Empty state: no REC-registered projects → EmptyState hint pointing to Register Project → REC.

- [ ] **Step 5: Route + sidebar** — `App.tsx`: `<Route path="/rec-issuance" element={<RecIssuance />} />` next to verifications routes. `Sidebar.tsx` `'Verify & Anchor'` group, below Verifications:

```ts
{ to: '/rec-issuance', label: 'REC Issuance', icon: Zap, roles: ['project_owner', 'esg_manager', 'verifier'] },
```

(`Zap` imported from `lucide-react` alongside the existing icon imports.)

- [ ] **Step 6: Run** — page tests green, then full SPA suite + `npx tsc -b` green.

- [ ] **Step 7: Commit**

```bash
git add carbon-ready/src/pages/RecIssuance.tsx carbon-ready/src/pages/recissuance.ui.test.tsx carbon-ready/src/components/rec/RecIssueModal.tsx carbon-ready/src/App.tsx carbon-ready/src/components/layout/Sidebar.tsx
git commit --no-verify -m "feat(rec-issue): REC Issuance page — create, submit, approve SF-04 requests"
```

---

### Task 6: Full verification

- [ ] Full SPA suite: `cd carbon-ready && npx vitest run` — green.
- [ ] Full server suite: `cd server && npx vitest run` — green (baseline 213 + new module tests).
- [ ] Builds: `cd carbon-ready && npm run build`; `cd server && npm run build` — clean.
- [ ] Migration applied to dev DB (was done by `migrate dev` in Task 1; confirm `npx prisma migrate status` reports up to date).
- [ ] Manual smoke: login PP → REC Issuance → create request on the REC project (period with data) → MWh auto → submit → switch to verifier → approve → issued row shows MWh + date.
- [ ] Wrap up via superpowers:finishing-a-development-branch conventions (stay on feat/sprint-1-mvp per project workflow).

---

## Self-review notes

- **Spec coverage:** model+migration (T1), audit/labels/badge (T2 — spec §2 audit actions; DELETE adds `REC_ISSUE_DELETED` beyond the spec's four, required by spec §4 "draft is deletable"), server endpoints incl. eligibility/MWh/validation/roles (T3 = spec §2+§4+error handling), SPA client/store/dual api (T4 = spec §3 data plumbing), page+modal+fee estimate+empty state (T5 = spec §3 UI), testing section covered across T3–T6.
- **Type consistency:** `RecIssueState` union identical in Prisma enum, SPA types, badge maps. `PublicRecIssue` keys == `REC_ISSUE_PUBLIC_KEYS` in tests == SPA `RecIssueRequest` interface (SPA adds nothing). `recIssuesApi` method names match api.ts usage. Fee constants 0.95/1.33 appear in modal + tests only.
- **Known judgment calls the implementer may adapt (report if changed):** exact prisma/user display-name field for `owner_name`; the store's audit-write helper name; how Verifications implements reject-reason input. Adapt to the code as found at the cited line refs — do not invent new patterns.
