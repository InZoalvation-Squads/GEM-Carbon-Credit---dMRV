# Carbon Ready — Project Registration & PDD (Guardian-shaped) — Design

**Date:** 2026-06-30
**Branch:** `feat/sprint-1-mvp`
**App:** `carbon-ready/`
**Status:** Design approved — pending implementation plan

---

## 1. Overview / ภาพรวม

**ไทย:** เพิ่มชั้น "ขึ้นทะเบียนโครงการ" (Registration) ก่อนหน้า dMRV loop เดิม โดยยึดหลัก **methodology มาก่อน project**: ผู้ใช้ต้องเลือก methodology → เลือก/สร้าง project → กรอกข้อมูลตาม methodology จนได้ **เอกสาร PDD** → ส่งให้ auditor (VVB) ตรวจ (validate) → เมื่อผ่านจึง "ขึ้นทะเบียน" (registered) และ **ปลดล็อก** กระบวนการ dMRV เดิม (Monitoring / Verification / Guardian anchor). โครงสร้าง methodology + PDD + workflow อิงโมเดลของ **Hedera Guardian** (Policy = Schema + role-based workflow blocks).

**EN:** Add a project **Registration** stage in front of the existing dMRV loop, enforcing **methodology-first**: select methodology → select/create project → fill methodology-driven fields to produce a **PDD document** → submit to an auditor (VVB) for **validation** → on approval the project becomes **registered**, which **unlocks** the existing dMRV loop. The methodology / PDD / workflow model mirrors **Hedera Guardian** (a methodology is a Policy = Schema + role-based workflow blocks).

**The two audit gates (Guardian model):**
```
Gate 1 — VALIDATION (this spec)          Gate 2 — VERIFICATION (already built)
 PDD of the project, once                Monitoring Report, every period
 VVB validates → project registered      VVB verifies → Guardian anchor (mint)
```

This spec covers **Gate 1 only**. Gate 2 (per-period verification + anchoring) already exists (`Verifications`, `Guardian`, `lib/guardian.ts`).

---

## 2. Approach

**Chosen: Approach A — separate Registration & Validation module.** A dedicated module keeps the two audit gates (validation-of-PDD vs verification-of-monitoring) cleanly separated, matching the real T-VER / Guardian lifecycle, while reusing existing app patterns (verifier role, comment threads, `audit_write` hash-chain, `StatusBadge`, `lib/api.ts` facade, `lib/calc.ts`, `lib/hash.ts`).

Rejected:
- **B — extend existing Verifications** to carry both PDD validation and MR verification via a `type` flag. Conflates two conceptually distinct gates; `ReviewDetail` becomes overloaded because a multi-section PDD is a very different artifact from an evidence package.
- **C — PDD as a tab on ProjectDetail** with a single approve button. Violates methodology-first (project must pre-exist), weak audit gate, no real PDD document.

---

## 3. Guardian mapping

A methodology is modeled as a **Guardian Policy**. Mapping:

| Carbon Ready | Hedera Guardian | Seam / reuse |
|---|---|---|
| `Methodology` | **Policy** | 1 methodology = 1 policy |
| `PddSectionSchema` / `PddFieldSchema` | **Schema** (UUID, auto-generated form) | `requestVcDocumentBlock` |
| field type `computed` | **Auto-Calculate** field | `customLogicBlock` → `lib/calc.ts` |
| Validator (role `verifier`) | **VVB** (Validation & Verification Body) | `documentValidatorBlock` |
| role `project_owner` / `esg_manager` | **Project Proponent** | |
| role `admin` | **Standard Registry** (TGO) | final register |
| existing Guardian anchor | **mintDocumentBlock** | `lib/guardian.ts` (unchanged) |

**Guardian field types → PDD field types** (mirrored): `String · Number · Date · Enum · Boolean · URL · Email · Image · Auto-Calculate (computed) · Sub-Schema (nested) · Help Text`, plus conditional visibility (`showIf` referencing another enum field).

**Guardian document states** `Draft → Submitted → Under Review → Approved/Rejected → Published → Minted` map to `PddState` (§4).

Sources:
- Guardian PDD Schema Development (Ch.9): https://guardian.hedera.com/methodology-digitization/methodology-digitization-handbook/part-3/chapter-9.md
- Guardian Policy Workflow Architecture (Ch.13): https://guardian.hedera.com/methodology-digitization/methodology-digitization-handbook/part-4/chapter-13

---

## 4. Domain model

