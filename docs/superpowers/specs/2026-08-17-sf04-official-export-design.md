# SF-04 Official Form Export — Design

**Date:** 2026-08-17
**Status:** Approved

## Goal

A REC issue request (any state — draft previews, submitted/issued complete) can
be exported as the official Evident **SF-04: Issue Request v1.2.1** document,
faithful page-by-page, filled from the `RecIssueRequest` row, printable to PDF
via the browser — same mechanism as the SF-02/T-VER exports.

## Decisions (from brainstorming)

1. Full-document fidelity: cover, Document Control, Contents, Introduction,
   form §1.1–1.6, SF-04A Issuing Declaration (always). SF-04B (Production
   Group Statement) and SF-04C (Fuel Consumption Statement) excluded — groups
   and multi-fuel are out of platform scope (single-fuel solar).
2. Entry point: a document icon button on every row of the REC Issuance table
   → route `/rec-issuance/:id/official`. No registry involvement — the
   methodology-keyed `OFFICIAL_FORMS` registry stays pdd-scoped; SF-04 is
   issue-request-scoped and gets its own route + guard component.
3. Visual recreation CSS/typography only, `.sf04-doc` scope class (no
   collision with `.tver-doc` / `.sf02-doc`).

## Source (real-data-only)

`docs/reference/rec/sf-04-issue-request-v1.2.1.pdf` (10 pages). Static text
(Document Control values EC-IRE-SF04 / v1.2.1 / 21 November 2025, Contents
1.1–1.10, Introduction paragraphs, section hints, the multi-fuel note under
§1.3, SF-04A declaration paragraphs, sidebar "--- THIS FORM MUST BE SUBMITTED
THROUGH THE EVIDENT REGISTRY---", footer "Version: 1.2 · Copyright © Evident
Ev Limited · Page x/5" — note the PDF's form pages footer says "Version: 1.2")
transcribed verbatim.

## Architecture

### 1. Renderer — `carbon-ready/src/templates/EvidentSF04.tsx`

Props `{ recIssueId?: string }` + `useParams` fallback; pulls the
`RecIssueRequest` from the store (`s.recIssues`), plus the project name for
the toolbar back-link. `EmptyState` when the id is unknown. Reuses the SF-02
template idioms (Page primitive with repeating header/footer, Check ☑/☐,
DateCells, per-digit grid, toolbar with `window.print()`, print CSS block).

Field mapping (form → `RecIssueRequest`):
- §1.1: Date ← `submitted_at` (blank DD/MM/YYYY cells while draft); Request
  type ← `request_type` (☑ Normal / Self consumption).
- §1.2: Organisation ID/code ← `facility_snapshot.evident_org_id`;
  Organisation name ← `facility_snapshot.organisation_name`; Facility ID/code
  ← blank (assigned by Evident, not stored); Facility name ←
  `facility_snapshot.facility_name`; Requested Labels ← blank.
- §1.3: Period start/end ← `period_start`/`period_end` (DateCells); Total
  production during period ← `total_production_mwh` as a per-digit MWh grid
  (up to 6 decimals, `data-testid="mwh-grid"`); I-REC(E) applied for ←
  `applied_mwh` digit grid when set, blank cells when null; the italic
  multi-fuel note under the table verbatim.
- §1.4 Energy Sources: fuel/technology code + description ←
  `facility_snapshot.fuel_code/fuel_description/technology_code/technology_description`.
- §1.5 Production Auditor: static preamble + blank Organisation
  name/Signature/Name/Date rows (platform has no auditor workflow).
- §1.6 Receiving Account Details: `receiving_org_name`,
  `receiving_account_id`.
- SF-04A: declaration paragraphs verbatim with
  `facility_snapshot.organisation_name` context where the form implies the
  Registrant; blank Signature/Name/Date rows.

### 2. Route + guard — `carbon-ready/src/templates/RecIssueOfficialForm.tsx`

Small guard component for `/rec-issuance/:id/official` (inside
RequireAuth/AppShell in App.tsx): finds the rec issue, renders
`<EvidentSF04 recIssueId={...} />`, `EmptyState` otherwise.

### 3. Button — `carbon-ready/src/pages/RecIssuance.tsx`

In the Actions column, a ghost icon button (FileText, label "SF-04") on
**every** row (all states), linking to `/rec-issuance/${r.id}/official`.
Draft rows therefore print a partially blank official form — acceptable
preview behavior per decision 1.

## Error handling

Unknown id → EmptyState. Null/blank values render as empty cells (never '-').
Digit grid tolerates non-numeric/absent values by rendering empty boxes.

## Testing

- `carbon-ready/src/templates/evident-sf04.ui.test.tsx` with fixtures
  RIR-1000 (issued, 6 MWh) / RIR-1001 (draft, 0.999 MWh): cover + EC-IRE-SF04
  + footer identity; request-type ☑ matches fixture; snapshot org/facility
  values appear; period dates split into cells; MWh digit grid present with
  the fixture digits; receiving org/account rendered; SF-04A heading present;
  SF-04B/SF-04C headings appear only in the Contents listing (verbatim TOC),
  never as rendered pages.
- RecIssuance page test: every row has an SF-04 link pointing to
  `/rec-issuance/<id>/official`.
- Guard test: unknown id → EmptyState.
- Existing suites stay green; tsc + build clean.

## Out of scope

- SF-04B/SF-04C pages; production-auditor workflow; server-side PDF; linking
  the SF-02 export from the issuance page.
