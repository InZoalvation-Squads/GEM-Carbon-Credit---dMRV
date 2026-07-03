# Carbon Ready — Methodology Library & End-to-End Workflow (Guardian-shaped) — Design

**Date:** 2026-07-03
**Branch:** `feat/sprint-1-mvp`
**App:** `carbon-ready/`
**Status:** Design approved — pending implementation plan

---

## 1. Overview / ภาพรวม

**ไทย:** สองเป้าหมายในสเปกเดียว:
1. **จัดทำเอกสาร workflow ครบเส้น** ตั้งแต่ *register → monitor → verify → audit* (พร้อมชี้จุดที่ Hedera Guardian จะเสียบทีหลัง) เพื่อให้ทีมใช้อ้างอิง
2. **ขยายคลัง methodology** จาก 1 ตัว (Solar) เป็น **8 ตัว** ครอบคลุม 3 มาตรฐาน (T-VER / Verra / CDM) โดยฟอร์ม PDD เรนเดอร์ตาม schema ของแต่ละ methodology และ engine คำนวณ (Stage B) รู้จักสูตรของแต่ละ methodology

**EN:** One spec, two goals: (1) document the **full dMRV workflow** register → monitor → verify → audit, marking the Guardian anchor seam for a later phase; (2) grow the **methodology library** from 1 to **8** across 3 standards, with the PDD form schema-driven per methodology and a calculation engine that dispatches per methodology formula.

**ยังไม่แตะ Hedera ในสเปกนี้ / No Hedera work in this spec.** Stage D (anchor) remains the existing mock at [lib/guardian.ts](../../../carbon-ready/src/lib/guardian.ts); this spec only marks where the real Managed Guardian Service (MGS) call will slot in.

**Prior context (already decided):** integration model = **anchor-only** (GEM store stays system of record); Guardian hosting = **Managed Guardian Service**; anchor output = **VC + HCS proof only** (no token mint) via a thin Node/TS backend proxy — all deferred to a future phase.

---

## 2. The end-to-end workflow (reference)

Roles map to Guardian: `admin` = Standard Registry (TGO), `project_owner`/`esg_manager` = Project Proponent, `verifier` = VVB.

```
STAGE A — REGISTER (Gate 1: Validation of the PDD)
  select Methodology  [proponent]           → METHODOLOGY_SELECTED
  fill PDD (draft, schema-driven)           → (savePddDraft)
  submit PDD          [proponent]           → PDD_SUBMITTED         state: under_validation
  VVB starts validation [verifier]          → VALIDATION_STARTED
  outcome (3 ways)    [verifier]
    • request revision                      → PDD_REVISION_REQUESTED  state: revision_required
    • reject                                → PDD_REJECTED            state: rejected
    • register (content_hash freeze)        → PROJECT_REGISTERED      state: registered ✅ (dMRV unlocked)

STAGE B — MONITORING (dMRV, unlocked when registered)
  ingest MRV data     [esg_manager]         → CSV_UPLOADED (row validation) OR direct-entry
  calculate ER        [esg_manager]         → CALCULATION_EXECUTED (engine dispatch, §5)

STAGE C — VERIFY (Gate 2: Verification of the monitoring report)
  attach evidence (required_categories)     → EVIDENCE_UPLOADED
  submit verification [proponent]           → VERIFICATION_SUBMITTED   state: submitted
  VVB starts review   [verifier]            → REVIEW_STARTED           state: under_review
  comments (item / package level)           → COMMENT_ADDED
  outcome (3 ways)    [verifier]
    • request revision                      → REVISION_REQUESTED
    • reject                                → VERIFICATION_REJECTED
    • approve (lock + hash-seal)            → VERIFICATION_APPROVED     state: approved 🔒

STAGE D — ANCHOR (proof)  ← ★ Guardian seam (future phase, mock today)
  issue VC + publish HCS + IPFS             → VERIFICATION_ANCHORED
```

**Audit trail (cross-cutting).** Every action writes one `AuditLog` row with a hash chain (`row_hash = hash(payload + prev_row_hash)`) plus `user_role`, `previous_value`, `new_value` — this is the "ตรวจสอบย้อนกลับ" backbone and mirrors what Guardian records on HCS.

This workflow already exists in code end-to-end (`lib/api.ts`, `store/`, the `Registration`/`Validation*`/`Verifications`/`Guardian` pages). **The workflow is documentation of the current system; only §3–6 introduce changes.**

---

## 3. Methodology library (target: 8)

Codes/versions are **placeholders — must be confirmed against the TGO (T-VER) registry and Verra/UNFCCC** before publishing. They are marked `⚠︎ verify` in the data files.

| # | Standard | Methodology | `calculation.formula` | Work |
|---|----------|-------------|----------------------|------|
| 1 | T-VER | Solar PV (grid-connected) | `grid_displacement` | ✅ exists |
| 2 | T-VER | Wind power (grid-connected) | `grid_displacement` | new schema (reuse engine) |
| 3 | T-VER | Biomass power (grid-connected) | `grid_displacement` | new schema (reuse engine) |
| 4 | T-VER | Biogas-to-power (waste → electricity) | `grid_displacement` | new schema (reuse engine) |
| 5 | T-VER | Afforestation / Reforestation (A/R) | `biomass_stock_change` | new schema + calc |
| 6 | T-VER | Waste management / landfill gas capture | `ch4_avoidance` | new schema + calc |
| 7 | Verra | VM0042 Improved Agricultural Land Mgmt | `direct_entry` | new schema + widen `standard` |
| 8 | CDM | AR-ACM0003 Afforestation & Reforestation | `biomass_stock_change` | new schema + widen `standard` |