### 4.1 Methodology (master data — Guardian Policy)
```ts
interface Methodology {
  id: UUID;
  code: string;                    // 'T-VER-S-0X'
  name: string;
  standard: 'T-VER';
  version: string;                 // 'v3.0'
  sectoral_scope: string;          // 'Energy industries'
  status: 'active' | 'deprecated';
  pdd_sections: PddSectionSchema[];        // drives the PDD form
  required_evidence: EvidenceCategory[];   // audit must see these before register
  monitoring_params: MonitoringParam[];    // params measured during dMRV
}

interface PddSectionSchema {
  key: string;                     // 'baseline'
  title: string;                   // 'B. Methodology & Baseline'
  help?: string;
  fields: PddFieldSchema[];
}

interface PddFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'date'
      | 'boolean' | 'url' | 'email' | 'image' | 'computed';
  unit?: string;                   // 'kWp', 'tCO₂e/yr'
  required: boolean;
  options?: string[];              // for select/enum
  help?: string;
  showIf?: { field: string; equals: string };   // conditional visibility
  source?: string;                 // for 'computed': 'capacity_kwp' | 'grid_factor' | 'er_estimate'
}

interface MonitoringParam {
  key: string;                     // 'EG_PJ' (net electricity to grid)
  label: string;
  unit: string;                    // 'kWh'
  method: string;                  // 'revenue-grade meter'
  frequency: string;               // 'monthly'
}
```

### 4.2 ProjectDesignDocument (PDD — the registration record)
1 project → 1 PDD (no re-registration / multi-version this sprint).
```ts
type PddState = 'draft' | 'submitted' | 'under_validation'
              | 'revision_required' | 'registered' | 'rejected';

interface ProjectDesignDocument {
  id: UUID;                        // 'PDD-xxxx'
  project_id: UUID;
  methodology_id: UUID;
  methodology_snapshot: string;    // freeze code+version at submit
  state: PddState;
  section_data: Record<string, unknown>;   // answers keyed by section.field
  evidence_ids: UUID[];
  assigned_validator_name: string;
  submitted_at: string | null;
  validated_at: string | null;     // = registered timestamp
  content_hash: string | null;     // freeze at register (hash-chain link)
  rejection_reason?: string;
}
```

### 4.3 Project lifecycle (the dMRV lock)
```ts
type ProjectLifecycle =
  | 'unregistered'      // no methodology chosen yet
  | 'pdd_draft'         // filling PDD
  | 'under_validation'  // submitted, awaiting VVB
  | 'registered'        // ✅ dMRV unlocked
  | 'rejected';
```
Add `lifecycle_stage: ProjectLifecycle` to `Project`.

**Rule:** every dMRV surface (Upload, Calculations, Evidence tab, Verifications, Guardian) requires `project.lifecycle_stage === 'registered'`; otherwise it renders a "not registered yet" EmptyState linking to the registration wizard.

### 4.4 New audit actions (chained into existing hash-chain)
`METHODOLOGY_SELECTED`, `PDD_SUBMITTED`, `VALIDATION_STARTED`, `PDD_REVISION_REQUESTED`, `PROJECT_REGISTERED`, `PDD_REJECTED`. New `EntityType`: `'methodology' | 'pdd'`.

---

## 5. Seed methodology — T-VER Solar (complete data loop)

One seeded methodology (`T-VER-S-0X`, solar rooftop grid-connected), with a full PDD schema. Sections A–E:

| Section | Example fields | Type / source |
|---|---|---|
| **A. Project description** | project name, location, capacity (kWp), technology, commissioning date | some `computed` from `Project` |
| **B. Methodology & baseline** | grid emission factor, baseline scenario (enum), baseline emissions | grid factor `computed` from `EmissionFactors` |
| **C. Additionality** | barrier analysis (enum + textarea), investment test, common practice | Project Proponent input |
| **D. GHG emission reduction (ex-ante)** | estimated annual reduction (tCO₂e), calc formula | `computed`: capacity × grid factor × performance ratio via `lib/calc.ts` |
| **E. Monitoring plan** | monitored params (kWh), method, frequency, QA/QC | ties to Monitoring/CSV + `monitoring_params` |

**Required evidence** for this methodology (audit must see before register): `commissioning_report`, `site_photo`, `supporting_evidence`. Reuses existing `EvidenceCategory`.

**Full loop (end-to-end):**
```
Standard Registry (TGO) defines the methodology/policy once
  → schema (PDD) + required evidence + baseline/ER formulas + monitoring params
Project Proponent fills PDD (auto-generated form) + attaches evidence  [requestVcDocumentBlock]
  A String/Date · B Enum + Auto-Calc(EGAT factor) · C Enum/Bool/Text
  D Auto-Calc(capacity × factor × PR, lib/calc) · E monitoring params
  → submit
VVB validates section-by-section vs methodology rules, comments        [documentValidatorBlock]
  → approve (Validation Report)
Standard Registry → REGISTERED (lifecycle_stage='registered', freeze content_hash)
  → dMRV loop unlocks: Monitoring → Verification → Guardian anchor      [mintDocumentBlock]
```

