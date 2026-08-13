# SF-04 REC Issuance Track — Design

**Date:** 2026-08-14
**Status:** Approved

## Goal

REC-registered projects can create, submit, and track I-REC(E) Issue Requests
(official form SF-04 v1.2.1) inside the platform. The production volume (MWh)
is computed automatically from existing dMRV monitoring records. An in-app
Local Issuer (verifier role) approves or rejects submitted requests, mirroring
the SF-02 registration flow.

## Decisions (from brainstorming)

1. **In-app approval** by the existing verifier/admin roles acting as Local
   Issuer — consistent with the SF-02 track; enables end-to-end testing in-app.
2. **Scope: create + track + auto-MWh only.** No SF-04 document export, no
   token minting, no Hedera anchoring of issuance this round.
3. **Approach A chosen:** a new `RecIssueRequest` entity parallel to
   `VerificationRequest`. (Rejected: reusing VerificationRequest with a type
   flag — `reduction_kgco2e` semantics don't fit MWh; SPA-only storage — breaks
   server mode.)

## Source document (real-data-only)

`docs/reference/rec/sf-04-issue-request-v1.2.1.pdf` — Evident SF-04: Issue
Request v1.2.1 (21 Nov 2025). Form structure mapped:

- §1.1: Date (= submitted_at), **Request type: Normal / Self consumption**
- §1.2 Registrant & Facility: Org ID/code, Org name, Facility ID/code, Facility
  name, Requested Labels — snapshotted from the project's registered REC
  registration (`section_data`: evident_org_id, organisation_name,
  facility_name) at creation; facility_id/labels are free-text (assigned by
  Evident, not stored in our SF-02 form).
- §1.3 Production Details: **Period start/end date, Total production during
  period (MWh, up to 6 dp), I-REC(E) applied for (MWh, optional — blank means
  total is issued)**
- §1.4 Energy Sources: fuel/technology codes — snapshotted from the REC
  registration section_data (fuel_code, fuel_description, technology_code,
  technology_description).
- §1.5 Production Auditor: optional, signature-based → out of scope (can be
  attached as evidence).
- §1.6 Receiving Account: **Receiving organisation name, Account ID/code**
- §1.7 SF-04A Issuing Declaration: signed paper → evidence upload; its
  no-double-counting warrant is shown as help text on the create form.
- §1.8 SF-04B (Production Groups), §1.9 SF-04C (multi-fuel): out of scope —
  the platform registers individual solar facilities.

## Architecture

### 1. Data model — Prisma `RecIssueRequest` + migration

```prisma
enum RecIssueState {
  draft
  submitted
  issued
  rejected
}

model RecIssueRequest {
  id                     String        @id
  project_id             String
  created_by             String
  owner_name             String
  assigned_reviewer_name String
  state                  RecIssueState
  request_type           String  // 'Normal' | 'Self consumption'
  period_start           String  // ISO date
  period_end             String  // ISO date
  total_production_mwh   Float   // server-computed from MonitoringRecord, frozen at submit
  applied_mwh            Float?  // SF-04 "I-REC(E) applied for"; null = total
  facility_snapshot      Json    // org/facility/fuel/tech from the REC registration
  receiving_org_name     String
  receiving_account_id   String
  evidence_ids           String[]
  submitted_at           DateTime?
  issued_at              DateTime?
  rejection_reason       String?
  created_at             DateTime @default(now())
  updated_at             DateTime @updatedAt

  project Project @relation(fields: [project_id], references: [id])
  @@index([project_id])
  @@map("rec_issue_requests")
}
```

### 2. Server module `server/src/modules/rec-issues/`

Mirrors the existing module pattern (zod `strictObject` bodies, serializer
allowlist, audit entries):

- `POST /projects/:id/rec-issues` — create draft. Server validates: project has
  a **registered** Pdd whose methodology `standard === 'REC'`; period valid
  (start ≤ end); computes `total_production_mwh` = Σ `MonitoringRecord.generation_kwh`
  where `record_date` in [start, end] ÷ 1000, rounded to 6 dp; must be > 0.
  Snapshots facility fields from the REC Pdd's `section_data`.
- `PUT /rec-issues/:id` — update draft fields (period change recomputes MWh;
  receiving account, request_type, applied_mwh, evidence_ids). Draft only.
- `POST /rec-issues/:id/submit` — validates `applied_mwh` (if set) ≤ total and
  > 0, receiving fields non-empty; freezes totals; state → submitted.
  Roles: project_owner, admin, esg_manager.
- `POST /rec-issues/:id/approve` → issued (sets issued_at); `POST .../reject`
  (reason required) → rejected. Roles: verifier, admin.
- `GET /projects/:id/rec-issues` and `GET /rec-issues` (queue).
- Audit actions: `REC_ISSUE_CREATED`, `REC_ISSUE_SUBMITTED`,
  `REC_ISSUE_ISSUED`, `REC_ISSUE_REJECTED` (enum + SPA labels).

### 3. SPA

- Types: `RecIssueRequest`, `RecIssueState` in `carbon-ready/src/types`.
- Dual-mode api/store functions following the existing verifications pattern
  (local demo store + server client).
- New page **REC Issuance** (`/rec-issuance`, sidebar entry below
  Verifications): request table (project, period, MWh, state, fee estimate) +
  role-aware actions — PP: create/edit/submit; verifier/admin: approve/reject
  on submitted rows.
- Create/edit modal: pick a REC-registered project → pick period → auto MWh
  preview (client-side sum for display; server value is authoritative) →
  request_type, applied_mwh (optional), receiving org/account → save/submit.
- Fee estimate display (informational only): `MWh × ฿0.95` (Normal) or
  `× ฿1.33` (Self consumption), per EGAT FN-01 2026.
- Page states: no REC-registered project yet → empty state pointing to the
  Register Project REC track.

### 4. State machine

`draft → submitted → issued | rejected`. Rejected is terminal (create a new
request); no revision loop this round. Draft is deletable by its owner.

## Error handling

- Create against a non-REC or unregistered project → 400 with a clear message.
- Period with zero production → 400 (client disables submit too).
- `applied_mwh > total_production_mwh` → 400.
- State-transition guards: submit only from draft; approve/reject only from
  submitted; role checks per section 2.

## Testing

- Server: MWh computation (sum, ÷1000, 6-dp rounding, period boundary dates
  inclusive), eligibility guard (non-REC project rejected), state transitions +
  role guards, applied_mwh validation, serializer shape.
- SPA: page renders queue; create modal filters to REC-registered projects
  only; auto-MWh preview; submit → state chip; approve/reject as verifier;
  fee estimate math; empty state.
- Existing suites stay green; `npm run build` + prisma migrate clean.

## Out of scope

- SF-04 document export/print (future sprint, parallel to T-VER export).
- REC token minting on Hedera; Hedera anchoring of issuance records.
- SF-04B Production Groups, SF-04C Fuel Consumption (single-fuel solar).
- Production Auditor workflow (attach signed docs as evidence instead).
- Transfer/redemption tracking after issuance.
