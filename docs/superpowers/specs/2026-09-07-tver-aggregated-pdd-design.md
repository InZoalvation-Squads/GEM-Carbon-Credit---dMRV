# T-VER-S-F001-PDD แบบควบรวม (Aggregated PDD) — Design

**Date:** 2026-09-07
**Status:** Approved
**Scope:** Let users fill in and generate the aggregated (แบบควบรวม) variant of the
official TGO T-VER-S-F001-PDD form. Today only the single-project (แบบเดี่ยว) variant exists.

## Problem

The official T-VER-S-F001-PDD form has two variants: แบบเดี่ยว (single project) and
แบบควบรวม (aggregated / bundled). The aggregated variant covers several installation
sites under one project developer and one crediting period — the reference PDD supplied
by the user bundles six rooftop sites totalling 2,009.30 kWp.

The current implementation supports only แบบเดี่ยว. Four strings are hardcoded to
แบบเดี่ยว, and the calculation engine derives every figure from a single
`project.capacity_kwp` and a single `project.location`.

The aggregated form additionally requires, per site: owner, address, coordinates,
installed capacity, year-1 generation, first-synchronisation year, equipment list, and
annual maintenance frequency — plus aggregate totals derived from those rows.

## Approach

Sites are stored as a `table` field inside the PDD's `section_data`, **not** as separate
`Project` records. Each site row carries a nullable `project_id` column so a site can be
promoted to a real `Project` later without reshaping the stored data.

### Why not first-class Project records

The calc engine reads `project.capacity_kwp` and `project.location` directly in
`gridFactor()`, `year1GenerationKwh()`, and `resolveComputed()` (`lib/pdd.ts:49-116`).
Promoting sites to `Project` rows means a single-vs-bundle branch in each of those paths,
a DB migration, and registration-flow changes — for something the form does not require.
Pages 7, 9, 22, 31, and 32 of the official form all render sites as **table rows**.

The existing `table` field type already supports this shape: `Registration.tsx:512`
renders it, `siteSpecific` already excludes per-site facts from clone-carryover, and
`computeEcPj()` (`lib/pdd.ts:96`) already demonstrates summing table rows into a
calculation input.

### Accepted cost

No per-site evidence attachment and no per-site IoT meter readings. At PDD stage this is
correct — the form asks for equipment specifications and forecasts, not measured data.
It becomes limiting at verification/issuance, when each site needs its own meter
readings. The nullable `project_id` column is the seam to promote through at that point,
one site at a time.

## Data model

### New field: `sites`

Added to the T-VER solar methodology, marked `siteSpecific: true` so cloning another
bundle's PDD never carries its sites over.

| column | type | feeds |
|---|---|---|
| `owner` | text | เจ้าของโครงการ (p.2), ตารางที่ 1 |
| `address` | text | ที่ตั้งโครงการ (p.2) |
| `coordinates` | text | พิกัดที่ตั้งโครงการ (p.2) |
| `kwp` | number | ตารางที่ 1, aggregate capacity |
| `year1_kwh` | number | ตารางที่ 1, yearly forecast |
| `first_sync_year` | number | staggered crediting start (p.31) |
| `maintenance_per_year` | number | ตารางที่ 4 (p.22) |
| `project_id` | text (nullable) | seam for promoting a site to a real `Project` |

### New field: `project_form`

`select` with options `แบบเดี่ยว` / `แบบควบรวม`, `defaultValue: 'แบบเดี่ยว'`. Drives both
the calculation branch and the form rendering.

### Modified fields

`installations` and `equipment_specs` each gain a leading `site` text column so equipment
rows attribute to a site (pages 9, 25–30). Existing PDDs have rows with no `site` value;
these render as unattributed, which is acceptable and requires no migration.

### Backward compatibility

Every existing PDD keeps working untouched. `project_form` defaults to `แบบเดี่ยว`,
`sites` is empty, and the engine falls back to `project.capacity_kwp` exactly as today.

## Calculation engine

