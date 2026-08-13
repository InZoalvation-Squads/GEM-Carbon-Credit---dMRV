# REC Program Chooser + REC Registration Track — Design

**Date:** 2026-08-13
**Status:** Approved (pending official REC form document for field content)

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
- **Field content is blocked on the official REC registration document** (I-REC(E)
  device registration, e.g. EGAT local-issuer form) which the user will supply.
  Until then the doc is scaffolded with correct metadata and empty/basic sections
  only — no invented fields, per the real-data-only policy. Filling the fields is
  the final task of the implementation plan.

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

- REC issuance/transfer/redemption (only registration).
- Official REC document export (parallel to the T-VER PDD export) — later sprint.
- Any change to Guardian policy or Hedera anchoring behavior.
