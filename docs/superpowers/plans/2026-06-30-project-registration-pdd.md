# Project Registration & PDD (Guardian-shaped) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a methodology-first project **Registration** stage (Gate 1) that produces a **PDD document** an auditor (VVB) must validate before the existing dMRV loop unlocks.

**Architecture:** New domain (`Methodology`, `ProjectDesignDocument`, `Project.lifecycle_stage`) driven by a data-defined PDD schema modeled on Hedera Guardian (Policy = Schema + role workflow). New store actions each call the existing `audit_write` hash-chain. Five new pages + a `RegistrationGate` wrapper lock dMRV until `registered`. Reuses `lib/calc`, `lib/hash`, `lib/api` facade, comment thread, `StatusBadge`, `EmptyState`.

**Tech Stack:** Vite 5 · React 18 · TypeScript 5 (strict) · Zustand 4 (persist) · React Router 6 · Tailwind 3 · Vitest 1 · Lucide.

**Spec:** `docs/superpowers/specs/2026-06-30-project-registration-pdd-design.md`

**Working dir for all commands:** `carbon-ready/`

---

## File structure

**Create:**
- `carbon-ready/src/lib/pdd.ts` — pure PDD logic: conditional visibility, validation, computed-field resolution, content hash.
- `carbon-ready/src/lib/pdd.test.ts` — unit tests for the above.
- `carbon-ready/src/data/methodology-tver-solar.ts` — the seeded T-VER solar methodology (schema + evidence + monitoring params).
- `carbon-ready/src/store/registration.test.ts` — state-machine + audit tests for new store actions.
- `carbon-ready/src/components/RegistrationGate.tsx` — locks a dMRV surface until the project is `registered`.
- `carbon-ready/src/pages/Methodologies.tsx` — methodology master-data list/detail.
- `carbon-ready/src/pages/Registration.tsx` — registration wizard (methodology → project → PDD sections → evidence → submit).
- `carbon-ready/src/pages/PddDocument.tsx` — full PDD rendered as a printable document.
- `carbon-ready/src/pages/ValidationQueue.tsx` — VVB work queue.
- `carbon-ready/src/pages/ValidationDetail.tsx` — VVB reviews a PDD, approve→register / revise / reject.
- `carbon-ready/src/pages/registration.ui.test.tsx` — wizard + gate UI tests.

**Modify:**
- `carbon-ready/src/types/index.ts` — new types, `Project.lifecycle_stage`, new audit actions + entity types, `VerificationComment.section_key`.
- `carbon-ready/src/data/seed.ts` — export methodology, add `lifecycle_stage` to projects, add seed PDDs + one new project, chain new audit entries.
- `carbon-ready/src/store/index.ts` — new state slices, actions, selectors, reset.
- `carbon-ready/src/lib/api.ts` — async facade methods for registration.
- `carbon-ready/src/components/Sidebar.tsx` — new "Registration" nav group.
- `carbon-ready/src/App.tsx` — new routes.
- `carbon-ready/src/pages/Upload.tsx` — wrap working area in `RegistrationGate` (representative dMRV lock).
- `carbon-ready/src/pages/Calculations.tsx` — wrap working area in `RegistrationGate`.

---

## Conventions (read once)

- The store persist key is `carbon-ready-store-v3`. **This plan bumps it to `-v4`** (Task 6) so new seed loads. To reset during dev: `localStorage.removeItem('carbon-ready-store-v4'); location.reload();`
- `uid(prefix)` and `CALLER_IP` already exist in `store/index.ts`.
- Every store mutation that changes domain state calls `get().audit_write(action, entity_type, entity_id, payload, extra)`.
- Run a single test file: `npx vitest run src/path/to/file.test.ts`. Type-check: `npx tsc -b`.

---

## Task 1: Domain types

**Files:**
- Modify: `carbon-ready/src/types/index.ts`

- [ ] **Step 1: Add lifecycle + audit action + entity types**

At the top of `types/index.ts`, extend the `AuditAction` union (add the 6 new members before the closing `;`) and the `EntityType` union:

```ts
export type AuditAction =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'CSV_UPLOADED'
  | 'CALCULATION_EXECUTED'
  | 'EMISSION_FACTOR_ADDED'
  | 'EVIDENCE_UPLOADED'
  | 'EVIDENCE_REPLACED'
  | 'EVIDENCE_ARCHIVED'
  | 'VERIFICATION_SUBMITTED'
  | 'REVIEW_STARTED'
  | 'COMMENT_ADDED'
  | 'REVISION_REQUESTED'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED'
  | 'VERIFICATION_ANCHORED'
  // Registration (Gate 1 — PDD validation)
  | 'METHODOLOGY_SELECTED'
  | 'PDD_SUBMITTED'
  | 'VALIDATION_STARTED'
  | 'PDD_REVISION_REQUESTED'
  | 'PROJECT_REGISTERED'
  | 'PDD_REJECTED';

export type EntityType =
  | 'project' | 'monitoring' | 'factor' | 'calculation'
  | 'evidence' | 'verification' | 'methodology' | 'pdd';
```

- [ ] **Step 2: Add `lifecycle_stage` to `Project`**

In the `Project` interface add the field (after `status`):

```ts
export type ProjectLifecycle =
  | 'unregistered'      // no methodology chosen yet
  | 'pdd_draft'         // filling PDD
  | 'under_validation'  // submitted, awaiting VVB
  | 'registered'        // dMRV unlocked
  | 'rejected';

export interface Project {
  id: UUID;
  organization_id: UUID;
  name: string;
  location: string;
  capacity_kwp: number;
  commission_date: string;
  status: ProjectStatus;
  lifecycle_stage: ProjectLifecycle;   // registration gate
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 3: Add Methodology + PDD types**

Append a new section at the end of `types/index.ts`:

```ts
// ============================================================
// Registration — Methodology (Guardian Policy) & PDD
// ============================================================
export type PddFieldType =
  | 'text' | 'textarea' | 'number' | 'select' | 'date'
  | 'boolean' | 'url' | 'email' | 'image' | 'computed';

export type PddComputedSource =
  | 'capacity_kwp' | 'project_location' | 'commission_date'
  | 'grid_factor' | 'er_estimate';

export interface PddFieldSchema {
  key: string;                 // unique across the methodology
  label: string;
  type: PddFieldType;
  unit?: string;
  required: boolean;
  options?: string[];          // for 'select'
  help?: string;
  showIf?: { field: string; equals: string };   // conditional visibility
  source?: PddComputedSource;  // for 'computed'
}

export interface PddSectionSchema {
  key: string;
  title: string;
  help?: string;
  fields: PddFieldSchema[];
}

export interface MonitoringParam {
  key: string;
  label: string;
  unit: string;
  method: string;
  frequency: string;
}

export interface Methodology {
  id: UUID;
  code: string;                // 'T-VER-S-01'
  name: string;
  standard: 'T-VER';
  version: string;
  sectoral_scope: string;
  status: 'active' | 'deprecated';
  pdd_sections: PddSectionSchema[];
  required_evidence: EvidenceCategory[];
  monitoring_params: MonitoringParam[];
}

export type PddState =
  | 'draft' | 'submitted' | 'under_validation'
  | 'revision_required' | 'registered' | 'rejected';

export interface ProjectDesignDocument {
  id: UUID;                    // 'PDD-xxxx'
  project_id: UUID;
  methodology_id: UUID;
  methodology_snapshot: string;   // code + version, frozen at submit
  state: PddState;
  section_data: Record<string, unknown>;   // keyed by field.key
  evidence_ids: UUID[];
  assigned_validator_name: string;
  submitted_at: string | null;
  validated_at: string | null;    // = registered timestamp
  content_hash: string | null;    // frozen at register
  rejection_reason?: string;
}
```

- [ ] **Step 4: Add `section_key` to `VerificationComment`**

In the existing `VerificationComment` interface, add one optional field (after `evidence_name?`):

```ts
  section_key?: string;        // PDD section a comment is attached to (registration)
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: FAIL — errors about missing `lifecycle_stage` on projects in `seed.ts`, `store/index.ts`, and `lib/api.ts` (createProject). That is expected; Tasks 3–5 fix them. (No type errors should originate inside `types/index.ts` itself.)

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add Methodology, PDD, project lifecycle for registration"
```

---

## Task 2: PDD logic library (`lib/pdd.ts`) — TDD

Pure functions: conditional visibility, validation, computed-field resolution, content hash. No React, no store.

**Files:**
- Create: `carbon-ready/src/lib/pdd.ts`
- Test: `carbon-ready/src/lib/pdd.test.ts`

- [ ] **Step 1: Write the failing test**

Create `carbon-ready/src/lib/pdd.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isFieldVisible, validatePdd, resolveComputed, pddContentHash } from './pdd';
import type { Methodology, Project, EmissionFactor } from '../types';

