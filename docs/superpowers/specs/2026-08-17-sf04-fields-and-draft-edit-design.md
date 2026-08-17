# SF-04 Supplemental Fields + Draft Editing — Design

**Date:** 2026-08-17
**Status:** Approved

## Goal

Close the two data gaps in the SF-04 export — **Facility ID/code** and
**Requested Labels** (both assigned by Evident after SF-02 approval, currently
stored nowhere) — and make issue-request **drafts editable** so data can be
added any time before submit (also fixing the standing "blank receiving fields
→ delete + recreate" dead end).

## Decisions (from brainstorming)

1. The two values are captured **per issue request** (not on the read-only
   registered SF-02 registration): optional inputs in the create modal, with
   **Facility ID prefilled from the project's most recent previous request**
   (typed once after Evident assigns it, carried forward automatically).
2. **Draft editing ships in the same round**: an "แก้ไข" button on draft rows
   reopens the modal in edit mode, backed by the existing (already tested,
   currently unused) `PUT /rec-issues/:id`.

## Architecture

### 1. Data model (additive migration)

`RecIssueRequest` gains two columns, both `String` NOT NULL default-empty
semantics (matching `receiving_org_name`):

```prisma
  facility_id      String // Evident Facility ID/code (assigned after SF-02 approval); '' until known
  requested_labels String // SF-04 §1.2 Requested Labels; '' when none
```

Migration `sf04_supplemental_fields` sets `DEFAULT ''` so existing rows
backfill to empty strings.

### 2. Server (`modules/rec-issues`)

- `CreateBody` + `PatchBody`: optional `facility_id` / `requested_labels`
  (trimmed strings; may be empty).
- `createRecIssue` stores them (`?? ''`); `updateRecIssue` patches them (draft
  only, as today). **Submit does not require them** — both are optional on the
  official form.
- Serializer + `REC_ISSUE_PUBLIC_KEYS` gain the two keys.
- Tests: create/PUT round-trip the fields; serializer shape updated; existing
  transition/role tests untouched.

### 3. SPA data layer

- `RecIssueRequest` type + demo store (`createRecIssue` stores, new
  `updateRecIssue` demo action patches draft fields and recomputes MWh when
  the period changes — same formula), `applyServerRecIssue` reused.
- `api.updateRecIssue(id, patch)` added with the standard dual-mode fork
  (`recIssuesApi.update` already exists server-side client).
- Demo fixtures: give RIR-1000 a facility id (e.g. realistic-shaped test value
  clearly marked as demo) so export tests can assert it; RIR-1001 stays empty.

### 4. Modal — create + edit modes

`RecIssueModal` gains `editing?: RecIssueRequest`:

- **Edit mode**: all inputs prefilled from the row; project `<Select>`
  disabled (a request never moves projects); buttons become "Save changes"
  (PUT) and "Save & Submit" (PUT then submit). MWh preview recomputes live
  when the period changes.
- **Create mode**: two new optional inputs — "Evident Facility ID/code" and
  "Requested Labels" — prefilled from the same project's most recent request
  (by created order; facility id especially). Existing receiving-fields
  submit-guard behavior unchanged.

### 5. REC Issuance page

Draft rows gain an "แก้ไข" button (before Submit/Delete) opening the modal in
edit mode. The row-level Submit guard (blank receiving fields) still applies —
but now the fix path is Edit, not delete + recreate.

### 6. SF-04 export mapping

`EvidentSF04.tsx` §1.2: Facility ID/code ← `facility_id` (blank cell when
empty), Requested Labels ← `requested_labels`.

## Error handling

Unchanged server guards (draft-only PUT, 409 otherwise). Edit modal on a
row that just left draft state → the PUT 409 surfaces via the existing toast
error path.

## Testing

- Server: create + PUT with the new fields; serializer keys; PUT recomputes
  MWh on period change (already covered — keep green).
- SPA: store `updateRecIssue` demo action (field patch + MWh recompute); modal
  edit mode prefill + disabled project select + PUT call; create-mode prefill
  of facility id from the previous request; RecIssuance edit button opens
  edit mode; SF-04 export shows the fixture facility id.
- Full suites + tsc + builds green; reseed not needed (no methodology change).

## Out of scope

- Production Auditor workflow; editing submitted/issued requests; storing
  facility id on the SF-02 registration (read-only once registered).
