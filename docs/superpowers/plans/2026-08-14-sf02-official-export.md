# SF-02 Official Form Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export a REC registration as the official Evident SF-02 v1.4.1 document (faithful page layout, browser print → PDF), via a template registry that also fixes the hardcoded T-VER-only official route.

**Architecture:** Task 1 refactors the hardcoded template mapping into `templates/registry.ts` + an `OfficialForm` dispatcher (behavior-preserving for T-VER). Task 2 adds the `EvidentSF02` renderer + the `'EVIDENT-SF-02'` template value across the type/zod/seed plumbing and wires it to `meth-rec-solar`.

**Tech Stack:** React 18 + TypeScript + Tailwind + inline print CSS (`window.print()`), vitest + @testing-library.

**Spec:** `docs/superpowers/specs/2026-08-14-sf02-official-export-design.md`
**Layout source (read it before writing the renderer):** `docs/reference/rec/sf-02-production-facility-registration-v1.4.1.pdf` (12 pages — use the Read tool on the PDF).
**Pattern source (study before both tasks):** `carbon-ready/src/templates/TverSF001Pdd.tsx` (945 lines) — reuse its idioms: `str()` accessor (line ~296), `Page` table primitive with thead/tfoot repeat (~87), `Check` ☑/☐ row (~32), toolbar with `window.print()` (~325), scoped inline `<style>` block with CSS page counter + `@media print` A4 rules (~904-940). Test pattern: `carbon-ready/src/templates/tver-sf001.ui.test.tsx`.

**Codebase facts:**
- Route: `carbon-ready/src/App.tsx:48` `<Route path="/registration/:pddId/official" element={<TverSF001Pdd />} />` — always T-VER today (latent wrong-form bug for REC pdds).
- Gate: `carbon-ready/src/pages/PddDocument.tsx:44` `methodology.document_template === 'T-VER-S-F001-PDD'`.
- Badge: `carbon-ready/src/pages/Registration.tsx:133-135` truthiness → hardcoded "ฟอร์ม อบก.".
- Type: `carbon-ready/src/types/index.ts:423` `document_template?: 'T-VER-S-F001-PDD';` — server mirror `server/src/lib/methodology-types.ts:98` (hand-synced).
- Zod: `DOCUMENT_TEMPLATES` const at `carbon-ready/src/lib/methodology-schema.ts:24` + enum at :97; byte-identical copy at `server/src/lib/methodology-schema.ts:29`/:102 — **copy-drift test enforces equality modulo comments/imports**.
- REC methodology: `carbon-ready/src/data/methodologies/rec-solar.ts` (no template yet). Seed JSON must be regenerated via `methodologyToJson` after adding it (same command as in docs/superpowers/plans/2026-08-14-rec-issuance.md Task 3 pattern):
  `cd carbon-ready && npx tsx -e "import { writeFileSync } from 'node:fs'; import { REC_SOLAR_METHODOLOGY } from './src/data/methodologies/rec-solar'; import { methodologyToJson } from './src/lib/methodology-schema'; writeFileSync('../server/prisma/seed-data/methodologies/meth-rec-solar.json', methodologyToJson(REC_SOLAR_METHODOLOGY) + '\n');"`
- Fixtures: `PDD-2009` on project `prj-0010` (REC registered) with `REC_SECTION_DATA` (`carbon-ready/src/test/demoFixtures.ts:80-85`, `evident_org_id: 'EVID-000456'`); T-VER official fixture is `PDD-2000`.
- CSS scoping: T-VER's style block is global but every rule is `.tver-doc`-prefixed — the new template MUST use `.sf02-doc` prefixes throughout (both style blocks can mount in one session).
- Gating tests: `carbon-ready/src/pages/pdddocument.ui.test.tsx:36-45`.

---

### Task 1: Template registry + dispatcher (behavior-preserving refactor)