const METH: Methodology = {
  id: 'meth-1', code: 'T-VER-S-01', name: 'Solar', standard: 'T-VER',
  version: 'v1.0', sectoral_scope: 'Energy', status: 'active',
  required_evidence: ['commissioning_report'], monitoring_params: [],
  pdd_sections: [
    { key: 'a', title: 'A', fields: [
      { key: 'technology', label: 'Technology', type: 'select', options: ['PV'], required: true },
      { key: 'capacity_kwp', label: 'Capacity', type: 'computed', source: 'capacity_kwp', required: false, unit: 'kWp' },
    ] },
    { key: 'c', title: 'C', fields: [
      { key: 'barrier_type', label: 'Barrier', type: 'select', options: ['Investment', 'Technological'], required: true },
      { key: 'investment_metric', label: 'Metric', type: 'select', options: ['IRR'], required: true,
        showIf: { field: 'barrier_type', equals: 'Investment' } },
    ] },
  ],
};

const PROJECT: Project = {
  id: 'prj-1', organization_id: 'org-1', name: 'P', location: 'Bangkok, Thailand',
  capacity_kwp: 820, commission_date: '2024-11-01', status: 'active',
  lifecycle_stage: 'pdd_draft', created_at: '', updated_at: '',
};
const FACTORS: EmissionFactor[] = [
  { id: 'ef-th', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.51,
    effective_date: '2024-01-01', version: 1, is_current: true, created_at: '' },
];

describe('isFieldVisible', () => {
  it('shows unconditional fields', () => {
    expect(isFieldVisible(METH.pdd_sections[0].fields[0], {})).toBe(true);
  });
  it('hides a showIf field until its driver matches', () => {
    const metric = METH.pdd_sections[1].fields[1];
    expect(isFieldVisible(metric, { barrier_type: 'Technological' })).toBe(false);
    expect(isFieldVisible(metric, { barrier_type: 'Investment' })).toBe(true);
  });
});

describe('validatePdd', () => {
  it('reports required fields that are missing', () => {
    const res = validatePdd(METH, {});
    expect(res.ok).toBe(false);
    expect(res.missing.map((m) => m.field)).toContain('technology');
    expect(res.missing.map((m) => m.field)).toContain('barrier_type');
  });
  it('ignores hidden conditional fields but requires them once visible', () => {
    const base = { technology: 'PV', barrier_type: 'Technological' };
    expect(validatePdd(METH, base).ok).toBe(true);
    const inv = { technology: 'PV', barrier_type: 'Investment' };
    expect(validatePdd(METH, inv).ok).toBe(false);
    expect(validatePdd(METH, { ...inv, investment_metric: 'IRR' }).ok).toBe(true);
  });
  it('never requires computed fields', () => {
    const res = validatePdd(METH, { technology: 'PV', barrier_type: 'Technological' });
    expect(res.missing.map((m) => m.field)).not.toContain('capacity_kwp');
  });
});

describe('resolveComputed', () => {
  const ctx = { project: PROJECT, factors: FACTORS, sectionData: { performance_ratio: 0.8 } };
  it('returns capacity from the project', () => {
    expect(resolveComputed('capacity_kwp', ctx)).toBe(820);
  });
  it('returns the current grid factor for the project country', () => {
    expect(resolveComputed('grid_factor', ctx)).toBe(0.51);
  });
  it('estimates annual reduction in tCO2e (> 0)', () => {
    const er = resolveComputed('er_estimate', ctx) as number;
    expect(er).toBeGreaterThan(0);
  });
});

