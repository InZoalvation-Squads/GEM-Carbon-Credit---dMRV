# Methodology-as-Data Architecture — Design

**Date:** 2026-07-22
**Status:** Approved (option A: parameter/unit model + JSON import/export;
expression engine and Guardian `.policy` execution deferred)
**Related:** `2026-07-22-guardian-api-migration-design.md`,
`2026-07-08-vm0047-arr-methodology-design.md`

## Goal

Any methodology — T-VER, Verra, CDM, future standards — must be addable to
Carbon Ready **without writing TypeScript**: a validated JSON document that
declares its PDD form, monitoring parameters (with real units), evidence
requirements, and calculation. This is the on-ramp to Guardian's
policy-as-data model.

## Problems with today's model

1. **Methodologies are code.** Nine `.ts` files under `src/data/methodologies/`;
   adding one requires a developer and a release.
2. **The unit hack.** Every monitoring driver — kWh, tCO2e, t CH4 — rides in
   `MonitoringRecord.generation_kwh` (acknowledged hack, `seed.ts:169`).
   Units are implicit in the methodology's `calculation.input_unit`, and
   nothing stops a kWh CSV being uploaded into a tCO2e methodology.
3. **No import/export.** A methodology cannot be shared, versioned, or
   diffed outside the bundle; Guardian policies cannot be brought in at all.

## Design

### 1. Methodology document (JSON, schema v2)

The existing `Methodology` type is already declarative — it becomes the
JSON contract, with these additions:

```
{
  "schema_version": 2,
  "code": "T-VER-S-01", "name": "...", "standard": "T-VER",
  "version": "1.0", "sectoral_scope": "...", "status": "active",
  "monitoring_params": [
    { "key": "generation_kwh", "label": "Electricity generated",
      "unit": "kWh", "method": "meter", "frequency": "monthly",
      "role": "driver" }          // exactly one param has role: "driver"
  ],
  "calculation": {
    "formula": "grid_displacement",
    "input_param": "generation_kwh",   // must reference a monitoring_params key
    "input_unit": "kWh"                // must equal that param's unit
  },
  "pdd_sections": [ ...unchanged shape... ],
  "required_evidence": [ ... ]
}
```

- Runtime validation with **zod** (`src/lib/methodology-schema.ts`):
  structural checks plus cross-field rules — `calculation.input_param`
  exists in `monitoring_params`, units agree, `showIf` references a real
  field key, `computed` fields carry a known `source`, select fields have
  options, sensitive fields are non-computed.
- `id` is assigned at import (existing convention), not part of the document.

### 2. Import / export

- **Export**: button on the Methodologies page → downloads the JSON document
  for any methodology in the library.
- **Import**: upload JSON → zod validation → add to library, preserving the
  document's own `status` (a success toast echoes code/version/status; a
  richer preview step is deferred). Duplicate `code+version` is rejected.
  Import is registry-role (`admin`) only and audit-logged
  (`METHODOLOGY_SELECTED` stays; add `METHODOLOGY_IMPORTED`).
- The nine bundled methodologies stay as seed data but are emitted through
  the same schema (`buildStandardMethodology` output must pass the zod
  schema — a test enforces this), proving code-path parity with imports.

### 3. Monitoring values get explicit parameters and units

`MonitoringRecord` gains `param_key` and `unit` (both optional for
back-compat; when absent they default to `generation_kwh`/`kWh` at read
time — no data migration needed for persisted stores):

```
interface MonitoringRecord {
  ...existing...
  param_key?: string;   // methodology monitoring_params key
  unit?: string;        // frozen at upload from the methodology definition
}
```

- CSV upload resolves the project's methodology and stamps the driver
  param's key/unit on each accepted row; the upload UI shows the expected
  unit instead of assuming kWh.
- `calc.ts` filters records to `calculation.input_param` (records with no
  `param_key` count as the default driver) — the "everything is
  generation_kwh" ambiguity ends at the calculation boundary.
- UI labels read the unit from the methodology rather than hardcoding kWh.
  Shipped for the Upload page (labels derive only from a *registered* PDD's
  methodology); Calculations/Verifications label updates are a follow-up.

### 4. Guardian `.policy` mapping (documented path, not built now)

A Guardian policy bundles: schemas (JSON Schema), a block-graph workflow,
roles, and token config. Mapping to Carbon Ready:

| Guardian | Carbon Ready |
|---|---|
| Policy schemas (PDD/MR) | `pdd_sections` / `monitoring_params` |
| Roles | fixed triad today (registry/proponent/VVB) |
| Block graph | hardcoded two-gate workflow today |
| Token config | single VCU collection today |

An importer can translate Guardian **schemas** into `pdd_sections`
mechanically (field types map 1:1 for our supported set). The **block
graph** cannot be honestly executed by the current hardcoded workflow —
rather than pretend, `.policy` import lands in Phase 2–3 of the Guardian
migration when Guardian itself executes the policy. This spec keeps the
JSON contract close to Guardian's schema vocabulary so that translation
stays mechanical.

### 5. Explicitly deferred

- Expression-based calculation engine (revisit when a methodology the four
  canned formulas cannot express is actually needed; Guardian's
  customLogicBlock covers this post-migration).
- Buffer pool / leakage / uncertainty deductions as computed steps (Verra
  AFOLU); today they remain PDD input fields.
- Per-policy roles and workflow states.

## Testing

- zod schema: accept all nine bundled methodologies; reject each cross-field
  violation class (unknown input_param, unit mismatch, dangling showIf,
  computed without source, duplicate field keys).
- Import flow: valid JSON round-trips export→import; duplicate code+version
  rejected; non-admin blocked.
- calc: mixed-param record sets only sum the driver param; legacy records
  (no `param_key`) keep producing identical totals (regression against
  existing `calc.test.ts` fixtures).