**Files:**
- Create: `carbon-ready/src/templates/registry.ts`
- Create: `carbon-ready/src/templates/OfficialForm.tsx`
- Modify: `carbon-ready/src/types/index.ts:423` (named `DocumentTemplate` type)
- Modify: `carbon-ready/src/App.tsx:48` (route element)
- Modify: `carbon-ready/src/pages/PddDocument.tsx:44-49` (registry-driven button)
- Modify: `carbon-ready/src/pages/Registration.tsx:133-135` (registry-driven badge)
- Test: `carbon-ready/src/templates/officialform.ui.test.tsx` (new)

- [ ] **Step 1: Failing tests** — create `carbon-ready/src/templates/officialform.ui.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OfficialForm } from './OfficialForm';
import { seedDemo } from '../test/demoFixtures';

beforeEach(() => { localStorage.clear(); seedDemo(); });

function renderAt(pddId: string) {
  return render(
    <MemoryRouter initialEntries={[`/registration/${pddId}/official`]}>
      <Routes><Route path="/registration/:pddId/official" element={<OfficialForm />} /></Routes>
    </MemoryRouter>,
  );
}

describe('OfficialForm dispatcher', () => {
  it('renders the T-VER form for a T-VER-S-F001-PDD methodology pdd', () => {
    renderAt('PDD-2000');
    // T-VER template renders the TGO form code somewhere on every page
    expect(screen.getAllByText(/T-VER/).length).toBeGreaterThan(0);
  });

  it('shows an empty state for a pdd whose methodology has no template', () => {
    renderAt('PDD-2005'); // forestry — no document_template
    expect(screen.getByText(/ไม่มีฟอร์มทางการ|No official form/i)).toBeInTheDocument();
  });

  it('shows an empty state for an unknown pdd id', () => {
    renderAt('PDD-nope');
    expect(screen.getByText(/not found|ไม่พบ/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd carbon-ready && npx vitest run src/templates/officialform.ui.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Named type** — in `carbon-ready/src/types/index.ts` replace the inline union (line ~423):

```ts
/** Official-form renderers registered per methodology (template-per-form). */
export type DocumentTemplate = 'T-VER-S-F001-PDD';

  /** Official-form renderer registered for this methodology (template-per-form). */
  document_template?: DocumentTemplate;
```

(Keep the Methodology field comment; the union gains `'EVIDENT-SF-02'` in Task 2. Server mirror `methodology-types.ts` is updated in Task 2 together with the value — no server change in Task 1.)

- [ ] **Step 4: Registry** — create `carbon-ready/src/templates/registry.ts`:

```ts
import type { ComponentType } from 'react';
import type { DocumentTemplate } from '../types';
import { TverSF001Pdd } from './TverSF001Pdd';

export interface OfficialFormMeta {
  component: ComponentType<{ pddId?: string }>;
  /** Badge text on the Registration methodology card. */
  badgeLabel: string;
  /** Button label on the PDD document page. */
  buttonLabel: string;
}

/** Template-per-form registry — single source for route + button + badge. */
export const OFFICIAL_FORMS: Record<DocumentTemplate, OfficialFormMeta> = {
  'T-VER-S-F001-PDD': {
    component: TverSF001Pdd,
    badgeLabel: 'ฟอร์ม อบก.',
    buttonLabel: 'เอกสารฟอร์ม อบก.',
  },
};
```

- [ ] **Step 5: Dispatcher** — create `carbon-ready/src/templates/OfficialForm.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { useStore } from '../store';
import { EmptyState } from '../components/ui/EmptyState';
import { OFFICIAL_FORMS } from './registry';

/** Route element for /registration/:pddId/official — picks the renderer
 *  registered for the pdd's methodology (template-per-form). */
