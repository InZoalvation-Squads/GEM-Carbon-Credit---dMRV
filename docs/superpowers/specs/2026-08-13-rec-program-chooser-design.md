# REC Program Chooser + REC Registration Track — Design

**Date:** 2026-08-13
**Status:** Approved — official source documents obtained (see References)

## Goal

Project developers can register a project under **TGO (T-VER)** or **REC** (renewable
energy certificate, I-REC(E) scheme). The Register Project page asks which program
first, then shows only that program's methodology cards. The REC track is a full
registration flow reusing the existing PDD machinery (editor, prefill/clone,
validator review, Hedera anchoring).

## Decisions (from brainstorming)

1. **Full REC flow this round** — not a placeholder. Form fields come from the
   official REC registration document the user will provide (real-data-only policy:
   no invented fields).
2. **One project can hold both registrations** (same power plant → T-VER PDD *and*
   REC registration). Program therefore lives at the registration level, not on
   `Project`. The existing `Project.pdds Pdd[]` 1:many relation already supports this.
3. **Same review flow as T-VER**: submit → validator approves → registered. For REC
   the validator role represents the Local Issuer (e.g. EGAT); only labels change.
4. **Approach A chosen**: REC modeled as a methodology-as-data document with a new
   `standard` value, plus a program-chooser step 0 on the Registration page.
   (Rejected: separate REC entity/pages — duplicates the editor and review flow;
   program field on `Project` — conflicts with decision 2.)

## Architecture

### 1. Program chooser (frontend)

`carbon-ready/src/pages/Registration.tsx` entry screen becomes two steps, state held
in local `useState` (no routing changes):

- **Step 0 — program cards**: "TGO (T-VER)" and "REC (I-REC(E))" with short Thai
  descriptions. Choosing one advances to step 1.
- **Step 1 — methodology cards**: existing card grid filtered by the chosen
  program's `standard` (`T-VER` cards for TGO; the REC registration card for REC).
  A back control returns to step 0.

Everything downstream is unchanged: `StartPddModal` (create-or-pick project,
clone-from-previous), `buildPrefill`, `PddEditor`, submit/review.

`CARD_TRACKS` (currently hard-coded `['meth-tver-solar', 'meth-tver-forestry']`)
gains the REC methodology id; filtering keys off each methodology's `standard`.

### 2. Standard union extension

Add `'REC'` to the `Standard` union in the four synced locations:

- `carbon-ready/src/types/index.ts` (`type Standard`)
- `server/src/lib/methodology-types.ts`
- `carbon-ready/src/lib/methodology-schema.ts` (zod enum)
- `server/src/lib/methodology-schema.ts` (zod enum)

Plus a `REC` badge tone in `STANDARD_TONE` (Registration.tsx). No Prisma migration:
`Methodology.standard` is a plain `String`, and no `Project` column is added.

### 3. REC methodology document (methodology-as-data)

- New seed doc `server/prisma/seed-data/methodologies/meth-rec-solar.json`
  (schema_version 2, `standard: "REC"`), mirrored in
  `carbon-ready/src/data/methodologies/` and registered in `ALL_METHODOLOGIES`.
- Fields use the existing `defaultValue` / `siteSpecific` flags so standard
  defaults and clone-from-previous work identically to T-VER.
- **Field content comes from the official Evident SF-02: Production Facility
  Registration form (v1.3, 2023-09-07)**, submitted to EGAT as Thailand's I-REC(E)
  Local Issuer. Form sections map 1:1 to methodology `pdd_sections`:
  1. Registration details (date, registration type New/Change of details,
     registrant-is-owner Yes/No)
  2. Registrant contact details (Evident organisation ID/code, organisation name,
     contact person, business address, country, e-mail, telephone)
  3. Production facility details (facility name, address, country, latitude and
     longitude ±n.nnnnnn, installed capacity MW up to 6 decimals, meter or
     measurement ID(s), number of generating units, commissioning date, network
     owner + connection voltage, non-grid-connection circumstances, expected form
     of volume evidence: Metering data / Contract sales invoice / Other)
  4. Fuel and technology codes (per Evident SD-02: Technologies and Fuels; solar
     defaults can use `defaultValue`)
  5. Business details (on-site captive consumer Yes/No + details, auxiliary/standby
     energy sources Yes/No + details, non-metered import routes, other carbon
     offset / energy tracking scheme registrations incl. registration id — state
     'None' if none, labelling schemes, public funding No/Investment/Production +
     end date, requested effective date of registration — no earlier than 12
     months before submission)
  6. Verification agent (proposed verification agent, if not the Issuer)
  7. Additional information (free text)
  Declarations (SF-02A Registrant's Declaration, SF-02C Owner's Declaration when
  registrant ≠ owner) and the confirmation signature are physical/signed artifacts —
  represented as evidence uploads, not form fields. SF-02B (Production Group) is out
  of scope: the platform registers individual facilities.