describe('pddContentHash', () => {
  it('is stable for equal input and changes when data changes', () => {
    const h1 = pddContentHash({ methodology_snapshot: 'T-VER-S-01 v1.0', section_data: { a: 1 }, evidence_ids: ['e1'] });
    const h2 = pddContentHash({ methodology_snapshot: 'T-VER-S-01 v1.0', section_data: { a: 1 }, evidence_ids: ['e1'] });
    const h3 = pddContentHash({ methodology_snapshot: 'T-VER-S-01 v1.0', section_data: { a: 2 }, evidence_ids: ['e1'] });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/pdd.test.ts`
Expected: FAIL — "Failed to resolve import './pdd'".

- [ ] **Step 3: Write the implementation**

Create `carbon-ready/src/lib/pdd.ts`:

```ts
import type {
  Methodology, PddFieldSchema, PddComputedSource,
  Project, EmissionFactor,
} from '../types';
import { canonical, shortHash } from './hash';
import { locationToCountryCode } from './geo';

const SUN_HOURS_PER_DAY = 4.0;      // matches seed generation model
const DEFAULT_PERFORMANCE_RATIO = 0.8;

export interface ComputeContext {
  project: Project;
  factors: EmissionFactor[];
  sectionData: Record<string, unknown>;
}

/** A field is visible when it has no showIf, or its driver field equals the expected value. */
export function isFieldVisible(field: PddFieldSchema, data: Record<string, unknown>): boolean {
  if (!field.showIf) return true;
  return data[field.showIf.field] === field.showIf.equals;
}

export interface PddValidationResult {
  ok: boolean;
  missing: Array<{ section: string; field: string; label: string }>;
}

/** Required, visible, non-computed fields must have a non-empty value. */
export function validatePdd(m: Methodology, data: Record<string, unknown>): PddValidationResult {
  const missing: PddValidationResult['missing'] = [];
  for (const section of m.pdd_sections) {
    for (const field of section.fields) {
      if (!field.required || field.type === 'computed') continue;
      if (!isFieldVisible(field, data)) continue;
      const v = data[field.key];
      const empty = v === undefined || v === null || v === '';
      if (empty) missing.push({ section: section.key, field: field.key, label: field.label });
    }
  }
  return { ok: missing.length === 0, missing };
}

/** Current grid emission factor for the project's country, or null. */
function gridFactor(ctx: ComputeContext): number | null {
  const country = locationToCountryCode(ctx.project.location.split(',').pop()?.trim() ?? '');
  const f = ctx.factors.find((x) => x.country === country && x.is_current);
  return f ? f.factor_kgco2e_per_kwh : null;
}

/** Resolve a computed field's value from project + factors + current answers. */
export function resolveComputed(source: PddComputedSource, ctx: ComputeContext): number | string | null {
  switch (source) {
    case 'capacity_kwp': return ctx.project.capacity_kwp;
    case 'project_location': return ctx.project.location;
    case 'commission_date': return ctx.project.commission_date;
    case 'grid_factor': return gridFactor(ctx);
    case 'er_estimate': {
      const gf = gridFactor(ctx);
      if (gf === null) return null;
      const pr = Number(ctx.sectionData.performance_ratio ?? DEFAULT_PERFORMANCE_RATIO);
      const annualKwh = ctx.project.capacity_kwp * SUN_HOURS_PER_DAY * 365;
      const tco2e = (annualKwh * gf * pr) / 1000;
      return Math.round(tco2e * 1000) / 1000;
    }
    default: return null;
  }
}

/** Deterministic content hash of the frozen PDD payload (for register + audit chain). */
export function pddContentHash(input: {
  methodology_snapshot: string;
  section_data: Record<string, unknown>;
  evidence_ids: string[];
}): string {
  return shortHash(canonical({
    methodology_snapshot: input.methodology_snapshot,
    section_data: input.section_data,
    evidence_ids: [...input.evidence_ids].sort(),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/pdd.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdd.ts src/lib/pdd.test.ts
git commit -m "feat(pdd): pure validation, computed-field, and content-hash logic"
```

---

## Task 3: Seed methodology + PDDs + project lifecycle

**Files:**
- Create: `carbon-ready/src/data/methodology-tver-solar.ts`
- Modify: `carbon-ready/src/data/seed.ts`

- [ ] **Step 1: Create the seeded methodology**

Create `carbon-ready/src/data/methodology-tver-solar.ts`:

```ts
import type { Methodology } from '../types';

// T-VER solar rooftop methodology, modeled as a Guardian Policy schema.
// One methodology drives the whole PDD form + required evidence + monitoring params.
export const TVER_SOLAR_METHODOLOGY: Methodology = {
  id: 'meth-tver-solar',
  code: 'T-VER-S-01',
  name: 'การผลิตพลังงานไฟฟ้าจากพลังงานแสงอาทิตย์ (Grid-connected Solar PV)',
  standard: 'T-VER',
  version: 'v3.0',
  sectoral_scope: 'Energy industries (renewable/non-renewable sources)',
  status: 'active',
  required_evidence: ['commissioning_report', 'site_photo', 'supporting_evidence'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity supplied to the grid', unit: 'kWh', method: 'Revenue-grade bi-directional meter', frequency: 'Monthly' },
    { key: 'EF_grid', label: 'Grid emission factor', unit: 'kgCO₂e/kWh', method: 'Official EGAT/TGO published factor', frequency: 'Annually' },
  ],
  pdd_sections: [
    {
      key: 'project_info',
      title: 'A. Project description / ข้อมูลโครงการ',
      help: 'Core project identity. Some values are pulled from the registered project record.',
      fields: [
        { key: 'project_location', label: 'Location', type: 'computed', source: 'project_location', required: false },
        { key: 'capacity_kwp', label: 'Installed capacity', type: 'computed', source: 'capacity_kwp', required: false, unit: 'kWp' },
        { key: 'commission_date', label: 'Commissioning date', type: 'computed', source: 'commission_date', required: false },
        { key: 'technology', label: 'Technology', type: 'select', options: ['Solar PV rooftop', 'Solar PV ground-mounted'], required: true },
        { key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true },
      ],
    },
    {
      key: 'baseline',
      title: 'B. Baseline & methodology / เส้นฐาน',
      fields: [
        { key: 'grid_factor', label: 'Grid emission factor (current)', type: 'computed', source: 'grid_factor', required: false, unit: 'kgCO₂e/kWh' },
        { key: 'baseline_scenario', label: 'Baseline scenario', type: 'select', options: ['Grid electricity displaced by solar generation'], required: true },
      ],
    },
    {
      key: 'additionality',
      title: 'C. Additionality / ความเพิ่มเติม',
      fields: [
        { key: 'barrier_type', label: 'Primary barrier', type: 'select', options: ['Investment', 'Technological', 'Institutional'], required: true },
        { key: 'investment_metric', label: 'Investment metric used', type: 'select', options: ['IRR', 'NPV', 'LCOE'], required: true, showIf: { field: 'barrier_type', equals: 'Investment' } },
        { key: 'barrier_explanation', label: 'Barrier analysis', type: 'textarea', required: true, help: 'Explain why the project is not the baseline / business-as-usual.' },
        { key: 'common_practice', label: 'Not common practice in the region', type: 'boolean', required: true },
      ],
    },
    {
      key: 'ghg_reduction',
      title: 'D. GHG emission reduction (ex-ante) / การลดก๊าซเรือนกระจก',
      help: 'Ex-ante estimate. The annual reduction is auto-calculated from capacity × grid factor × performance ratio.',
      fields: [
        { key: 'performance_ratio', label: 'Performance ratio', type: 'number', required: true, help: 'Typical rooftop solar PR ≈ 0.75–0.85.' },
        { key: 'er_estimate', label: 'Estimated annual reduction', type: 'computed', source: 'er_estimate', required: false, unit: 'tCO₂e/yr' },
      ],
    },
    {
      key: 'monitoring_plan',
      title: 'E. Monitoring plan / แผนการติดตาม',
      fields: [
        { key: 'monitored_parameter', label: 'Monitored parameter', type: 'text', required: true, help: 'e.g. EG_PJ — net electricity to grid.' },
        { key: 'measurement_method', label: 'Measurement method', type: 'text', required: true },
        { key: 'monitoring_frequency', label: 'Frequency', type: 'select', options: ['Continuous', 'Monthly', 'Quarterly'], required: true },
        { key: 'qaqc_procedure', label: 'QA/QC procedure', type: 'textarea', required: true },
      ],
    },
  ],
};
```

- [ ] **Step 2: Add `lifecycle_stage` to seed projects + one new project**

In `carbon-ready/src/data/seed.ts`, replace the `seedProjects` array with (adds `lifecycle_stage` to each + a 4th project for the revision demo):

```ts
export const seedProjects: Project[] = [
  { id: 'prj-0001', organization_id: seedOrg.id, name: 'Pune Rooftop Phase 1',   location: 'Pune, India',      capacity_kwp: 250, commission_date: '2025-03-15', status: 'active', lifecycle_stage: 'registered',       created_at: '2025-03-15T00:00:00Z', updated_at: '2025-03-15T00:00:00Z' },
  { id: 'prj-0002', organization_id: seedOrg.id, name: 'Bangkok Industrial Park', location: 'Bangkok, Thailand', capacity_kwp: 820, commission_date: '2024-11-01', status: 'active', lifecycle_stage: 'registered',       created_at: '2024-11-01T00:00:00Z', updated_at: '2024-11-01T00:00:00Z' },
  { id: 'prj-0003', organization_id: seedOrg.id, name: 'Hanoi Warehouse Cluster', location: 'Hanoi, Vietnam',    capacity_kwp: 510, commission_date: '2026-02-10', status: 'draft',  lifecycle_stage: 'under_validation', created_at: '2026-02-10T00:00:00Z', updated_at: '2026-02-10T00:00:00Z' },
  { id: 'prj-0004', organization_id: seedOrg.id, name: 'Chiang Mai Community Solar', location: 'Chiang Mai, Thailand', capacity_kwp: 300, commission_date: '2026-05-01', status: 'draft', lifecycle_stage: 'pdd_draft', created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z' },
];
```

- [ ] **Step 3: Import the methodology and add seed PDDs**

In `seed.ts`, add to the imports near the top:

```ts
import type {
  Organization, Project, MonitoringRecord, EmissionFactor, User, AuditLog,
  EvidenceFile, VerificationRequest, VerificationComment,
  AuditAction, EntityType, UserRole, VerifiableCredential,
  Methodology, ProjectDesignDocument,
} from '../types';
import { TVER_SOLAR_METHODOLOGY } from './methodology-tver-solar';
```

Then add, after the `seedProjects` block:

```ts
export const seedMethodologies: Methodology[] = [TVER_SOLAR_METHODOLOGY];

const VALIDATOR = 'Daniel Okoye';

// A fully-answered PDD payload reused by the registered seed PDDs.
const REGISTERED_SECTION_DATA = {
  technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
  baseline_scenario: 'Grid electricity displaced by solar generation',
  barrier_type: 'Investment', investment_metric: 'IRR',
  barrier_explanation: 'Project IRR without carbon revenue is below the developer hurdle rate.',
  common_practice: true, performance_ratio: 0.8,
  monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter',
  monitoring_frequency: 'Monthly', qaqc_procedure: 'Monthly meter reads cross-checked against utility bill.',
};

export const seedPdds: ProjectDesignDocument[] = [
  {
    id: 'PDD-2000', project_id: 'prj-0001', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: 'T-VER-S-01 v3.0', state: 'registered',
    section_data: REGISTERED_SECTION_DATA, evidence_ids: ['ev-0003', 'ev-0004'],
    assigned_validator_name: VALIDATOR, submitted_at: '2025-03-16T00:00:00Z',
    validated_at: '2025-03-20T00:00:00Z', content_hash: shortHash('PDD-2000-registered'),
  },
  {
    id: 'PDD-2001', project_id: 'prj-0002', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: 'T-VER-S-01 v3.0', state: 'registered',
    section_data: REGISTERED_SECTION_DATA, evidence_ids: ['ev-0008'],
    assigned_validator_name: VALIDATOR, submitted_at: '2024-11-03T00:00:00Z',
    validated_at: '2024-11-10T00:00:00Z', content_hash: shortHash('PDD-2001-registered'),
  },
  {
    id: 'PDD-2002', project_id: 'prj-0003', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: 'T-VER-S-01 v3.0', state: 'submitted',
    section_data: REGISTERED_SECTION_DATA, evidence_ids: [],
    assigned_validator_name: VALIDATOR, submitted_at: '2026-06-20T09:00:00Z',
    validated_at: null, content_hash: null,
  },
  {
    id: 'PDD-2003', project_id: 'prj-0004', methodology_id: TVER_SOLAR_METHODOLOGY.id,
    methodology_snapshot: 'T-VER-S-01 v3.0', state: 'revision_required',
    section_data: { technology: 'Solar PV rooftop', grid_connection: 'Grid-connected', performance_ratio: 0.8 },
    evidence_ids: [], assigned_validator_name: VALIDATOR,
    submitted_at: '2026-06-10T09:00:00Z', validated_at: null, content_hash: null,
    rejection_reason: 'Additionality section incomplete; attach commissioning report.',
  },
];
```

- [ ] **Step 4: Chain new audit entries**

In `seed.ts`, inside the `buildChain([...])` array passed to `seedAudit`, add these entries at the end of the array (before the closing `])`):

```ts
  { id: 'aud-0020', user_role: 'esg_manager', action: 'PROJECT_REGISTERED', entity_type: 'pdd', entity_id: 'PDD-2001', payload: { methodology: 'T-VER-S-01 v3.0' }, previous_value: { state: 'under_validation' }, new_value: { state: 'registered', content_hash: shortHash('PDD-2001-registered') }, created_at: '2024-11-10T00:00:00Z' },
  { id: 'aud-0021', user_role: 'project_owner', action: 'PDD_SUBMITTED', entity_type: 'pdd', entity_id: 'PDD-2002', payload: { methodology: 'T-VER-S-01 v3.0' }, previous_value: { state: 'draft' }, new_value: { state: 'submitted' }, ip_address: '124.122.9.55', created_at: '2026-06-20T09:00:00Z' },
  { id: 'aud-0022', user_role: 'verifier', action: 'PDD_REVISION_REQUESTED', entity_type: 'pdd', entity_id: 'PDD-2003', payload: { summary: 'Additionality section incomplete' }, previous_value: { state: 'under_validation' }, new_value: { state: 'revision_required' }, ip_address: '102.89.34.7', created_at: '2026-06-12T10:00:00Z' },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: FAIL — remaining errors only in `store/index.ts` (store does not yet know `methodologies`/`pdds`). `seed.ts` and `types` errors gone. Fixed in Task 4.

- [ ] **Step 6: Commit**

```bash
git add src/data/methodology-tver-solar.ts src/data/seed.ts
git commit -m "feat(seed): T-VER solar methodology, seed PDDs, project lifecycle"
```

---

## Task 4: Store actions + selectors — TDD

**Files:**
- Modify: `carbon-ready/src/store/index.ts`
- Test: `carbon-ready/src/store/registration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `carbon-ready/src/store/registration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from './index';

function reset() { useStore.getState().resetToSeed(); }

describe('registration store', () => {
  beforeEach(reset);

  it('selectMethodology creates a draft PDD and moves project to pdd_draft', () => {
    const s = useStore.getState();
    // prj-0004 already has a draft PDD; use a project with none by first clearing via a fresh select on prj-0003 is registered-path.
    const pdd = s.selectMethodology('prj-0004', 'meth-tver-solar');
    expect(pdd.state).toMatch(/draft|revision_required/);
    expect(useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage).toBe('pdd_draft');
  });

  it('submit → startValidation → register unlocks the project and freezes a hash', () => {
    const s = useStore.getState();
    const pdd = s.pddByProject('prj-0004')!;
    s.savePddDraft(pdd.id, {
      technology: 'Solar PV rooftop', grid_connection: 'Grid-connected',
      baseline_scenario: 'Grid electricity displaced by solar generation',
      barrier_type: 'Technological', barrier_explanation: 'x', common_practice: true,
      performance_ratio: 0.8, monitored_parameter: 'EG_PJ', measurement_method: 'meter',
      monitoring_frequency: 'Monthly', qaqc_procedure: 'checks',
    }, []);
    s.submitPdd(pdd.id);
    expect(useStore.getState().pdds.find((p) => p.id === pdd.id)?.state).toBe('submitted');
    expect(useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage).toBe('under_validation');

    s.startValidation(pdd.id);
    expect(useStore.getState().pdds.find((p) => p.id === pdd.id)?.state).toBe('under_validation');

    s.registerProject(pdd.id);
    const after = useStore.getState();
    const regPdd = after.pdds.find((p) => p.id === pdd.id)!;
    expect(regPdd.state).toBe('registered');
    expect(regPdd.content_hash).toBeTruthy();
    expect(after.projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage).toBe('registered');
  });

  it('registerProject refuses an incomplete PDD', () => {
    const s = useStore.getState();
    const pdd = s.pddByProject('prj-0004')!;   // seed draft is incomplete
    s.submitPdd(pdd.id);
    s.startValidation(pdd.id);
    const before = useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage;
    s.registerProject(pdd.id);
    const after = useStore.getState().projects.find((p) => p.id === 'prj-0004')?.lifecycle_stage;
    expect(after).toBe(before);   // unchanged — not registered
  });

  it('writes an audit entry per transition and keeps the chain valid', () => {
    const s = useStore.getState();
    const before = useStore.getState().audit.length;
    const pdd = s.pddByProject('prj-0004')!;
    s.submitPdd(pdd.id);
    const after = useStore.getState().audit;
    expect(after.length).toBe(before + 1);
    expect(after[0].action).toBe('PDD_SUBMITTED');
    expect(after[0].prev_row_hash).toBe(after[1].row_hash);   // chain intact
  });

  it('validationQueue returns non-registered, non-draft PDDs', () => {
    const q = useStore.getState().validationQueue();
    expect(q.every((p) => p.state !== 'registered')).toBe(true);
    expect(q.some((p) => p.id === 'PDD-2002')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/registration.test.ts`
Expected: FAIL — `selectMethodology`/`pddByProject` are not functions.

- [ ] **Step 3: Add state, imports, and interface members**

In `store/index.ts`, extend the seed import to include the new seeds:

```ts
import {
  seedOrg, seedUser, seedFactors, seedProjects, seedRecords, seedAudit,
  seedEvidence, seedVerifications, seedComments, seedCredentials,
  seedMethodologies, seedPdds,
} from '../data/seed';
```

Add to the type imports from `../types`: `Methodology, ProjectDesignDocument`.

Add to `import { validatePdd, pddContentHash } from '../lib/pdd';` a new import line at the top of the file:

```ts
import { validatePdd, pddContentHash } from '../lib/pdd';
```

In the `AppState` interface add state + actions (after `credentials: VerifiableCredential[];`):

```ts
  methodologies: Methodology[];
  pdds: ProjectDesignDocument[];

  // Registration (Gate 1)
  selectMethodology: (project_id: UUID, methodology_id: UUID) => ProjectDesignDocument;
  savePddDraft: (pdd_id: UUID, section_data: Record<string, unknown>, evidence_ids: UUID[]) => void;
  submitPdd: (pdd_id: UUID) => void;
  startValidation: (pdd_id: UUID) => void;
  requestPddRevision: (pdd_id: UUID, summary: string) => void;
  registerProject: (pdd_id: UUID) => boolean;
  rejectPdd: (pdd_id: UUID, reason: string) => void;
  addPddComment: (pdd_id: UUID, body: string, section_key?: string) => void;
  pddByProject: (project_id: UUID) => ProjectDesignDocument | undefined;
  validationQueue: () => ProjectDesignDocument[];
```

In the store initializer add the seed state (after `credentials: seedCredentials,`):

```ts
      methodologies: seedMethodologies,
      pdds: seedPdds,
```

- [ ] **Step 4: Implement the actions**

In `store/index.ts`, add these action implementations just before `resetToSeed:` (they use existing `uid`, `get`, `set`, `audit_write`):

```ts
      // ---------------- Registration: Gate 1 (PDD validation) ----------------
      pddByProject: (project_id) => get().pdds.find((p) => p.project_id === project_id),

      validationQueue: () =>
        get().pdds.filter((p) => p.state !== 'draft' && p.state !== 'registered' && p.state !== 'rejected'),

      selectMethodology: (project_id, methodology_id) => {
        const existing = get().pdds.find((p) => p.project_id === project_id);
        if (existing) {
          if (existing.methodology_id !== methodology_id) {
            set((s) => ({ pdds: s.pdds.map((p) => (p.id === existing.id ? { ...p, methodology_id } : p)) }));
          }
          return get().pdds.find((p) => p.id === existing.id)!;
        }
        const pdd: ProjectDesignDocument = {
          id: uid('PDD'), project_id, methodology_id,
          methodology_snapshot: '', state: 'draft', section_data: {}, evidence_ids: [],
          assigned_validator_name: 'Daniel Okoye', submitted_at: null, validated_at: null, content_hash: null,
        };
        set((s) => ({
          pdds: [pdd, ...s.pdds],
          projects: s.projects.map((p) => (p.id === project_id ? { ...p, lifecycle_stage: 'pdd_draft' as const } : p)),
        }));
        get().audit_write('METHODOLOGY_SELECTED', 'pdd', pdd.id, { project_id, methodology_id },
          { new_value: { state: 'draft' } });
        return pdd;
      },

      savePddDraft: (pdd_id, section_data, evidence_ids) => {
        set((s) => ({ pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, section_data, evidence_ids } : p)) }));
      },

      submitPdd: (pdd_id) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        if (!pdd) return;
        const m = get().methodologies.find((x) => x.id === pdd.methodology_id);
        const snapshot = m ? `${m.code} ${m.version}` : pdd.methodology_snapshot;
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id
            ? { ...p, state: 'submitted', methodology_snapshot: snapshot, submitted_at: p.submitted_at ?? new Date().toISOString() }
            : p)),
          projects: s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'under_validation' as const } : p)),
        }));
        get().audit_write('PDD_SUBMITTED', 'pdd', pdd_id, { methodology: snapshot },
          { previous_value: { state: pdd.state }, new_value: { state: 'submitted' } });
      },

      startValidation: (pdd_id) => {
        set((s) => ({ pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'under_validation' } : p)) }));
        get().audit_write('VALIDATION_STARTED', 'pdd', pdd_id, {},
          { previous_value: { state: 'submitted' }, new_value: { state: 'under_validation' } });
      },

      requestPddRevision: (pdd_id, summary) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'revision_required', rejection_reason: summary } : p)),
          projects: pdd ? s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'pdd_draft' as const } : p)) : s.projects,
        }));
        get().audit_write('PDD_REVISION_REQUESTED', 'pdd', pdd_id, { summary },
          { previous_value: { state: 'under_validation' }, new_value: { state: 'revision_required', summary } });
      },

      registerProject: (pdd_id) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        if (!pdd) return false;
        const m = get().methodologies.find((x) => x.id === pdd.methodology_id);
        if (!m) return false;
        const check = validatePdd(m, pdd.section_data);
        if (!check.ok) return false;
        const snapshot = pdd.methodology_snapshot || `${m.code} ${m.version}`;
        const content_hash = pddContentHash({ methodology_snapshot: snapshot, section_data: pdd.section_data, evidence_ids: pdd.evidence_ids });
        const validated_at = new Date().toISOString();
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'registered', methodology_snapshot: snapshot, validated_at, content_hash } : p)),
          projects: s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'registered' as const } : p)),
        }));
        get().audit_write('PROJECT_REGISTERED', 'pdd', pdd_id, { methodology: snapshot },
          { previous_value: { state: pdd.state }, new_value: { state: 'registered', content_hash } });
        return true;
      },

      rejectPdd: (pdd_id, reason) => {
        const pdd = get().pdds.find((p) => p.id === pdd_id);
        set((s) => ({
          pdds: s.pdds.map((p) => (p.id === pdd_id ? { ...p, state: 'rejected', rejection_reason: reason } : p)),
          projects: pdd ? s.projects.map((p) => (p.id === pdd.project_id ? { ...p, lifecycle_stage: 'rejected' as const } : p)) : s.projects,
        }));
        get().audit_write('PDD_REJECTED', 'pdd', pdd_id, { reason },
          { previous_value: { state: pdd?.state ?? null }, new_value: { state: 'rejected', reason } });
      },

      addPddComment: (pdd_id, body, section_key) => {
        const u = get().currentUser;
        const c: VerificationComment = {
          id: uid('cmt'), verification_id: pdd_id, evidence_id: null, section_key,
          author_id: u.id, author_name: u.name, author_role: u.role, body, created_at: new Date().toISOString(),
        };
        set((s) => ({ comments: [...s.comments, c] }));
        get().audit_write('COMMENT_ADDED', 'pdd', pdd_id, section_key ? { section: section_key } : {}, { new_value: { body } });
      },