export function OfficialForm() {
  const { pddId } = useParams();
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));

  if (!pdd || !methodology) {
    return <EmptyState title="PDD not found / ไม่พบเอกสาร" hint="ลิงก์อาจหมดอายุหรือเอกสารถูกลบ" />;
  }
  if (!methodology.document_template) {
    return <EmptyState title="No official form / ไม่มีฟอร์มทางการ" hint="Methodology นี้ยังไม่มี template ฟอร์มทางการ" />;
  }
  const Renderer = OFFICIAL_FORMS[methodology.document_template].component;
  return <Renderer pddId={pdd.id} />;
}
```

- [ ] **Step 6: Rewire consumers.**
- `App.tsx`: replace the `TverSF001Pdd` import with `import { OfficialForm } from './templates/OfficialForm';` and the route element with `<OfficialForm />`.
- `PddDocument.tsx` lines 44-49: replace the `===` gate with:

```tsx
{methodology.document_template && (
  <Link to={`/registration/${pdd.id}/official`}>
    <Button variant="ghost"><FileText size={16} /> {OFFICIAL_FORMS[methodology.document_template].buttonLabel}</Button>
  </Link>
)}
```

(import `OFFICIAL_FORMS` from `../templates/registry`.)
- `Registration.tsx` lines 133-135: badge text becomes `{OFFICIAL_FORMS[m.document_template].badgeLabel}` (keep the violet pill classes; import the registry).

- [ ] **Step 7: Run** — dispatcher tests PASS; then `npx vitest run src/pages/ src/templates/` (existing tver-sf001 + pdddocument tests must stay green) and `npx tsc -b`.

- [ ] **Step 8: Commit**

```bash
git add carbon-ready/src/templates/registry.ts carbon-ready/src/templates/OfficialForm.tsx carbon-ready/src/templates/officialform.ui.test.tsx carbon-ready/src/types/index.ts carbon-ready/src/App.tsx carbon-ready/src/pages/PddDocument.tsx carbon-ready/src/pages/Registration.tsx
git commit --no-verify -m "refactor(templates): official-form registry + dispatcher (fixes REC pdd hitting the T-VER form)"
```

---

### Task 2: EvidentSF02 renderer + `'EVIDENT-SF-02'` plumbing

**Files:**
- Create: `carbon-ready/src/templates/EvidentSF02.tsx`
- Modify: `carbon-ready/src/templates/registry.ts` (new entry)
- Modify: `carbon-ready/src/types/index.ts` (`DocumentTemplate` union + value)
- Modify: `server/src/lib/methodology-types.ts:98` (mirror union)
- Modify: `carbon-ready/src/lib/methodology-schema.ts:24` + `server/src/lib/methodology-schema.ts:29` (`DOCUMENT_TEMPLATES` gains `'EVIDENT-SF-02'` — keep byte-identical)
- Modify: `carbon-ready/src/data/methodologies/rec-solar.ts` (`document_template: 'EVIDENT-SF-02',` after `sectoral_scope`)
- Regenerate: `server/prisma/seed-data/methodologies/meth-rec-solar.json`
- Test: `carbon-ready/src/templates/evident-sf02.ui.test.tsx` (new), `carbon-ready/src/pages/pdddocument.ui.test.tsx` (+1 test), `carbon-ready/src/lib/methodology-schema.test.ts` (+1 case)

- [ ] **Step 1: Read the reference PDF** — `Read docs/reference/rec/sf-02-production-facility-registration-v1.4.1.pdf` (all 12 pages). Every static text below was transcribed from it; verify while building and keep wording verbatim.

- [ ] **Step 2: Failing tests** — create `carbon-ready/src/templates/evident-sf02.ui.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvidentSF02 } from './EvidentSF02';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => { localStorage.clear(); seedDemo(); });
const renderForm = () => render(<MemoryRouter><EvidentSF02 pddId="PDD-2009" /></MemoryRouter>);