Each methodology is authored as a data module (like [methodology-tver-solar.ts](../../../carbon-ready/src/data/methodology-tver-solar.ts)) providing: `pdd_sections` (A–E: project info / baseline / additionality / GHG reduction / monitoring plan), `required_evidence`, `monitoring_params`, and the new `calculation` descriptor (§4). Registered in a single `data/methodologies/index.ts` barrel replacing the single-file import.

---

## 4. Data model changes (small, additive)

In [types/index.ts](../../../carbon-ready/src/types/index.ts):

```ts
export type Standard = 'T-VER' | 'Verra' | 'CDM';

export type CalcFormula =
  | 'grid_displacement'    // ER = Σ(input_kwh) × grid EF          (existing behavior)
  | 'biomass_stock_change' // ER = Σ(Δ carbon stock, tCO2e/period)
  | 'ch4_avoidance'        // ER = Σ(CH4 captured, t) × GWP_CH4
  | 'direct_entry';        // ER = Σ(measured tCO2e entered per period)

export interface MethodologyCalculation {
  formula: CalcFormula;
  input_param: string;   // monitoring_params key that carries the driver value
  input_unit: string;    // 'kWh' | 'tCO2e' | 't CH4' | ...
  gwp_ch4?: number;      // for ch4_avoidance (e.g. 28)
}

// Methodology gains:
//   standard: Standard            (was the literal 'T-VER')
//   calculation: MethodologyCalculation
```

Backward-compatible: existing solar methodology gets `standard: 'T-VER'` and `calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' }`.

`AuditAction` gains no new members (existing `CALCULATION_EXECUTED` / `CSV_UPLOADED` cover all formulas). `MonitoringRecord` stays as-is for `grid_displacement`; other formulas store their driver value in the same `generation_kwh` numeric field **repurposed via the methodology's `input_unit`** — no schema fork (documented explicitly to avoid ambiguity: the column holds "the period driver value in `input_unit`", not always kWh).

---

## 5. Calculation engine — dispatch per methodology

[lib/calc.ts](../../../carbon-ready/src/lib/calc.ts) today hard-codes kWh × grid factor. Refactor `calculateCarbon` to dispatch on `methodology.calculation.formula`:

| formula | reduction (tCO₂e) per period |
|---------|------------------------------|
| `grid_displacement` | `driver_kwh × grid_EF / 1000` (unchanged path) |
| `biomass_stock_change` | `driver` already in tCO₂e → `Σ driver` |
| `ch4_avoidance` | `driver_t_CH4 × gwp_ch4` |
| `direct_entry` | `Σ driver` (proponent-entered tCO₂e) |

- `calculate()` in [lib/api.ts](../../../carbon-ready/src/lib/api.ts) resolves the project's methodology (via its PDD) and passes `calculation` into `calculateCarbon`.
- `grid_displacement` keeps its existing emission-factor lookup path untouched → **no regression** for Solar (existing tests in `calc.test.ts` must still pass).
- `direct_entry` is the honest fallback: sectors whose real formula is complex (e.g. VM0042 soil organic carbon) still complete the workflow with a proponent-entered, verifier-checked value rather than a fabricated auto-calc.
- The PDD `computed` field `er_estimate` becomes formula-aware (ex-ante estimate uses the same dispatch); non-electricity methodologies that can't estimate ex-ante omit the `er_estimate` computed field.

---

## 6. Seed sample projects (filled PDDs)

Extend [data/seed.ts](../../../carbon-ready/src/data/seed.ts): seed **one project per methodology** (8 total), each with:
- a `Project` in `lifecycle_stage: 'registered'` (or one deliberately left `under_validation` to demo Gate 1),
- a `ProjectDesignDocument` with `section_data` fully populated for every required field of that methodology,
- `evidence` covering each methodology's `required_evidence`,
- a few `MonitoringRecord`s so Stage B calculation produces a non-zero ER on open.

Result: opening the app shows the full register→monitor→verify flow populated for each of the 8 methodologies. Seed is idempotent and versioned (bump the persist version so existing local stores re-seed).

---

## 7. Guardian anchor seam (future phase — not in this spec)

Stage D stays mock. When implemented (separate spec): replace [lib/guardian.ts](../../../carbon-ready/src/lib/guardian.ts) `issueCredential`/anchor with a call to a thin Node/TS backend → Managed Guardian Service → returns real VC id + HCS `topic_id`/`sequence_number`. The `VerificationRequest` already carries the fields (`credential_id`, `hcs_topic_id`, `hcs_sequence_number`, `anchored_at`). No frontend model change needed then.

---

## 8. Non-goals / out of scope

- No Hedera / MGS / backend proxy work (future phase).
- No token minting.
- No new UI pages — existing schema-driven PDD form, validation queue, and verification pages render the new methodologies as-is; only the methodology **picker** list grows.
- No official code/version authority: placeholder codes marked `⚠︎ verify`; correcting them is a data edit, not a code change.
- Full scientifically-accurate auto-calculators for every sector are out of scope — `direct_entry` is the sanctioned fallback.

---

## 9. Testing

- `calc.test.ts`: existing `grid_displacement` cases unchanged (regression guard) + one case per new formula (`biomass_stock_change`, `ch4_avoidance`, `direct_entry`).
- `registration.test.ts` / `registration.ui.test.tsx`: parametrize over ≥2 methodologies (one electricity, one cross-sector) to prove the PDD form renders and validates per-schema.
- Seed test: assert 8 methodologies load and each seeded PDD passes `registerProject` completeness (or is intentionally incomplete for the demo case).
