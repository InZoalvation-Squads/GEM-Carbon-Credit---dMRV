# REC Cover Letter Draft Button — Design

**Date:** 2026-08-14
**Status:** Approved

## Goal

Phase ① of the REC onboarding guide gains a "ร่างจดหมายนำส่ง" button that
generates the EGAT registrant-submission cover letter from the official example
(Process Guide V15 page 5), prefilled with the company name/address the user
types and the attachment list derived from the phase-① checklist ticks. Output
is shown in a modal with Copy and Print actions. Nothing is persisted.

## Decisions (from brainstorming)

1. **Output format:** modal + live preview + Copy (clipboard) + Print. No file
   download this round.
2. Letter body follows the official English example verbatim in structure;
   unknown values render as `[.....]` blanks — no invented data.
3. Attachment list: STC Contract (2 copies) + SF-01 always; the conditional
   document lines (company cert, PoA, ID copy, BOJ.3/BOJ.4, BOJ.5, financial
   report, PP20) appear when their checklist item is ticked, in guide order;
   always ends with "Others (if any) ................".

## Architecture

### 1. Template builder — `carbon-ready/src/lib/rec-cover-letter.ts`

Pure function, no React:

```ts
export interface CoverLetterInput {
  companyName: string;    // '' → [.....]
  companyAddress: string; // '' → [.....]
  date: string;           // ISO date, rendered as-is
  checkedIds: ReadonlySet<string>; // phase-1 checklist item ids
}
export function buildRecCoverLetter(input: CoverLetterInput): string
```

Plain-text letter mirroring the official example: `No. [.....]` + company
address block + date → `Subject: Registrant Application` → `Attention:
Director, Power Purchase Agreement Division, Electricity Generating Authority
of Thailand` → numbered `Attachment:` list per decision 3 (labels use the
Process Guide's official English wording) → the three body paragraphs from the
example (company name/address interpolated or `[.....]`) → `Yours sincerely,` +
signature block `( Name Surname ) / Position / Authorized person`.

Checklist-id → attachment-line map (ids from `src/data/rec-guide.ts` phase 1):
`company-cert` → "Proof of company registration (Dated within the last 6
months)", `poa` → "Power of Attorney", `id-copy` → "Copy of passport/ID card of
authorized person(s)", `boj34` → "Company Seal/Stamp Registration (BOJ.3/
BOJ.4)", `boj5` → "Copy of List of shareholder's names (BOJ.5)", `financial` →
"Company's financial report (Dated within the last 12 months)", `pp20` → "Copy
of the VAT registration certificate (PP20)".

### 2. Modal — `carbon-ready/src/components/registration/RecCoverLetterModal.tsx`

Props: `{ checkedIds: ReadonlySet<string>; onClose: () => void }`. Inputs:
company name, company address (both blank by default), date (defaults to
today). Live preview of `buildRecCoverLetter(...)` in a `<pre>` with
`whitespace-pre-wrap font-mono text-xs`. Footer buttons:

- **Copy** — `navigator.clipboard.writeText(letter)`; button label flips to
  "Copied ✓" briefly; try/catch → toast error on failure.
- **พิมพ์** — opens `window.open('', '_blank')`, writes the letter inside a
  minimal `<pre>` document, calls `print()`. Guard popup-blocker null return
  with a toast.

### 3. Wiring — `RecGuide.tsx` phase ①

A "ร่างจดหมายนำส่ง" button (FileText icon, same pill styling as the download
links) rendered in phase ①'s links row; opens the modal with the current
checked-ids set. Other phases unchanged.

## Error handling

Clipboard/print failures show the existing toast error; empty inputs simply
render `[.....]` — the letter is always generatable.

## Testing

- Unit (`rec-cover-letter.test.ts`): company name/address interpolation and
  `[.....]` fallbacks; STC + SF-01 always present; ticked ids add their exact
  official lines in order; unticked ids absent; ends with the Others line;
  contains the Attention line.
- UI (extend `recguide.ui.test.tsx` or a dedicated file): button opens the
  modal; typing a company name updates the preview; Copy writes the letter to a
  mocked `navigator.clipboard`.

## Out of scope

- File download (.docx/.txt), Thai-language letter variant, persisting inputs,
  letterhead/logo rendering, cover letters for the SF-02/SF-04 phases.