describe('Evident SF-02 official form', () => {
  it('renders cover + document control + footer identity', () => {
    renderForm();
    expect(screen.getAllByText(/I-REC Code for Electricity/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/SF-02: Production Facility Registration/).length).toBeGreaterThan(0);
    expect(screen.getByText('EC-IRE-SF02')).toBeInTheDocument();
    expect(screen.getAllByText(/Copyright © Evident Ev Limited/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Version: 1.4.1/).length).toBeGreaterThan(0);
  });

  it('fills registrant/facility values from section_data', () => {
    renderForm();
    expect(screen.getByText('EVID-000456')).toBeInTheDocument(); // evident_org_id
    // facility name / meter id per REC_SECTION_DATA in demoFixtures — assert the exact fixture values
  });

  it('marks the selected registration type and Yes/No answers with ☑', () => {
    renderForm();
    const newOpt = screen.getByText(/☑ New|New/); // adapt to the Check row rendering
    expect(newOpt).toBeInTheDocument();
    // registrant_is_owner in fixture — assert its ☑ matches, and the opposite option shows ☐
  });

  it('renders installed capacity as per-digit boxes', () => {
    renderForm();
    expect(screen.getByTestId('capacity-grid')).toBeInTheDocument();
  });

  it('always shows SF-02A; shows SF-02C only when registrant is not the owner', () => {
    renderForm();
    expect(screen.getByText(/SF-02A: Registrant.s Declaration/)).toBeInTheDocument();
    expect(screen.queryByText(/SF-02C: Owner.s Declaration/)).toBeNull(); // fixture is 'Yes'
    const pdd = useStore.getState().pdds.find((p) => p.id === 'PDD-2009')!;
    pdd.section_data = { ...pdd.section_data, registrant_is_owner: 'No' };
    renderForm();
    expect(screen.getByText(/SF-02C: Owner.s Declaration/)).toBeInTheDocument();
  });
});
```

(Concretize the fixture-value assertions after reading `REC_SECTION_DATA` in `demoFixtures.ts` — assert exact strings that exist there. Follow tver-sf001.ui.test.tsx patterns: `getAllByText` for per-page repeats.)

- [ ] **Step 3: Run to verify failure.**

- [ ] **Step 4: Build `EvidentSF02.tsx`.** Structure (study TverSF001Pdd first; reuse its idioms under `.sf02-doc` scoping):

**Component skeleton:** props `{ pddId?: string }` + `useParams` fallback; pull `pdd/methodology/project` from the store; `EmptyState` guards; `const d = pdd.section_data as Record<string, unknown>`; helpers `str(k)` ('' for blank — SF-02 shows empty cells, not '-'), `sel(k, option)` → boolean for ☑.

**Local primitives:**
- `Check({ on, label })` → `<span className="whitespace-nowrap">{on ? '☑' : '☐'} {label}</span>`
- `Page({ children, pageNo })` — table with `thead` (right-aligned two-line header: bold "Evident . I-REC Code for Electricity" / "SF-02: Production Facility Registration"), `tbody` children, `tfoot` footer row: `Version: 1.4.1` · `Copyright © Evident Ev Limited` · `Page <span className="pageno" />` (CSS counter). Include the vertical sidebar via an absolutely-positioned rotated div inside the page frame: `--- THIS FORM MUST BE SUBMITTED THROUGH THE EVIDENT REGISTRY---`.
- `SectionHead({ no, title })` — the bordered section header row (e.g. "1.1  SF-02: Production Facility Registration") + italic hint row ("Complete all fields.").
- `Row({ label, children, labelWidth? })` — two-column bordered row.
- `DateCells({ iso })` — three cells DD | MM | YYYY (grey placeholder text when blank).
- `DigitGrid({ value })` — `data-testid="capacity-grid"`; splits `installed_capacity_mw` into integer digits | separator | up to 6 decimals as individual bordered boxes, "MW" label + "Up to 6 decimal places" hint, like the PDF.

**Pages (in order):**
1. Cover — cream panel (`background:#f5efe6; border-radius: 0 0 40% 0/0 0 12% 0` approximation is fine; keep it simple: rounded corner top-right), "Evident ." huge bold, "I-REC Code for Electricity" grey bold, "SF-02: Production Facility Registration" black bold, then "Version: 1.4.1" / "Release Date: 21 November 2025".
2. Document Control (footer page "Page I/III" — for the roman pages hardcode the footer text instead of the counter): tables → `Document ID: EC-IRE-SF02`; `Document Name: Evident. I-REC Code for Electricity / SF-02: Production Facility Registration`; `Version: 1.4.1`; `Author: Evident / Owner: Evident Ev Limited / Authoriser: Evident`; `Release Date: 21 November 2025`; heading `Copyright` + line `This document is Copyright © Evident Ev Limited`.
3. Contents (Page II/III) — static list: `1. INTRODUCTION … III`, `1.1 SF-02: Production Facility Registration … 1`, `1.2 Registrant Contact Details … 1`, `1.3 Production Facility Details … 2`, `1.4 Energy Sources … 3`, `1.5 Business Details … 4`, `1.6 Verification Agent … 4`, `1.7 Additional Information … 4`, `1.8 Confirmation Signature … 5`, `1.9 SF-02A: Registrant's Declaration … 5`, `1.10 SF-02B: Production Group Template … 7`, `1.11 SF-02C: Owner's Declaration … 8`.
4. Introduction (Page III/III) — the five paragraphs from PDF page III verbatim ("The following multi-part form included within this document is to be used by all Registrants wishing to register Production Facilities. …" through "…preserve the integrity for the I-REC(E) market.").
5. Form page 1 (numbered pages use the CSS counter "Page x/8" — set `counter-reset` so the first form page shows 1): §1.1 (Date = `pdd.submitted_at` via DateCells or blanks; Registration type row rendering all four `Check`s: New / Change of details / Renewal / Transfer; Submitter status row with the italic hint text and Yes/No checks from `registrant_is_owner`) + §1.2 rows: Organisation ID/code (`evident_org_id`), Organisation name, Contact person, Business address *(including postal or zip code)*, Country, e-mail, Telephone, Additional Contact(s) with its italic hint.
6. Form page 2: §1.3 rows: Facility name, Facility address, Country, Latitude (±n.nnnnnn), Longitude, Installed capacity → `DigitGrid`, Meter or Measurement ID(s) with serial-number hint, Number of generating units with inverter hint, Commissioning date → `DateCells(project.commission_date)`, Network owner + voltage, non-grid circumstances.
7. Form page 3: §1.3 continued (Expected form of volume evidence — three `Check`s Metering data / Contract sales invoice / Other + `volume_evidence_other` text; onsite consumer Yes/No + details; aux sources Yes/No + details; import routes; Requested effective date with the Residual-Mix hint → DateCells) + §1.4 Energy Sources (fuel code/description, technology code/description, SD-02 hint row).
8. Form page 4: §1.5 (other schemes, labelling schemes, public funding — `Check`s No / Investment / Production + finish DateCells) + §1.6 Verification Agent + §1.7 Additional Information + §1.8 Confirmation Signature (privacy text: "By submitting this form I confirm acceptance of Evident's Privacy Policy, as published on https://evident.global/privacy-policy and any such policies as published by the responsible Issuer." + "I acknowledge and agree that the information provided will be used by Evident for the purpose of providing services relating to I-REC Electricity certificates and that Evident may share this information with other organisations as may be necessary for the provision of these services." + blank Signature / Name *(BLOCK CAPITALS)* / Date rows).
9. SF-02A page — heading `1.9 SF-02A: Registrant's Declaration`, italic instruction block, then the declaration with `organisation_name` interpolated: "On behalf of the Registrant, {org}, I agree to be subject to the I-REC Code for Electricity and warrant that the information contained in this application is truthful and exhaustive." + the planned-changes paragraph + unannounced-audit paragraph + the no-double-counting paragraph ("I confirm that all necessary permissions of the Production Facility Owner have been granted to the Registrant and we therefore undertake that, for the same units of electrical energy, our organisation will not receive or apply for any certificates or other instruments representing the associated renewable or carbon attributes or the calculated displacement ('offset') of these attributes from the electricity production. We also, to the best of our knowledge, have the right to separate renewable attributes from the associated physical electricity generation and are not required by legislation or contract to retain these attributes for any reason.") + blank Signature/Name/Date rows. **Copy the paragraphs verbatim from PDF pages 5-6.**
10. SF-02C page — rendered only when `str('registrant_is_owner') === 'No'`: heading `1.11 SF-02C: Owner's Declaration`, italic instruction block, "To: Evident / 400 Springvale Road / Sheffield / S10 1LP / United Kingdom", "Date: [insert date here]", underlined "Declaration of Attribute Generation and Ownership", the three paragraphs from PDF page 8 with `[insert Registrant organisation name here]` replaced by `organisation_name` and facility placeholder replaced by `facility_name` (other bracketed placeholders stay literal), "Yours sincerely," + "On behalf of [insert owner name here]".