---

## 6. UI / navigation

New Sidebar group **REGISTRATION** above the existing MRV group:
```
REGISTRATION
  • Methodologies      /methodologies         master data
  • Register Project   /registration          wizard + my drafts
  • Validation Queue   /validation            role-gated: verifier (VVB) + admin
MRV (existing — gated until project registered)
  • Projects / Upload / Calculations / Emission Factors
VERIFICATION (existing)
  • Verifications / Guardian / Audit Log
```

Five new pages:
1. **`Methodologies`** (`/methodologies`) — list + detail, mirrors `EmissionFactors` (read-first). Shows methodology, version, sectoral scope, section count, required evidence.
2. **`Registration` wizard** (`/registration`, `/registration/:pddId`) — Step 1 **select methodology** → Step 2 **select/create project** → Steps 3..n **fill PDD sections** (form auto-generated from schema, computed fields shown live) → **attach evidence** → **review & submit**. Progress bar, save-draft.
3. **`PddDocument`** (`/registration/:pddId/document`) — full PDD rendered as a printable document (sections A–E); shared by proponent and audit; `print`/export.
4. **`ValidationQueue`** (`/validation`) — VVB work queue, mirrors `Verifications` (filter by state, SLA, assignment).
5. **`ValidationDetail`** (`/validation/:pddId`) — audit reads PDD section-by-section (left: document, right: comments/checklist); actions **Approve → Register** / **Request Revision** / **Reject**. Reuses comment thread + `StatusBadge`.

**dMRV lock:** a `<RegistrationGate projectId>` wrapper around dMRV surfaces; if `lifecycle_stage !== 'registered'` it renders an EmptyState + link to the wizard instead of the content (minimal edits to existing pages).

**Role gating:** Validation Queue/Detail visible to `verifier` (VVB) + `admin`; wizard to `project_owner` / `esg_manager`. Uses the existing TopBar role switcher.

---

## 7. Store / API / lib

**Types** (`types/index.ts`): add all §4 types; add `lifecycle_stage` to `Project`; add 6 audit actions + 2 entity types.

**Seed** (`data/seed.ts`):
- 1 T-VER solar methodology with full PDD schema + required evidence + monitoring params.
- Existing 3 projects get `lifecycle_stage`: Pune & Bangkok = `registered` (so existing dMRV seed still works), Hanoi = `pdd_draft` (demonstrates registration flow).
- 2–3 seeded PDDs across states (`registered`, `under_validation`, `revision_required`) so every new page has data on load (mirrors `seedVerifications`).
- New audit entries chained into the existing hash-chain.

**Store** (`store/index.ts`) — actions (each calls `audit_write` automatically):
`selectMethodology`, `savePddDraft`, `submitPdd`, `startValidation`, `requestPddRevision`, `registerProject` (sets `lifecycle_stage='registered'` + freezes `content_hash`), `rejectPdd`. Selectors: `pddByProject`, `validationQueue`.

**API facade** (`lib/api.ts`) — async stubs mirroring REST so a real Guardian backend can drop in without touching UI: `GET /methodologies`, `POST /pdd`, `POST /pdd/:id/submit`, `POST /pdd/:id/validate`, `POST /pdd/:id/revision`, `POST /pdd/:id/register`, `POST /pdd/:id/reject`.

**New lib** (`lib/pdd.ts`, pure + tested): validate `section_data` against a `Methodology` schema (required + conditional `showIf` visibility), resolve `computed` fields (from Project / EmissionFactors / `lib/calc.ts`), canonical-serialize + hash for `content_hash` (via `lib/hash.ts`).

---

## 8. Testing (Vitest, TDD)

- `lib/pdd.test.ts` — schema validation (required + conditional visibility), computed-field resolution, stable `content_hash`.
- `store/registration.test.ts` — state machine `submit → validate → register`, lifecycle lock/unlock correctness, `audit_write` on every transition (chain stays valid).
- `pages/registration.ui.test.tsx` — wizard enforces methodology-before-project; `RegistrationGate` blocks a dMRV surface while `unregistered` and allows it once `registered`.

---

## 9. Out of scope (YAGNI)

- Re-registration / multiple PDD versions per project.
- Full methodology editor (methodologies are seeded + read-first; `admin` add can come later).
- Multiple methodologies (schema supports many; seed ships one).
- Real Guardian REST / `@hashgraph/sdk` wiring (the `lib/api.ts` + `lib/guardian.ts` seams stay simulated).
