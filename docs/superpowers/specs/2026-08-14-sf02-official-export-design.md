# SF-02 Official Form Export — Design

**Date:** 2026-08-14
**Status:** Approved

## Goal

A registered (or in-progress) REC registration can be exported as the official
Evident **SF-02: Production Facility Registration v1.4.1** document — faithful
page-by-page layout, filled from the registration's `section_data`, printable
to PDF via the browser (same mechanism as the T-VER-S-F001-PDD export).

## Decisions (from brainstorming)

1. **Full-document fidelity**: cover page, Document Control, Contents,
   Introduction, form sections 1.1–1.8, SF-02A declaration (always), SF-02C
   owner's declaration (only when `registrant_is_owner === 'No'`). SF-02B
   (Production Groups) excluded — out of platform scope.
2. **Template registry replaces the hardcoded T-VER mapping.** The
   `/registration/:pddId/official` route currently always renders
   `TverSF001Pdd` regardless of methodology (latent bug: opening it for a REC
   pdd shows the wrong form) — fixed by a dispatcher.
3. Visual recreation uses CSS/typography only — no copied logo images. The
   Evident wordmark is styled text.
4. Template identifier: `'EVIDENT-SF-02'`.

## Source (real-data-only)

`docs/reference/rec/sf-02-production-facility-registration-v1.4.1.pdf` —
already fully transcribed into `meth-rec-solar`'s sections. Static texts
(Introduction, SF-02A/SF-02C declaration bodies, Document Control values,
footer "Version: 1.4.1 / Copyright © Evident Ev Limited / Page x/8", the
vertical sidebar "--- THIS FORM MUST BE SUBMITTED THROUGH THE EVIDENT
REGISTRY---") are transcribed from that PDF verbatim.

## Architecture

### 1. Template registry — `carbon-ready/src/templates/registry.ts`

```ts
export interface OfficialFormMeta {
  component: ComponentType<{ pddId?: string }>;
  /** Badge on the Registration methodology card. */
  badgeLabel: string;      // 'ฟอร์ม อบก.' | 'ฟอร์ม Evident'
  /** Button label on the PDD document page. */
  buttonLabel: string;     // 'เอกสารฟอร์ม อบก.' | 'เอกสารฟอร์ม Evident SF-02'
}
export const OFFICIAL_FORMS: Record<DocumentTemplate, OfficialFormMeta>
```

- `DocumentTemplate` becomes a named exported type
  (`'T-VER-S-F001-PDD' | 'EVIDENT-SF-02'`) used by `Methodology.document_template`.
- New dispatcher component `OfficialForm` (same file or `templates/OfficialForm.tsx`):
  reads `:pddId` → pdd → methodology → `OFFICIAL_FORMS[template]`; renders the
  mapped component, `EmptyState` when the methodology has no template.
- `App.tsx` route element becomes `<OfficialForm />`.
- `PddDocument.tsx` gate becomes truthiness + registry `buttonLabel`.
- `Registration.tsx` card badge uses registry `badgeLabel` (fixes the
  "ฟอร์ม อบก." mislabel that would otherwise appear on the SF-02 card).

### 2. Renderer — `carbon-ready/src/templates/EvidentSF02.tsx`

Own scope class `.sf02-doc` (rules must not collide with `.tver-doc`); reuses
the T-VER template's proven patterns: `str()` accessor over `section_data`,
`Page` table primitive (thead header / tfoot footer repeat), CSS page counter
for "Page x/8", `@media print` block (A4, `break-after: page`,
`print-color-adjust: exact`), toolbar (`print:hidden`) with back link +
`window.print()` button. English form → generic font stack (no Thai webfont
needed; cover uses a bold geometric sans approximation for "Evident.").

Page order and content:
1. **Cover** — cream (#f5efe6-ish per PDF) rounded panel: "Evident." wordmark
   text, grey "I-REC Code for Electricity", black "SF-02: Production Facility
   Registration", "Version: 1.4.1", "Release Date: 21 November 2025".
2. **Document Control** (Page I/III) — static table: EC-IRE-SF02, doc name,
   version 1.4.1, Author/Owner/Authoriser Evident, Release Date, Copyright.
3. **Contents** (Page II/III) — static 1.1–1.11 listing per the PDF.
4. **Introduction** (Page III/III) — static paragraphs per the PDF.
5. **Form pages 1–4 (of 8)** — sections 1.1–1.8 as bordered two-column tables:
   - 1.1: Date (submitted_at or blank DD/MM/YYYY boxes), Registration type —
     all four options rendered with ☑ on the selected one; Submitter status
     Yes/No with ☑.
   - 1.2: registrant contact rows incl. Additional Contact(s).
   - 1.3: facility rows; latitude/longitude as-is; **installed capacity as a
     per-digit box grid** (MW, up to 6 decimals) like the official form; meter
     ids, generating units, commissioning date (DD MM YYYY cells from the
     project record), network owner/voltage, non-grid details, volume evidence
     with the selected option marked; onsite consumer / aux sources / import
     routes / requested effective date (v1.4.1 groups these under 1.3).
   - 1.4 Energy Sources: fuel/technology code+description rows.
   - 1.5 Business Details (v1.4.1 residual: other schemes, labelling, public
     funding + finish date).
   - 1.6 Verification Agent, 1.7 Additional Information.
   - 1.8 Confirmation Signature — privacy-policy text + blank
     Signature/Name/Date rows.
   - Vertical sidebar text on every form page; footer with version/copyright/
     CSS page number.
6. **SF-02A: Registrant's Declaration** — full official text with
   `organisation_name` interpolated (blank → `[.....]`); blank signature rows.
7. **SF-02C: Owner's Declaration** — rendered **only when**
   `registrant_is_owner === 'No'`; full official text with bracketed
   placeholders left as-is except organisation name.

Fields not stored by the platform (e.g. Facility ID/code assigned by Evident,
Requested Labels) render as empty cells — faithful to a blank form field.

### 3. Wiring

- `carbon-ready/src/data/methodologies/rec-solar.ts`: add
  `document_template: 'EVIDENT-SF-02'`.
- Regenerate `server/prisma/seed-data/methodologies/meth-rec-solar.json` via
  `methodologyToJson` + `npx prisma db seed` (upsert refreshes the DB row).
- `DOCUMENT_TEMPLATES` const + zod enum in BOTH
  `carbon-ready/src/lib/methodology-schema.ts` and
  `server/src/lib/methodology-schema.ts` (copy-drift test enforces byte
  equality modulo comments/imports).
- `Methodology.document_template` union in `carbon-ready/src/types/index.ts`
  and `server/src/lib/methodology-types.ts` → the named `DocumentTemplate`
  type story: SPA exports the named type; server mirror keeps the inline union
  updated (hand-synced, per existing convention).

## Error handling

Dispatcher renders `EmptyState` for: pdd not found, methodology missing, or no
`document_template`. Renderer tolerates missing/empty section values (`'-'` or
blank cells) — never crashes on partial drafts.

## Testing

- `carbon-ready/src/templates/evident-sf02.ui.test.tsx` (pattern of
  tver-sf001.ui.test.tsx, fixture `PDD-2009` prj-0010): field values from
  `REC_SECTION_DATA` appear (org id, facility name, meter id); selected
  Registration type shows ☑ and unselected show ☐; capacity digit grid shows
  the digits; SF-02A always present; SF-02C absent when registrant_is_owner =
  'Yes' and present when mutated to 'No'; footer version text present.
- Dispatcher: REC pdd renders SF-02 template; T-VER pdd still renders the TGO
  form; pdd without template → EmptyState.
- `pdddocument.ui.test.tsx`: button appears for the REC pdd with the Evident
  label; existing T-VER button test stays green.
- `methodology-schema.test.ts`: zod accepts `'EVIDENT-SF-02'`; copy-drift
  green; existing suites green.

## Out of scope

- SF-02B Production Group pages; SF-04 export; server-side PDF generation;
  embedding uploaded evidence images into the form.