**Toolbar + style:** copy the T-VER toolbar shape (back link to `/registration/${pdd.id}/document`, Print/PDF button, `print:hidden`) and the whole `<style>` block re-prefixed `.sf02-doc` (font-family can drop the Thai-first stack; keep `print-color-adjust`, counter, `.doc-table` borders, `@media print` A4 + break rules + `.page-frame{height:265mm}`).

- [ ] **Step 5: Plumb the template value.**
- `types/index.ts`: `export type DocumentTemplate = 'T-VER-S-F001-PDD' | 'EVIDENT-SF-02';`
- `server/src/lib/methodology-types.ts:98`: `document_template?: 'T-VER-S-F001-PDD' | 'EVIDENT-SF-02';`
- Both `methodology-schema.ts` files: `const DOCUMENT_TEMPLATES = ['T-VER-S-F001-PDD', 'EVIDENT-SF-02'] as const;` (identical lines).
- `registry.ts`: add

```ts
  'EVIDENT-SF-02': {
    component: EvidentSF02,
    badgeLabel: 'ฟอร์ม Evident',
    buttonLabel: 'เอกสารฟอร์ม Evident SF-02',
  },
```

- `rec-solar.ts`: `document_template: 'EVIDENT-SF-02',` after `sectoral_scope` — then regenerate the seed JSON (command in the header) and run `cd server && npx prisma db seed`.