```

- [ ] **Step 4b: Default `lifecycle_stage` on project creation**

New projects must start `unregistered`. In `store/index.ts`, change the `createProject` interface signature (line ~35) to also omit `lifecycle_stage`:

```ts
  createProject: (p: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id' | 'lifecycle_stage'>) => Project;
```

And set the default in its implementation (the `const p: Project = {...}` line):

```ts
        const p: Project = { id: uid('prj'), organization_id: get().organization.id, lifecycle_stage: 'unregistered', created_at: now, updated_at: now, ...input };
```

- [ ] **Step 5: Update `resetToSeed`**

Replace the `resetToSeed` body to include the new slices:

```ts
      resetToSeed: () => set({
        projects: seedProjects, records: seedRecords, factors: seedFactors, calculations: [], audit: seedAudit,
        evidence: seedEvidence, verifications: seedVerifications, comments: seedComments,
        credentials: seedCredentials, guardianConfig: DEFAULT_GUARDIAN_CONFIG,
        methodologies: seedMethodologies, pdds: seedPdds,
      }),
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/store/registration.test.ts`
Expected: PASS (all cases).

- [ ] **Step 7: Full type-check + full test run**

Run: `npx tsc -b && npx vitest run`
Expected: PASS, no type errors. (All prior suites still green.)

- [ ] **Step 8: Commit**

```bash
git add src/store/index.ts src/store/registration.test.ts
git commit -m "feat(store): registration state machine + validation queue + audit"
```

---

## Task 5: API facade

**Files:**
- Modify: `carbon-ready/src/lib/api.ts`

- [ ] **Step 1: Add imports + fix createProject param type**

Extend the type import block in `api.ts` to add: `Methodology, ProjectDesignDocument`.

Also update `api.createProject`'s parameter type to match the store (omit `lifecycle_stage`), so the existing "New Project" form still type-checks:

```ts
  async createProject(input: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id' | 'lifecycle_stage'>): Promise<Project> {
    const project = useStore.getState().createProject(input);
    toast.success('Project created', project.name);
    return tick(project);
  },
```

- [ ] **Step 2: Add facade methods**

Add these methods inside the `api` object (before the closing `};`), following the existing `tick`/`toast` pattern:

```ts
  // ---------------- Registration: Gate 1 ----------------
  async listMethodologies(): Promise<Methodology[]> {
    return tick(useStore.getState().methodologies);
  },
  async getMethodology(id: UUID): Promise<Methodology | undefined> {
    return tick(useStore.getState().methodologies.find((m) => m.id === id));
  },
  async listPdds(): Promise<ProjectDesignDocument[]> {
    return tick(useStore.getState().pdds);
  },
  async getPdd(id: UUID): Promise<ProjectDesignDocument | undefined> {
    return tick(useStore.getState().pdds.find((p) => p.id === id));
  },
  async selectMethodology(project_id: UUID, methodology_id: UUID): Promise<ProjectDesignDocument> {
    return tick(useStore.getState().selectMethodology(project_id, methodology_id));
  },
  async savePddDraft(pdd_id: UUID, section_data: Record<string, unknown>, evidence_ids: UUID[]): Promise<void> {
    useStore.getState().savePddDraft(pdd_id, section_data, evidence_ids);
    return tick(undefined, 60);
  },
  async submitPdd(pdd_id: UUID): Promise<void> {
    useStore.getState().submitPdd(pdd_id);
    toast.success('PDD submitted', 'Sent to the validation queue.');
    return tick(undefined);
  },
  async startValidation(pdd_id: UUID): Promise<void> {
    useStore.getState().startValidation(pdd_id);
    toast.info('Validation started');
    return tick(undefined);
  },
  async requestPddRevision(pdd_id: UUID, summary: string): Promise<void> {
    useStore.getState().requestPddRevision(pdd_id, summary);
    toast.info('Revision requested', 'Returned to the project proponent.');
    return tick(undefined);
  },
  async registerProject(pdd_id: UUID): Promise<boolean> {
    const ok = useStore.getState().registerProject(pdd_id);
    if (ok) toast.success('Project registered', 'dMRV is now unlocked for this project.');
    else toast.error('Cannot register', 'PDD is incomplete — required fields are missing.');
    return tick(ok);
  },
  async rejectPdd(pdd_id: UUID, reason: string): Promise<void> {
    useStore.getState().rejectPdd(pdd_id, reason);
    toast.error('PDD rejected', reason);
    return tick(undefined);
  },
  async addPddComment(pdd_id: UUID, body: string, section_key?: string): Promise<void> {
    useStore.getState().addPddComment(pdd_id, body, section_key);
    return tick(undefined, 60);
  },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api): registration facade methods"
