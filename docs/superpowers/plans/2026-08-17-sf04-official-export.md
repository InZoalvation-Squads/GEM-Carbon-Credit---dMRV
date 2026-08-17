# SF-04 Official Form Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export any REC issue request as the official Evident SF-04 v1.2.1 document (print → PDF), reachable from an SF-04 button on every REC Issuance row.

**Architecture:** One renderer (`EvidentSF04.tsx`, `.sf04-doc` scope) cloned from the proven `EvidentSF02.tsx` idioms, a tiny route guard (`RecIssueOfficialForm.tsx`), one route, one row button. No registry/server changes.

**Tech Stack:** React 18 + TypeScript + Tailwind + `window.print()`, vitest + @testing-library.

**Spec:** `docs/superpowers/specs/2026-08-17-sf04-official-export-design.md`
**Layout source (Read it first):** `docs/reference/rec/sf-04-issue-request-v1.2.1.pdf` (10 pages) — all static text verbatim from here.
**Pattern source (study first):** `carbon-ready/src/templates/EvidentSF02.tsx` — copy its Page/Check/DateCells/DigitGrid/SectionHead/Row primitives, toolbar, and `<style>` block, re-scoped `.sf04-doc` with counter `sf04page` and footer "Page x/5" (the SF-04 PDF's form-page footers read "Version: 1.2" — keep that exact string in the form-page footer; the cover/control pages say 1.2.1).

**Codebase facts:**
- Store slice: `s.recIssues` (`RecIssueRequest` in `carbon-ready/src/types/index.ts` — fields: request_type, period_start/end, total_production_mwh, applied_mwh, facility_snapshot {evident_org_id, organisation_name, facility_name, fuel_code, fuel_description, technology_code, technology_description}, receiving_org_name, receiving_account_id, submitted_at, state).
- Fixtures (`carbon-ready/src/test/demoFixtures.ts`): RIR-1000 issued 6 MWh (Mar 2026), RIR-1001 draft 0.999 MWh (Feb 2026), both on prj-0010 with snapshot org 'EVID-000456' — read the file for exact values before writing assertions.
- Routes region: `carbon-ready/src/App.tsx` inside RequireAuth/AppShell, next to `/rec-issuance`.
- RecIssuance actions column: `carbon-ready/src/pages/RecIssuance.tsx` rows (~line 149+); `Link` from react-router-dom; FileText from lucide.
- Test template: `carbon-ready/src/templates/evident-sf02.ui.test.tsx` + `officialform.ui.test.tsx` patterns (seedDemo, MemoryRouter, getAllByText for per-page repeats).

---

### Task 1: EvidentSF04 renderer + route + button (TDD)

**Files:**
- Create: `carbon-ready/src/templates/EvidentSF04.tsx`
- Create: `carbon-ready/src/templates/RecIssueOfficialForm.tsx`
- Modify: `carbon-ready/src/App.tsx` (route)
- Modify: `carbon-ready/src/pages/RecIssuance.tsx` (row button)
- Test: `carbon-ready/src/templates/evident-sf04.ui.test.tsx` (new), `carbon-ready/src/pages/recissuance.ui.test.tsx` (+1)

- [ ] **Step 1: Read the PDF** — all 10 pages of `docs/reference/rec/sf-04-issue-request-v1.2.1.pdf`. Transcribe static text verbatim while building: Document Control (EC-IRE-SF04, v1.2.1, Release 21 November 2025), Contents (1.1 SF-04: Issue Request …1 / 1.2 Registrant and Facility Details …1 / 1.3 Production Details …1 / 1.4 Energy Sources …2 / 1.5 Production Auditor …2 / 1.6 Receiving Account Details …2 / 1.7 SF-04A: Issuing Declaration …3 / 1.8 SF-04B: Production Group Statement …3 / 1.9 SF-04C: Fuel Consumption Statement …5 / 1.10 Production Auditor …5), Introduction paragraphs, the italic note "Unless explicitly confirmed otherwise, I-REC(E) for multi-fuel generators shall only be issued for that portion of electricity production derived from renewable sources.", §1.5 auditor preamble, §1.6 hint "(Participant, Platform Operator, or self-consumption)", SF-04A both declaration paragraphs.

- [ ] **Step 2: Failing tests** — create `carbon-ready/src/templates/evident-sf04.ui.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvidentSF04 } from './EvidentSF04';
import { RecIssueOfficialForm } from './RecIssueOfficialForm';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => { localStorage.clear(); seedDemo(); });
const renderForm = (id: string) => render(<MemoryRouter><EvidentSF04 recIssueId={id} /></MemoryRouter>);

describe('Evident SF-04 official form', () => {
  it('renders cover + document control + footer identity', () => {
    renderForm('RIR-1000');
    expect(screen.getAllByText(/SF-04: Issue Request/).length).toBeGreaterThan(0);
    expect(screen.getByText('EC-IRE-SF04')).toBeInTheDocument();
    expect(screen.getAllByText(/Copyright © Evident Ev Limited/).length).toBeGreaterThan(0);
  });

  it('fills registrant/facility/receiving values from the request', () => {
    renderForm('RIR-1000');
    expect(screen.getByText('EVID-000456')).toBeInTheDocument();
    // + assert organisation_name / facility_name / receiving_org_name /
    //   receiving_account_id with the EXACT strings found in demoFixtures.ts
  });

  it('marks the request type with ☑ and shows the MWh digit grid', () => {
    renderForm('RIR-1000');
    expect(screen.getByTestId('mwh-grid')).toBeInTheDocument();
    // fixture RIR-1000 is 'Normal' → assert ☑ Normal row text and ☐ Self consumption
  });

  it('always shows SF-04A and never renders SF-04B/SF-04C pages (Contents may list them)', () => {
    renderForm('RIR-1000');
    expect(screen.getAllByText(/SF-04A: Issuing Declaration/).length).toBeGreaterThan(0);
    // SF-04B/C appear exactly once each — the Contents line — never as section headings
    expect(screen.getAllByText(/SF-04B: Production Group Statement/)).toHaveLength(1);
    expect(screen.getAllByText(/SF-04C: Fuel Consumption Statement/)).toHaveLength(1);
  });
});

describe('RecIssueOfficialForm guard', () => {
  it('renders the form for a known id and an empty state for an unknown one', () => {
    render(<MemoryRouter><RecIssueOfficialForm recIssueId="RIR-1000" /></MemoryRouter>);
    expect(screen.getByText('EC-IRE-SF04')).toBeInTheDocument();
    render(<MemoryRouter><RecIssueOfficialForm recIssueId="RIR-nope" /></MemoryRouter>);
    expect(screen.getByText(/not found|ไม่พบ/i)).toBeInTheDocument();
  });
});
```

And append to `carbon-ready/src/pages/recissuance.ui.test.tsx`:

```tsx
  it('every row links to its official SF-04 document', () => {
    renderPage();
    const links = screen.getAllByRole('link', { name: /SF-04/ });
    expect(links.length).toBeGreaterThanOrEqual(2); // RIR-1000 + RIR-1001
    expect(links[0]).toHaveAttribute('href', expect.stringMatching(/\/rec-issuance\/RIR-\d+\/official$/));
  });
```

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Build `EvidentSF04.tsx`** — clone the EvidentSF02 primitives (Page/Check/DateCells/DigitGrid/SectionHead/Row + toolbar + style block) re-scoped `.sf04-doc`, counter `sf04page`, form-page footer "Version: 1.2 · Copyright © Evident Ev Limited · Page x/5". Component reads `const rec = useStore((s) => s.recIssues.find((r) => r.id === recIssueId))` (+ `useParams` fallback via prop pattern identical to EvidentSF02) and the project name for the back link (`/rec-issuance`). Pages: cover ("Evident. / I-REC Code for Electricity / SF-04: Issue Request / Version: 1.2.1 / Release Date: 21 November 2025") → Document Control (I/III) → Contents (II/III) → Introduction (III/III) → form page 1 (§1.1 Date=submitted_at DateCells + Request type Checks; §1.2 org id/name from snapshot, Facility ID blank, facility name, Requested Labels blank with its italic hint; §1.3 period DateCells + Total production `DigitGrid` `data-testid="mwh-grid"` + I-REC(E) applied-for grid (blank boxes when null, hint "(if blank the above amount will be issued on approval)") + the multi-fuel italic note) → form page 2 (§1.4 fuel/tech from snapshot with the SF-04C-mention hint verbatim; §1.5 Production Auditor static preamble + blank rows; §1.6 Receiving Account with hint + values) → SF-04A page (instruction block + both declaration paragraphs verbatim + blank Signature/Name (BLOCK CAPITALS)/Date rows). Sidebar vertical text on form pages.

- [ ] **Step 5: `RecIssueOfficialForm.tsx`:**

```tsx
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { EmptyState } from '../components/ui/EmptyState';
import { EvidentSF04 } from './EvidentSF04';

/** Route element for /rec-issuance/:id/official. */
export function RecIssueOfficialForm({ recIssueId }: { recIssueId?: string }) {
  const params = useParams();
  const id = recIssueId ?? params.id;
  const rec = useStore((s) => s.recIssues.find((r) => r.id === id));
  if (!rec) return <EmptyState title="Issue request not found / ไม่พบคำขอ" hint="ลิงก์อาจหมดอายุหรือคำขอถูกลบ" />;
  return <EvidentSF04 recIssueId={rec.id} />;
}
```

- [ ] **Step 6: Route + button.** `App.tsx`: `<Route path="/rec-issuance/:id/official" element={<RecIssueOfficialForm />} />` next to the `/rec-issuance` route. `RecIssuance.tsx` actions cell — ALWAYS-rendered link before the state-conditional buttons:

```tsx
<Link to={`/rec-issuance/${r.id}/official`} title="เอกสารฟอร์ม Evident SF-04">
  <Button size="sm" variant="ghost"><FileText size={14} /> SF-04</Button>
</Link>
```

(imports: `Link` from react-router-dom, `FileText` from lucide-react; keep the existing flex layout — the actions cell must render this link for every state.)

- [ ] **Step 7: Run** — new test files green, `npx vitest run src/templates/ src/pages/` green, full SPA suite green, `npx tsc -b` clean, `npm run build` clean.

- [ ] **Step 8: Commit**

```bash
git add carbon-ready/src/templates/EvidentSF04.tsx carbon-ready/src/templates/RecIssueOfficialForm.tsx carbon-ready/src/templates/evident-sf04.ui.test.tsx carbon-ready/src/App.tsx carbon-ready/src/pages/RecIssuance.tsx carbon-ready/src/pages/recissuance.ui.test.tsx
git commit --no-verify -m "feat(rec): Evident SF-04 official form export — button on every issuance row"
```

---

## Self-review notes

- **Spec coverage:** renderer pages + field mapping (Step 4 = spec §1), guard/route (Step 5-6 = spec §2), row button all states (Step 6 = spec §3), error handling (guard EmptyState + blank cells), all spec test bullets (Step 2).
- **Type consistency:** `EvidentSF04` prop `recIssueId` matches guard usage and tests; store slice name `recIssues`; fixture ids RIR-1000/1001.
- **Fidelity:** PDF is authority (Step 1); footer version-string nuance (1.2 on form pages vs 1.2.1 on control page) called out explicitly.