- [ ] **Step 6: Extra tests.**
- `methodology-schema.test.ts`: add a case accepting `document_template: 'EVIDENT-SF-02'` (mirror the existing T-VER acceptance at ~:80).
- `pdddocument.ui.test.tsx`: add — PDD-2009 shows the "เอกสารฟอร์ม Evident SF-02" button.
- `officialform.ui.test.tsx`: add — `renderAt('PDD-2009')` renders the SF-02 form (`EC-IRE-SF02` visible).

- [ ] **Step 7: Verify.** `npx vitest run src/templates/ src/pages/ src/lib/methodology-schema.test.ts` → green; full SPA suite green; `npx tsc -b` clean; `cd server && npx vitest run src/lib/copy-drift.test.ts src/seed.test.ts src/modules/methodologies/methodologies.test.ts` → green; `npm run build` (carbon-ready) clean.

- [ ] **Step 8: Commit**

```bash
git add carbon-ready/src/templates/EvidentSF02.tsx carbon-ready/src/templates/registry.ts carbon-ready/src/templates/evident-sf02.ui.test.tsx carbon-ready/src/templates/officialform.ui.test.tsx carbon-ready/src/types/index.ts server/src/lib/methodology-types.ts carbon-ready/src/lib/methodology-schema.ts server/src/lib/methodology-schema.ts carbon-ready/src/lib/methodology-schema.test.ts carbon-ready/src/data/methodologies/rec-solar.ts server/prisma/seed-data/methodologies/meth-rec-solar.json carbon-ready/src/pages/pdddocument.ui.test.tsx
git commit --no-verify -m "feat(rec): Evident SF-02 official form export — faithful v1.4.1 layout, print to PDF"
```

---

## Self-review notes

- **Spec coverage:** registry+dispatcher+label fixes (T1 = spec §1), renderer pages 1-10 incl. digit grid, sidebar, SF-02A/02C conditional (T2 Step 4 = spec §2), plumbing + seed regen (T2 Step 5 = spec §3), error handling in dispatcher/renderer guards, all spec test bullets across Steps 1/2/6.
- **Type consistency:** `DocumentTemplate` named type introduced T1, extended T2; `OFFICIAL_FORMS` keys match; `EvidentSF02` prop `{ pddId?: string }` matches registry `ComponentType` signature and the dispatcher call.
- **Static-text fidelity:** implementer is required to Read the PDF (T2 Step 1) and keep wording verbatim — the plan quotes the key paragraphs but the PDF is the authority.