All bundle behaviour is guarded by a single predicate: `sites` is a non-empty array.
When false, every function keeps its current behaviour byte-for-byte.

### `bundleCapacityKwp(ctx)` — new

Σ of site `kwp`, else `project.capacity_kwp`.

### `year1GenerationKwh(ctx)` — modified

Σ of per-site `year1_kwh` in bundle mode; otherwise today's
explicit-override-else-capacity-model path (`lib/pdd.ts:110-116`) is unchanged.

### `computeYearlyTable(ctx)` — modified

In bundle mode each site runs its **own** chained-rounding forecast from its own
`first_sync_year`, and the yearly total is the sum of the sites live in that year.

This staggering is the substantive change. `generationForecast()` (`lib/pdd.ts:135-144`)
chain-rounds each year from the previous rounded value because pure `pow()` drifts. In
bundle mode that chain runs per site rather than once over the aggregate, which is what
reproduces page 31 of the reference PDD — where site D contributes nothing until year 1,
while sites B and F have already been degrading for two years.

`EF`, `PE`, and the `ER = floor(BE − PE)` truncation are unchanged. Bundle mode changes
*which* kWh enter the calculation, not the emission arithmetic. The grid factor still
resolves from the parent project's location: all sites in an aggregated T-VER project are
domestic, and the form publishes one EF.

### Known discrepancy in the reference PDD

In the supplied reference document, per-site year-1 values sum to 2,499,410 kWh (ตารางที่ 1,
p.7), while §3.1 states `EG_Consumer,PJ,y` = 2,550,585.36 kWh (p.17). These are
inconsistent; §3.1 appears to include a year the table does not.

**Decision:** compute `EG_Consumer,PJ,y` from the site rows and let it be whatever the rows
sum to. Neither figure is hardcoded. If TGO expects the §3.1 figure to derive differently,
that must be confirmed with the document's original preparer — this is flagged as an open
question, not resolved by assumption.

## Form rendering

`TverSF001Pdd.tsx` is 945 lines and already at the limit of comfortable editing. Rather
than branching inline in roughly ten places, the site-dependent blocks are extracted into
a `tver-sf001/` folder — cover, project-details table, ตารางที่ 1–4, and the appendix
tables — each taking a `sites` array that is length-1 in single mode.

Single-project output must stay byte-identical; the existing UI test
(`tver-sf001.ui.test.tsx`) is the guard.

The four hardcoded `แบบเดี่ยว` strings become mode-driven:
`TverSF001Pdd.tsx:60`, `:260`, and the checkbox pair at `:378-379`.

Pages rendered in bundle mode only:

- ตารางที่ 1 — per-site capacity and year-1 generation
- ตารางที่ 4 — per-site maintenance frequency
- Page-31 yearly forecast matrix — per-site rows across the crediting period
- Appendix — per-site equipment blocks

## Editing and validation

The `sites` table uses the existing `TableFieldInput` (`Registration.tsx:512`). No new
editor UI.

Validation adds one rule: in `แบบควบรวม` mode `sites` must have at least one row, and any
row missing `kwp` or `year1_kwh` surfaces through the existing `validatePdd` missing-fields
path rather than silently summing to a wrong total.

Consistent with the project's real-data-only rule, aggregate figures are derived sums that
render blank when their input rows are incomplete. No aggregate is defaulted or guessed.

## Testing

- Unit tests for the staggered forecast, using the reference PDD's page-31 table as the
  fixture — real published values, not invented ones.
- Regression test asserting single-project output is unchanged.
- UI test for bundle-mode rendering.
- Validation tests for the empty-`sites` and incomplete-row cases.

## Out of scope

Explicitly deferred, with the nullable `project_id` column as the forward seam:

- Per-site evidence attachment
- Per-site IoT meter readings
- Promoting a site row to a real `Project` record

## Open questions

1. The §3.1 `EG_Consumer,PJ,y` discrepancy described above, to be confirmed with the
   reference PDD's preparer. The implementation computes from rows in the meantime.