```

---

## Task 6: Navigation, routes, persist-key bump

**Files:**
- Modify: `carbon-ready/src/components/Sidebar.tsx`
- Modify: `carbon-ready/src/App.tsx`
- Modify: `carbon-ready/src/store/index.ts`

- [ ] **Step 1: Add the Registration nav group**

In `Sidebar.tsx`, add icons to the lucide import: `FileText, FilePlus2, ShieldCheck`. Then insert a new group as the **first** entry in the `groups` array (before "Overview"):

```ts
  {
    heading: 'Registration',
    items: [
      { to: '/methodologies', label: 'Methodologies',   icon: FileText },
      { to: '/registration',  label: 'Register Project', icon: FilePlus2 },
      { to: '/validation',    label: 'Validation Queue', icon: ShieldCheck },
    ],
  },
```

- [ ] **Step 2: Add routes**

In `App.tsx`, add imports:

```ts
import { Methodologies } from './pages/Methodologies';
import { Registration } from './pages/Registration';
import { PddDocument } from './pages/PddDocument';
import { ValidationQueue } from './pages/ValidationQueue';
import { ValidationDetail } from './pages/ValidationDetail';
```

Add these routes inside `<Routes>` (after the `/dashboard` route):

```tsx
          <Route path="/methodologies" element={<Methodologies />} />
          <Route path="/methodologies/:id" element={<Methodologies />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/registration/:pddId" element={<Registration />} />
          <Route path="/registration/:pddId/document" element={<PddDocument />} />
          <Route path="/validation" element={<ValidationQueue />} />
          <Route path="/validation/:pddId" element={<ValidationDetail />} />
```

- [ ] **Step 3: Bump the persist key**

In `store/index.ts`, change the persist options at the bottom:

```ts
    { name: 'carbon-ready-store-v4' }
```

> Note: App/Sidebar will not compile until Task 7–12 create the pages. That is expected; the next tasks add them. Do not run the dev server until Task 12.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx src/store/index.ts
git commit -m "feat(nav): registration nav group, routes, persist v4"
```

---

## Task 7: RegistrationGate + dMRV lock — TDD

**Files:**
- Create: `carbon-ready/src/components/RegistrationGate.tsx`
- Test: `carbon-ready/src/pages/registration.ui.test.tsx`
- Modify: `carbon-ready/src/pages/Upload.tsx`, `carbon-ready/src/pages/Calculations.tsx`

- [ ] **Step 1: Write the failing test**

Create `carbon-ready/src/pages/registration.ui.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegistrationGate } from '../components/RegistrationGate';
import { useStore } from '../store';

beforeEach(() => useStore.getState().resetToSeed());

describe('RegistrationGate', () => {
  it('blocks dMRV content for an unregistered project', () => {
    render(
      <MemoryRouter>
        <RegistrationGate projectId="prj-0003">
          <div>SECRET DMRV</div>
        </RegistrationGate>
      </MemoryRouter>,
    );
    expect(screen.queryByText('SECRET DMRV')).toBeNull();
    expect(screen.getByText(/not registered/i)).toBeInTheDocument();
  });

  it('renders dMRV content for a registered project', () => {
    render(
      <MemoryRouter>
        <RegistrationGate projectId="prj-0001">
          <div>SECRET DMRV</div>
        </RegistrationGate>
      </MemoryRouter>,
    );
    expect(screen.getByText('SECRET DMRV')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/registration.ui.test.tsx`
Expected: FAIL — cannot resolve `../components/RegistrationGate`.

- [ ] **Step 3: Implement RegistrationGate**

Create `carbon-ready/src/components/RegistrationGate.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useStore } from '../store';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

/** Renders children only when the project is registered; otherwise blocks dMRV with a link to the wizard. */
export function RegistrationGate({ projectId, children }: { projectId: string; children: ReactNode }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const pdd = useStore((s) => s.pdds.find((p) => p.project_id === projectId));

  if (project && project.lifecycle_stage === 'registered') return <>{children}</>;

  const target = pdd ? `/registration/${pdd.id}` : '/registration';
  return (
    <EmptyState
      title="Project not registered yet"
      hint="This project must be registered (methodology selected, PDD validated by an auditor) before dMRV monitoring can start."
      action={
        <Link to={target}>
          <Button><Lock size={16} /> Go to Registration</Button>
        </Link>
      }
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/registration.ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Apply the gate in Upload**

In `pages/Upload.tsx`: add `import { RegistrationGate } from '../components/RegistrationGate';`. Find where the page renders the upload working area for the selected project (the JSX shown once a `projectId` is chosen). Wrap that block:

```tsx
<RegistrationGate projectId={projectId}>
  {/* existing upload UI for the selected project */}
</RegistrationGate>
```

If `projectId` may be empty, keep the existing "select a project" prompt outside the gate and only wrap the post-selection content.

- [ ] **Step 6: Apply the gate in Calculations**

In `pages/Calculations.tsx`: same import, and wrap the post-project-selection working area in `<RegistrationGate projectId={projectId}>…</RegistrationGate>` identically.

- [ ] **Step 7: Type-check**

Run: `npx tsc -b`
Expected: PASS (pages still compile; note App.tsx already references not-yet-created pages — if `tsc -b` fails only on missing `./pages/Methodologies` etc., that is Task 8–12; you may run `npx vitest run src/pages/registration.ui.test.tsx` to confirm the gate itself is green).

- [ ] **Step 8: Commit**

```bash
git add src/components/RegistrationGate.tsx src/pages/registration.ui.test.tsx src/pages/Upload.tsx src/pages/Calculations.tsx
git commit -m "feat(gate): RegistrationGate locks dMRV until registered"
```

---

## Task 8: Methodologies page

**Files:**
- Create: `carbon-ready/src/pages/Methodologies.tsx`

- [ ] **Step 1: Implement the page**

Create `carbon-ready/src/pages/Methodologies.tsx`:

```tsx
import { useState } from 'react';
import { useStore } from '../store';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { CATEGORY_LABEL } from '../lib/labels';
import type { Methodology } from '../types';

export function Methodologies() {
  const methodologies = useStore((s) => s.methodologies);
  const [selected, setSelected] = useState<Methodology | null>(null);

  return (
    <div>
      <PageHeader title="Methodologies" subtitle="Approved carbon methodologies (Guardian policies) that drive project registration" />
      <Card>
        <Table>
          <THead>
            <TR><TH>Code</TH><TH>Name</TH><TH>Standard</TH><TH>Version</TH><TH>Sections</TH><TH>Status</TH></TR>
          </THead>
          <tbody>
            {methodologies.map((m) => (
              <TR key={m.id} hover>
                <TD className="font-mono text-sm"><button className="text-brand-700 hover:underline" onClick={() => setSelected(m)}>{m.code}</button></TD>
                <TD className="font-medium">{m.name}</TD>
                <TD>{m.standard}</TD>
                <TD>{m.version}</TD>
                <TD>{m.pdd_sections.length}</TD>
                <TD><Badge tone={m.status === 'active' ? 'green' : 'gray'}>{m.status}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.code ?? ''}>
        {selected && (
          <div className="space-y-6 p-1">
            <div>
              <h3 className="text-lg font-semibold text-ink-900">{selected.name}</h3>
              <p className="mt-1 text-sm text-ink-500">{selected.sectoral_scope} · {selected.standard} {selected.version}</p>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">PDD sections</div>
              <ul className="space-y-1 text-sm text-ink-700">
                {selected.pdd_sections.map((s) => (
                  <li key={s.key}>• {s.title} <span className="text-ink-400">({s.fields.length} fields)</span></li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Required evidence</div>
              <div className="flex flex-wrap gap-2">
                {selected.required_evidence.map((c) => (
                  <Badge key={c} tone="blue">{CATEGORY_LABEL[c] ?? c}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Monitoring parameters</div>
              <ul className="space-y-1 text-sm text-ink-700">
                {selected.monitoring_params.map((p) => (
                  <li key={p.key}><span className="font-mono">{p.key}</span> — {p.label} ({p.unit}, {p.frequency})</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
```

(Verified APIs: `Badge` takes `tone` = one of green/amber/red/gray/blue/violet; labels export is `CATEGORY_LABEL` singular; `TR` takes `hover` but not `onClick`, so the code cell uses a `<button>`.)

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: errors only for the still-missing pages (Registration, PddDocument, ValidationQueue, ValidationDetail). No errors inside `Methodologies.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Methodologies.tsx
git commit -m "feat(page): Methodologies master-data list + detail"
```

---

## Task 9: Registration wizard

**Files:**
- Create: `carbon-ready/src/pages/Registration.tsx`

The wizard: Step 0 pick methodology (only when no `:pddId`), Step 1 pick/confirm project, Steps per PDD section, final review + submit. Uses `api`, `lib/pdd` for computed values + validation.

- [ ] **Step 1: Implement the wizard**

Create `carbon-ready/src/pages/Registration.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Textarea } from '../components/Textarea';
import { EmptyState } from '../components/EmptyState';
import { isFieldVisible, validatePdd, resolveComputed } from '../lib/pdd';
import type { PddFieldSchema, PddComputedSource } from '../types';

export function Registration() {
  const { pddId } = useParams();
  const navigate = useNavigate();
  const methodologies = useStore((s) => s.methodologies);
  const projects = useStore((s) => s.projects);
  const pdds = useStore((s) => s.pdds);

  const pdd = pdds.find((p) => p.id === pddId);

  // ---- Entry screen: no pdd yet → choose methodology + project ----
  const [methId, setMethId] = useState(methodologies[0]?.id ?? '');
  const [projId, setProjId] = useState('');
  const candidateProjects = projects.filter((p) => p.lifecycle_stage === 'unregistered' || p.lifecycle_stage === 'pdd_draft' || !pdds.some((x) => x.project_id === p.id));

  async function startRegistration() {
    if (!methId || !projId) return;
    const created = await api.selectMethodology(projId, methId);
    navigate(`/registration/${created.id}`);
  }

  if (!pdd) {
    return (
      <div>
        <PageHeader title="Register a project" subtitle="Step 1 — choose a methodology, then the project it applies to" />
        <Card className="max-w-xl space-y-4 p-6">
          <Select label="Methodology" value={methId} onChange={(e) => setMethId(e.target.value)}>
            {methodologies.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
          </Select>
          <Select label="Project" value={projId} onChange={(e) => setProjId(e.target.value)}>
            <option value="">Select a project…</option>
            {candidateProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Button disabled={!methId || !projId} onClick={startRegistration}>Start PDD →</Button>
        </Card>
      </div>
    );
  }

  return <PddEditor pddId={pdd.id} />;
}

function PddEditor({ pddId }: { pddId: string }) {
  const navigate = useNavigate();
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId))!;
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd.project_id))!;
  const factors = useStore((s) => s.factors);

  const [data, setData] = useState<Record<string, unknown>>(pdd.section_data);
  const [step, setStep] = useState(0);

  const sections = methodology?.pdd_sections ?? [];
  const ctx = useMemo(() => ({ project, factors, sectionData: data }), [project, factors, data]);

  if (!methodology) return <EmptyState title="Methodology not found" hint="This PDD references a methodology that no longer exists." />;

  const readonly = pdd.state === 'submitted' || pdd.state === 'under_validation' || pdd.state === 'registered';
  const isReview = step >= sections.length;

  function setField(key: string, value: unknown) {
    setData((d) => ({ ...d, [key]: value }));
  }
  async function save() { await api.savePddDraft(pddId, data, pdd.evidence_ids); }
  async function next() { await save(); setStep((s) => Math.min(s + 1, sections.length)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  const check = validatePdd(methodology, data);
  async function submit() {
    await save();
    await api.submitPdd(pddId);
    navigate(`/registration/${pddId}/document`);
  }

  return (
    <div>
      <PageHeader
        title={`Register: ${project.name}`}
        subtitle={`${methodology.code} ${methodology.version} · PDD ${pdd.id}`}
      />

      {/* progress */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {sections.map((s, i) => (
          <button key={s.key} onClick={() => setStep(i)}
            className={`rounded-full px-3 py-1 text-xs ${i === step ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
            {s.title.split(' ')[0]}
          </button>
        ))}
        <button onClick={() => setStep(sections.length)}
          className={`rounded-full px-3 py-1 text-xs ${isReview ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>
          Review
        </button>
      </div>

      {!isReview && (
        <Card className="max-w-2xl space-y-5 p-6">
          <div>
            <h3 className="text-lg font-semibold text-ink-900">{sections[step].title}</h3>
            {sections[step].help && <p className="mt-1 text-sm text-ink-500">{sections[step].help}</p>}
          </div>
          {sections[step].fields.filter((f) => isFieldVisible(f, data)).map((f) => (
            <FieldInput key={f.key} field={f} value={data[f.key]} readonly={readonly}
              computed={f.type === 'computed' ? resolveComputed(f.source as PddComputedSource, ctx) : undefined}
              onChange={(v) => setField(f.key, v)} />
          ))}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={back} disabled={step === 0}>← Back</Button>
            <Button onClick={next}>Next →</Button>
          </div>
        </Card>
      )}

      {isReview && (
        <Card className="max-w-2xl space-y-4 p-6">
          <h3 className="text-lg font-semibold text-ink-900">Review & submit</h3>
          {check.ok ? (
            <p className="text-sm text-brand-700">All required fields are complete. You can submit for validation.</p>
          ) : (
            <div className="text-sm text-red-600">
              <p className="font-medium">Missing required fields:</p>
              <ul className="mt-1 list-disc pl-5">
                {check.missing.map((m) => <li key={m.field}>{m.label}</li>)}
              </ul>
            </div>
          )}
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => navigate(`/registration/${pddId}/document`)}>Preview document</Button>
            <Button disabled={!check.ok || readonly} onClick={submit}>Submit for validation</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function FieldInput({ field, value, computed, readonly, onChange }: {
  field: PddFieldSchema; value: unknown; computed?: number | string | null; readonly: boolean; onChange: (v: unknown) => void;
}) {
  const labelText = `${field.label}${field.unit ? ` (${field.unit})` : ''}`;

  // Input/Select/Textarea each render their own <label> via the `label` prop —
  // do NOT wrap them in another <label> (invalid nested labels).
  if (field.type === 'computed') {
    return (
      <div>
        <span className="mb-1 block text-sm font-medium text-ink-700">{labelText}</span>
        <div className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700 ring-1 ring-ink-200">
          {computed === null || computed === undefined ? '—' : String(computed)}
          <span className="ml-2 text-xs text-ink-400">auto-calculated</span>
        </div>
      </div>
    );
  }

  let control;
  if (field.type === 'textarea') {
    control = <Textarea label={labelText} value={String(value ?? '')} disabled={readonly} onChange={(e) => onChange(e.target.value)} />;
  } else if (field.type === 'select') {
    control = (
      <Select label={labelText} value={String(value ?? '')} disabled={readonly} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </Select>
    );
  } else if (field.type === 'boolean') {
    control = (
      <Select label={labelText} value={value === true ? 'yes' : value === false ? 'no' : ''} disabled={readonly}
        onChange={(e) => onChange(e.target.value === 'yes')}>
        <option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option>
      </Select>
    );
  } else {
    control = (
      <Input label={labelText} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={String(value ?? '')} disabled={readonly}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)} />
    );
  }
  return (
    <div>
      {control}
      {field.help && <span className="mt-1 block text-xs text-ink-400">{field.help}</span>}
    </div>
  );
}
```

(Verified APIs: `Button` has `variant` = primary/secondary/ghost/danger; `Input`/`Select`/`Textarea` extend the native element props — they accept `value`/`onChange`/`disabled`/`type` and render their own `<label>` via the `label` prop, so controls are not wrapped in an extra `<label>`.)

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: errors only for the remaining missing pages (PddDocument, ValidationQueue, ValidationDetail). No errors inside `Registration.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Registration.tsx
git commit -m "feat(page): registration wizard (methodology-first PDD editor)"
```

---

## Task 10: PDD document view

**Files:**
- Create: `carbon-ready/src/pages/PddDocument.tsx`

- [ ] **Step 1: Implement the page**

Create `carbon-ready/src/pages/PddDocument.tsx`:

```tsx
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { PddStatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { isFieldVisible, resolveComputed } from '../lib/pdd';
import type { PddComputedSource } from '../types';

export function PddDocument() {
  const { pddId } = useParams();
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));
  const factors = useStore((s) => s.factors);

  if (!pdd || !methodology || !project) return <EmptyState title="PDD not found" hint="This document does not exist." />;
  const ctx = { project, factors, sectionData: pdd.section_data };

  function display(fieldKey: string, source?: PddComputedSource) {
    if (source) { const v = resolveComputed(source, ctx); return v === null || v === undefined ? '—' : String(v); }
    const v = pdd!.section_data[fieldKey];
    if (v === undefined || v === null || v === '') return '—';
    if (v === true) return 'Yes'; if (v === false) return 'No';
    return String(v);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/registration/${pdd.id}`}><Button variant="ghost"><ArrowLeft size={16} /> Back to editor</Button></Link>
        <Button onClick={() => window.print()}><Printer size={16} /> Print / Export</Button>
      </div>

      <Card className="space-y-8 p-8">
        <header className="border-b border-ink-200 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-ink-900">Project Design Document</h1>
            <PddStatusBadge state={pdd.state} />
          </div>
          <p className="mt-1 text-sm text-ink-500">{project.name} · {methodology.code} {methodology.version}</p>
          {pdd.content_hash && <p className="mt-1 font-mono text-xs text-ink-400">hash: {pdd.content_hash}</p>}
        </header>

        {methodology.pdd_sections.map((section) => (
          <section key={section.key}>
            <h2 className="mb-3 text-lg font-semibold text-ink-900">{section.title}</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {section.fields.filter((f) => isFieldVisible(f, pdd.section_data)).map((f) => (
                <div key={f.key}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{f.label}{f.unit ? ` (${f.unit})` : ''}</dt>
                  <dd className="mt-0.5 text-sm text-ink-800">{display(f.key, f.source)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add a `PddStatusBadge` (StatusBadge is typed to `VerificationState` and can't take PDD states)**

Append to `carbon-ready/src/components/StatusBadge.tsx` (it already imports `Badge` and defines the `Tone` type). Add the `PddState` import to the existing type import line, then add:

```tsx
const pddStateTone: Record<PddState, Tone> = {
  draft: 'gray', submitted: 'blue', under_validation: 'violet',
  revision_required: 'amber', registered: 'green', rejected: 'red',
};
const pddStateLabel: Record<PddState, string> = {
  draft: 'Draft', submitted: 'Submitted', under_validation: 'Under Validation',
  revision_required: 'Revision Required', registered: 'Registered', rejected: 'Rejected',
};
export function PddStatusBadge({ state }: { state: PddState }) {
  return <Badge tone={pddStateTone[state]}>{pddStateLabel[state]}</Badge>;
}
```

The existing type import line becomes:

```tsx
import type { EvidenceCategory, EvidenceStatus, FileKind, VerificationState, PddState } from '../types';
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: errors only for ValidationQueue/ValidationDetail. No errors inside `PddDocument.tsx` or `StatusBadge.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PddDocument.tsx src/components/StatusBadge.tsx
git commit -m "feat(page): printable PDD document view + PddStatusBadge"
```

---

## Task 11: Validation queue

**Files:**
- Create: `carbon-ready/src/pages/ValidationQueue.tsx`

- [ ] **Step 1: Implement the page**

Create `carbon-ready/src/pages/ValidationQueue.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { PddStatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { fmtDate } from '../lib/date';

export function ValidationQueue() {
  const navigate = useNavigate();
  const queue = useStore((s) => s.validationQueue());
  const projects = useStore((s) => s.projects);
  const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;

  return (
    <div>
      <PageHeader title="Validation Queue" subtitle="PDDs awaiting validation by the VVB before a project can be registered" />
      <Card>
        {queue.length === 0 ? (
          <EmptyState title="Queue is empty" hint="No PDDs are currently awaiting validation." />
        ) : (
          <Table>
            <THead>
              <TR><TH>PDD</TH><TH>Project</TH><TH>Methodology</TH><TH>State</TH><TH>Submitted</TH><TH>Validator</TH></TR>
            </THead>
            <tbody>
              {queue.map((p) => (
                <TR key={p.id} hover>
                  <TD className="font-mono text-sm"><button className="text-brand-700 hover:underline" onClick={() => navigate(`/validation/${p.id}`)}>{p.id}</button></TD>
                  <TD className="font-medium">{projName(p.project_id)}</TD>
                  <TD>{p.methodology_snapshot || '—'}</TD>
                  <TD><PddStatusBadge state={p.state} /></TD>
                  <TD>{p.submitted_at ? fmtDate(p.submitted_at.slice(0, 10)) : '—'}</TD>
                  <TD>{p.assigned_validator_name}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: errors only for ValidationDetail. No errors inside `ValidationQueue.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ValidationQueue.tsx
git commit -m "feat(page): VVB validation queue"
```

---

## Task 12: Validation detail (approve → register / revise / reject)

**Files:**
- Create: `carbon-ready/src/pages/ValidationDetail.tsx`

- [ ] **Step 1: Implement the page**

Create `carbon-ready/src/pages/ValidationDetail.tsx`:

```tsx
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Textarea } from '../components/Textarea';
import { PddStatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { isFieldVisible, resolveComputed, validatePdd } from '../lib/pdd';
import type { PddComputedSource } from '../types';

export function ValidationDetail() {
  const { pddId } = useParams();
  const navigate = useNavigate();
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));
  const factors = useStore((s) => s.factors);
  const comments = useStore((s) => s.comments.filter((c) => c.verification_id === pddId));
  const [note, setNote] = useState('');

  if (!pdd || !methodology || !project) return <EmptyState title="PDD not found" hint="This validation item does not exist." />;
  const ctx = { project, factors, sectionData: pdd.section_data };
  const check = validatePdd(methodology, pdd.section_data);
  const canAct = pdd.state === 'submitted' || pdd.state === 'under_validation';

  function value(fieldKey: string, source?: PddComputedSource) {
    if (source) { const v = resolveComputed(source, ctx); return v === null || v === undefined ? '—' : String(v); }
    const v = pdd!.section_data[fieldKey];
    if (v === undefined || v === null || v === '') return '—';
    if (v === true) return 'Yes'; if (v === false) return 'No';
    return String(v);
  }

  async function start() { await api.startValidation(pdd!.id); }
  async function approve() { const ok = await api.registerProject(pdd!.id); if (ok) navigate('/validation'); }
  async function revise() { if (!note.trim()) return; await api.requestPddRevision(pdd!.id, note.trim()); navigate('/validation'); }
  async function reject() { if (!note.trim()) return; await api.rejectPdd(pdd!.id, note.trim()); navigate('/validation'); }
  async function comment() { if (!note.trim()) return; await api.addPddComment(pdd!.id, note.trim()); setNote(''); }

  return (
    <div>
      <PageHeader title={`Validate ${pdd.id}`} subtitle={`${project.name} · ${methodology.code} ${methodology.version}`}
        action={<Link to={`/registration/${pdd.id}/document`}><Button variant="ghost"><FileText size={16} /> Full document</Button></Link>} />

      <div className="mb-4 flex items-center gap-3">
        <PddStatusBadge state={pdd.state} />
        {pdd.state === 'submitted' && <Button onClick={start}>Start validation</Button>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* document */}
        <div className="space-y-5 lg:col-span-2">
          {methodology.pdd_sections.map((section) => (
            <Card key={section.key} className="p-5">
              <h2 className="mb-3 text-base font-semibold text-ink-900">{section.title}</h2>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {section.fields.filter((f) => isFieldVisible(f, pdd.section_data)).map((f) => (
                  <div key={f.key}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{f.label}{f.unit ? ` (${f.unit})` : ''}</dt>
                    <dd className="mt-0.5 text-sm text-ink-800">{value(f.key, f.source)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>

        {/* audit panel */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Completeness</h3>
            {check.ok ? (
              <p className="text-sm text-brand-700">All required fields complete.</p>
            ) : (
              <ul className="list-disc pl-5 text-sm text-red-600">
                {check.missing.map((m) => <li key={m.field}>{m.label}</li>)}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Notes & comments</h3>
            <div className="mb-3 space-y-2">
              {comments.length === 0 && <p className="text-sm text-ink-400">No comments yet.</p>}
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-ink-50 p-2 text-sm">
                  <div className="text-xs text-ink-500">{c.author_name} · {c.author_role}</div>
                  <div className="text-ink-800">{c.body}</div>
                </div>
              ))}
            </div>
            <Textarea placeholder="Add a note, request, or rejection reason…" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={comment} disabled={!note.trim()}>Comment</Button>
              {canAct && <Button onClick={approve} disabled={!check.ok}>Approve → Register</Button>}
              {canAct && <Button variant="ghost" onClick={revise} disabled={!note.trim()}>Request revision</Button>}
              {canAct && <Button variant="ghost" onClick={reject} disabled={!note.trim()}>Reject</Button>}
            </div>
            {!check.ok && canAct && <p className="mt-2 text-xs text-ink-400">Approve is disabled until all required fields are complete.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Full type-check + full test run**

Run: `npx tsc -b && npx vitest run`
Expected: PASS — no type errors, all suites green (existing + `pdd.test.ts`, `registration.test.ts`, `registration.ui.test.tsx`).

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`, then in the browser console reset the store: `localStorage.removeItem('carbon-ready-store-v4'); location.reload();`
Verify:
1. Sidebar shows the **Registration** group.
2. `/registration` → pick methodology + Chiang Mai project → fill sections → computed fields (capacity, grid factor, ER estimate) show live values → Review shows completeness → Submit.
3. `/validation` lists PDD-2002 (and the just-submitted one) → open → **Start validation** → **Approve → Register** (disabled until complete).
4. After register, that project's Upload/Calculations pages show the working area (gate open); an `under_validation`/`pdd_draft` project shows the "not registered" gate.
5. `/audit-log` shows the new `PDD_SUBMITTED` / `PROJECT_REGISTERED` entries and the hash chain still verifies.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ValidationDetail.tsx
git commit -m "feat(page): VVB validation detail — approve/register, revise, reject"
```

---

## Self-review notes (coverage map spec → tasks)

- Domain model (§4 spec) → Task 1 (types), Task 3 (seed), Task 4 (store).
- Guardian mapping (§3) → Task 3 methodology shape + Task 2 computed (`customLogicBlock`/auto-calculate) + document states in Task 4.
- Seeded T-VER methodology + full loop (§5) → Task 3.
- UI / navigation (§6): Methodologies → Task 8; wizard → Task 9; PddDocument → Task 10; ValidationQueue → Task 11; ValidationDetail → Task 12; RegistrationGate + dMRV lock → Task 7; nav/routes → Task 6.
- Store/API/lib (§7) → Task 2 (`lib/pdd`), Task 4 (store), Task 5 (api).
- Testing (§8) → Task 2 (`pdd.test.ts`), Task 4 (`registration.test.ts`), Task 7 (`registration.ui.test.tsx`).
- Out of scope (§9): no re-registration, single seeded methodology, simulated api/guardian seams — respected.

**Naming consistency check:** `lifecycle_stage`, `PddState`, `selectMethodology`, `savePddDraft`, `submitPdd`, `startValidation`, `requestPddRevision`, `registerProject`, `rejectPdd`, `addPddComment`, `pddByProject`, `validationQueue`, `resolveComputed`, `isFieldVisible`, `validatePdd`, `pddContentHash` are used identically across the store, api, lib, and pages tasks.

**Verified existing-component APIs** (already reflected in the task code, no adjustment needed): `Badge` uses `tone` (green/amber/red/gray/blue/violet); labels export `CATEGORY_LABEL`/`STATE_LABEL` (singular); `Button` `variant` includes `ghost`; `Input`/`Select`/`Textarea` accept native props + a `label` prop and render their own `<label>` (never nest them); `Table`'s `TR` takes `hover` but **not** `onClick` (use a `<button>`/`<Link>` in a cell); `StatusBadge` is typed to `VerificationState`, so PDD states use the new `PddStatusBadge` added in Task 10.
