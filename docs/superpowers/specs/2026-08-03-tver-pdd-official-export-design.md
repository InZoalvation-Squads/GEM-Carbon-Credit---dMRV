# T-VER-S-F001-PDD Official Document Export — Design

**Date:** 2026-08-03
**Status:** Approved (user: "ลุย")
**Builds on:** 2026-06-30-project-registration-pdd-design.md, 2026-07-03-methodology-library-workflow-design.md

## Goal

From data captured in the platform, generate a Thai-language PDD that matches the official
TGO form **T-VER-S-F001-PDD (VERSION 2.1)** — the same layout, tables, checkboxes, and
calculation sections as the reference document (MCRU Solar Rooftop 667.20 kW example) —
exported as HTML and printed to PDF from the browser.

Reference figures the engine must reproduce exactly (from the MCRU example):

- BE = EG_Consumer × EF ÷ 1000: `952,424.57 kWh × 0.4682 tCO₂/MWh = 445.93 tCO₂/yr`
- Year 1: `963,915 × 0.4682 ÷ 1000 = 451.31`; panel degradation 0.40 %/yr over 7 years
- PE = Σ(equipment W × hours/yr) ÷ 1000 × EF: `5,801.68 kWh → 2.72 tCO₂/yr`
- ER = BE − PE − LE; 7-year total `3,098 tCO₂e` (yearly ER rounded to integers, summed)

## Decisions (user-confirmed)

1. **Data scope:** extend the methodology schema so the form can be filled completely
   (per-building equipment/coordinates, document preparer, investment, crediting period, PE).
2. **Output:** HTML page in the official TGO layout; PDF via browser print. No new deps.
3. **Entry point:** a button on the existing PddDocument page.

## Architecture

### 1. Schema extension (no DB migration)

PDD answers stay in `Pdd.section_data` (JSON). Changes are confined to the methodology
document (methodology-as-data) and the TS types:

- **New field type `table`** — `columns: Array<{ key, label, type: 'text'|'number', unit? }>`;
  value stored as `Array<Record<string, string|number>>`. Used for:
  - installations per building (building name, coordinates, panel count, inverter count, kWp)
  - project electricity consumers (equipment, rated W, hours/yr, note)
- **New sections/fields** in T-VER-S-01 (added to the existing 5 sections A–E):
  - cover info: Thai + English project title, project owner/co-developer, investment (MTHB),
    project type (fixed to renewable energy), project scale (เล็กมาก/เล็ก/ใหญ่),
    crediting period (7/10 yr) + crediting start date
  - document preparer + project coordinator (name, position, org, phone, email)
  - double-counting declaration (boolean + optional registry details)
  - additionality: Positive List (micro-scale) rationale, editable text with default
  - degradation %/yr (number, default 0.40)
- **New computed sources** (`PddComputedSource`):
  - `ec_pj` — Σ(rated_w × hours_per_year) ÷ 1000 over the consumers table (kWh/yr)
  - `annual_generation` — year-1 generation estimate (existing er model’s kWh leg)
  - `be_annual`, `pe_annual`, `er_annual` — averages over the crediting period
  - `er_yearly_table` — array of {year, period, BE, PE, LE, ER} with degradation applied
- Existing machinery (validation, showIf, sensitive/selective disclosure, content hash)
  operates on field schemas generically and continues to work unchanged.

### 2. Calculation additions (`carbon-ready/src/lib/pdd.ts`)

- `generation(year_y) = generation(year_1) × (1 − degradation)^(y−1)`
- `BE_y = EG_y × EF ÷ 1000` (2-decimal rounding, per form)
- `PE_y = EC_PJ × EF ÷ 1000` (constant across years, per form)
- `ER_y = round(BE_y − PE_y − LE_y)` (integers in the yearly table, per form)
- Totals + per-year averages. Unit tests assert every row of the MCRU yearly table.

### 3. Official document template (template-per-form)

- `carbon-ready/src/templates/TverSF001Pdd.tsx` renders the full form layout:
  repeated header box (T-VER mark, "Standard T-VER", form code, VERSION 2.1, page no.),
  bordered detail tables, ☑/☐ checkbox groups, section 1–4 + appendix tables,
  Sarabun/Thai-friendly font stack, A4 print CSS with page breaks.
- Methodology gains optional `document_template?: 'T-VER-S-F001-PDD'`; the export button
  appears only when a template is registered. Other methodologies keep the generic view.
- Route `/pdds/:pddId/official`; button "เอกสารฟอร์ม อบก." on PddDocument.
- Public view masking (sensitive → `•••`) is honored in the template as well.
- Photos/diagrams and the PEA financial appendix are **out of scope** (linked evidence
  covers photos; DOCX export not included).

### 4. Form editor (Registration page)

Add a row-based editor for `table` fields (add/remove rows, per-column typed inputs).
All other field types reuse the existing controls.

### 5. Server

Update the seeded T-VER-S-01 methodology document (new sections/fields, bumped document
version). `section_data` is already `Json`; no Prisma schema change, no API change.

## Testing

- **Unit (pdd.ts):** yearly table vs MCRU figures (451.31 … 437, total 3,098), EC_PJ sum
  (5,801.68), rounding behavior, degradation exponent.
- **UI:** table-field editor add/remove; export button gated on template presence;
  official template shows section_data values, ticks the right checkboxes, masks
  sensitive fields in public view.
- Existing pdd/methodology test suites must stay green.

## Out of scope (YAGNI)

Embedded photos, PEA financial appendix, DOCX export, generic layout engine for other
TGO forms (add templates one at a time when needed).
