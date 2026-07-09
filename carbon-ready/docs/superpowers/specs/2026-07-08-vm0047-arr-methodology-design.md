# VM0047 ARR Methodology — Design Spec

**Date:** 2026-07-08
**Source:** [Guardian VM0047 policy guide](https://docs.guardianservice.app/preloaded-policy-guides/carbon-offsets/vm0047-afforestation-reforestation-and-revegetation)
**Standard reference:** Verra VM0047 *Afforestation, Reforestation, and Revegetation*, **v1.1** (active 2025-05-14).

## Goal

Add Verra **VM0047 (Afforestation, Reforestation and Revegetation)** to the methodology library,
built the Guardian-correct way: the standard VCS actor triad (Project Proponent → VVB →
Standard Registry) with the PD → Validation → Monitoring → Verification → VCU issuance lifecycle
the existing Registration/guardian workflow already models generically. The methodology plugs into
`buildStandardMethodology()` so no workflow code changes are required.

## Why VM0047 is distinct from the existing AR-ACM0003

VM0047 is a Verra removals methodology that differs from the CDM `AR-ACM0003` already in the library:

- **Two quantification approaches** — *Area-based* (land-cover change; remote sensing + plot
  sampling) vs *Census-based* (dispersed planting: agroforestry, shelterbelts, urban forestry,
  revegetation). This is VM0047's signature choice.
- **Dynamic performance benchmark** — additionality/crediting baseline set by the change in a
  vegetative *stocking index (SI)* between project and matched control plots, recalculated at each
  verification. Replaces a static baseline.
- Accounts for **soil organic carbon**, **biomass burning emissions**, and **N-fertilizer emissions**.

## Components

### 1. `src/data/methodologies/verra-vm0047.ts`

Assembled via `buildStandardMethodology()` (same A–E PDD pattern as every other methodology).

| Field | Value |
|---|---|
| id | `meth-verra-vm0047` |
| code | `VM0047` |
| name | `VM0047 Afforestation, Reforestation and Revegetation` |
| standard | `Verra` |
| version | `v1.1` |
| sectoral_scope | `Agriculture, Forestry and Other Land Use (AFOLU)` |
| calculation | `{ formula: 'biomass_stock_change', input_param: 'dCO2_removals', input_unit: 'tCO2e' }` |

**Section A (projectFields):** `quantification_approach` (Area-based / Census-based),
`arr_activity` (Afforestation / Reforestation / Revegetation), `area_hectares` (ha),
`land_use_change` (boolean).

**Section B (baselineOptions):** `Non-forest / degraded land vs dynamic performance benchmark
(matched control plots)`.

**Section D (ghgFields):** `stocking_index_baseline` (SI), `soc_included` (boolean),
`biomass_burning_emissions` (tCO₂e/yr), `n_fertilizer_emissions` (tCO₂e/yr),
`leakage_estimate` (tCO₂e/yr), `annual_removal_estimate` (tCO₂e/yr).

**monitoring_params:**
- `dCO2_removals` — Net GHG removals (tCO₂e) — remote sensing + plot sampling / census, net of the
  dynamic performance benchmark — Annually.
- `A_project` — Project area (ha) — GIS boundary — Annually.

**required_evidence:** `site_photo`, `supporting_evidence`, `commissioning_report`.

### 2. `src/data/methodologies/index.ts`

Import, re-export, and append `VERRA_VM0047_METHODOLOGY` to `ALL_METHODOLOGIES`.

### 3. `src/data/seed.ts`

Reintroduce one non-solar sample (pattern the recent CSV-fleet refactor removed):
- `Project` — *Nan Watershed ARR*, Nan, Thailand, 0 kWp, `registered`.
- Registered `ProjectDesignDocument` with realistic VM0047 `section_data` covering every A–E field.
- Monthly `tCO2e` driver `MonitoringRecord`s so the calc path (`biomass_stock_change` → Σ tCO₂e)
  produces credits.

Wired into `seedProjects` / `seedPdds` / `seedRecords` following existing conventions.

## Testing

Existing tests assert every methodology renders a full PDD and that the seed is complete
(`registration.ui.test.tsx`, seed-completeness test). Run those plus typecheck. No new test files —
VM0047 is exercised by the existing per-methodology parametric tests.

## Out of scope

- No changes to the Guardian workflow, calc engine, or types — VM0047 reuses existing infrastructure.
- No custom equation engine for the dynamic performance benchmark; the benchmark is captured as PDD
  input fields and the net removals arrive pre-computed via the monitoring driver (consistent with
  how the other removals methodologies are modelled).