- `required_evidence` comes from EGAT Process Guide V12 pages 2–3 (Production
  Facility Registration supporting documents): signed Owner's Declaration + proof
  of owner (when registrant ≠ owner), project photos, Power Purchase Agreement,
  Meter Calibration Report (when non-settlement metering), Single Line Diagram,
  evidence of measured production volume, proof of installed capacity (kW),
  electricity production license (e.g. PorKor2 / ERC license), fuel evidence (for
  fuel-based facilities), proof of COD date, and — when an onsite consumer exists —
  a Declaration Letter (signed by consumer) or Notice Letter (signed by owner)
  waiving energy-attribute claims.

### 4. UI terminology

Where the UI says "PDD", REC registrations read "REC Registration" (card, editor
heading, validator queue row). Implemented as a small label helper keyed off the
methodology's `standard` — no structural changes.

### 5. Review flow and lifecycle

- Reuses the existing `PddState` machine and validator screens unchanged. REC-side
  labels present the reviewer as Local Issuer.
- `Project.lifecycle_stage` is untouched: whichever registration reaches
  `registered` first unlocks dMRV via the existing `RegistrationGate`; a second
  registration on the same project proceeds independently afterward.

## Error handling

No new failure modes: validation is the existing zod methodology schema (which now
accepts `'REC'`), and the create-project / create-PDD endpoints are reused as-is.

## Testing

- Chooser: program cards render; selecting TGO shows only T-VER cards, REC shows
  only the REC card; back returns to step 0.
- Zod methodology schemas accept `standard: 'REC'` on both SPA and server.
- Prefill/clone works against the REC doc (once fields land).
- Existing suites stay green (server tests + SPA UI tests, `npm run build` clean).

## Out of scope

- REC issuance/transfer/redemption (SF-04) — only registration this round.
- Registrant account opening (SF-01 + STC Contract) — company-level, one-time,
  done outside the platform; the form captures the resulting Evident
  organisation ID.
- Production Groups (SF-02B).
- Official REC document export (parallel to the T-VER PDD export) — later sprint.
- Any change to Guardian policy or Hedera anchoring behavior.

## References

Official source documents, archived in-repo at `docs/reference/rec/`:

- `sf-02-production-facility-registration-v1.4.1.pdf` — Evident, SF-02 v1.4.1
  (21 Nov 2025) — **current basis of the form** (updated 2026-08-14 from v1.3:
  registration_type gains Renewal/Transfer, new Additional Contact(s) field,
  effective-date rule now "Residual Mix Deadline / not before commissioning",
  §1.4 renamed Energy Sources).
- `sf-02-production-facility-registration-v1.3.pdf` — superseded original basis.
- `egat-irec-process-guide-v15.pdf` — EGAT Process Guide V15 (supporting-document
  lists unchanged from V12; adds "print STC single-sided").
- `egat-irec-process-guide-v12.pdf` — superseded.
- `egat-fee-structure-2026-v2.1.pdf` — EGAT FN-01 fee schedule 2026 (≥3 MW
  38,000฿ · ≥1–<3 MW 19,000฿ · <1 MW 3,800฿ · <250 kW with approved digital
  meter exempt; transfer = registration fee).

Originals: https://irecissuer.egat.co.th/ (EGAT I-REC Local Issuer document page).
