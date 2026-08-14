# REC Cover Letter Draft Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "ร่างจดหมายนำส่ง" button in REC guide phase ① that generates the official EGAT cover letter with Copy/Print, attachments derived from checklist ticks.

**Architecture:** Pure template builder (`lib/rec-cover-letter.ts`) + a small modal (`RecCoverLetterModal.tsx`) + one button in `RecGuide.tsx` phase ①. No storage, no server changes.

**Tech Stack:** React 18 + TypeScript + Tailwind, vitest + @testing-library.

**Spec:** `docs/superpowers/specs/2026-08-14-rec-cover-letter-design.md`
**Template source (real-data-only):** cover letter example, `docs/reference/rec/egat-irec-process-guide-v15.pdf` page 5 — the English wording in Task 1 is transcribed from it; do not reword.

---

### Task 1: Template builder + unit tests

**Files:**
- Create: `carbon-ready/src/lib/rec-cover-letter.ts`
- Test: `carbon-ready/src/lib/rec-cover-letter.test.ts`

- [ ] **Step 1: Write the failing tests** — create `carbon-ready/src/lib/rec-cover-letter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildRecCoverLetter } from './rec-cover-letter';

const base = { companyName: '', companyAddress: '', date: '2026-08-14', checkedIds: new Set<string>() };

describe('buildRecCoverLetter', () => {
  it('always contains subject, attention block, STC + SF-01 attachments, and the Others line', () => {
    const letter = buildRecCoverLetter(base);
    expect(letter).toContain('Subject:   Registrant Application');
    expect(letter).toContain('Director, Power Purchase Agreement Division');
    expect(letter).toContain('Electricity Generating Authority of Thailand');
    expect(letter).toContain('1. Standard Terms and Conditions I-REC Registrant in Thailand (STC) Contract (2 Copies)');
    expect(letter).toContain('2. Market Entity Application Form (SF-01)');
    expect(letter).toContain('Others (if any)');
    expect(letter).toContain('Yours sincerely,');
    expect(letter).toContain('Authorized person');
  });

  it('renders [.....] blanks when company name/address are empty', () => {
    const letter = buildRecCoverLetter(base);
    expect(letter).toContain('registrant application for [.....]');
    expect(letter).toContain('Address: [.....]');
  });

  it('interpolates company name and address when provided', () => {
    const letter = buildRecCoverLetter({
      ...base, companyName: 'Rocks Green Energy Co., Ltd.', companyAddress: '99 Moo 1, Ratchaburi 70000',
    });
    expect(letter).toContain('registrant application for Rocks Green Energy Co., Ltd.');
    expect(letter).toContain('Address: 99 Moo 1, Ratchaburi 70000');
    expect(letter).not.toContain('for [.....]');
  });

  it('adds ticked conditional attachments in guide order with running numbers', () => {
    const letter = buildRecCoverLetter({
      ...base, checkedIds: new Set(['financial', 'company-cert', 'pp20']),
    });
    expect(letter).toContain('3. Proof of company registration (Dated within the last 6 months)');
    expect(letter).toContain("4. Company's financial report (Dated within the last 12 months)");
    expect(letter).toContain('5. Copy of the VAT registration certificate (PP20)');
    expect(letter).toContain('6. Others (if any)');
    expect(letter).not.toContain('Power of Attorney');
  });

  it('includes the submission date', () => {
    expect(buildRecCoverLetter(base)).toContain('2026-08-14');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd carbon-ready && npx vitest run src/lib/rec-cover-letter.test.ts` → FAIL (module not found).

- [ ] **Step 3: Create `carbon-ready/src/lib/rec-cover-letter.ts`** with exactly:

```ts
// EGAT registrant-submission cover letter — structure and English wording
// transcribed from the official example in the EGAT I-REC Process Guide V15
// page 5 (docs/reference/rec/). Unknown values render as [.....] blanks —
// never invent data on the user's behalf (real-data-only policy).

export interface CoverLetterInput {
  companyName: string;
  companyAddress: string;
  date: string; // rendered as-is
  /** Ticked phase-1 checklist item ids from src/data/rec-guide.ts. */
  checkedIds: ReadonlySet<string>;
}

const BLANK = '[.....]';

// Conditional attachment lines in Process Guide order; STC + SF-01 always lead.
const CONDITIONAL_ATTACHMENTS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'company-cert', label: 'Proof of company registration (Dated within the last 6 months)' },
  { id: 'poa', label: 'Power of Attorney' },
  { id: 'id-copy', label: 'Copy of passport/ID card of authorized person(s)' },
  { id: 'boj34', label: 'Company Seal/Stamp Registration (BOJ.3/BOJ.4)' },
  { id: 'boj5', label: "Copy of List of shareholder's names (BOJ.5)" },
  { id: 'financial', label: "Company's financial report (Dated within the last 12 months)" },
  { id: 'pp20', label: 'Copy of the VAT registration certificate (PP20)' },
];

export function buildRecCoverLetter(input: CoverLetterInput): string {
  const name = input.companyName.trim() || BLANK;
  const address = input.companyAddress.trim() || BLANK;

  const attachmentLines = [
    'Standard Terms and Conditions I-REC Registrant in Thailand (STC) Contract (2 Copies)',
    'Market Entity Application Form (SF-01)',
    ...CONDITIONAL_ATTACHMENTS.filter((a) => input.checkedIds.has(a.id)).map((a) => a.label),
    'Others (if any) ................',
  ];
  const attachment = attachmentLines.map((l, i) => `  ${i + 1}. ${l}`).join('\n');

  return `No. ${BLANK}
${address}

${input.date}

Subject:   Registrant Application
Attention: Director, Power Purchase Agreement Division
           Electricity Generating Authority of Thailand

Attachment:
${attachment}

    I am writing to submit my registrant application for ${name}, which is the renewable energy producer or authorized person. Address: ${address}.

    I am pleased to attach herewith the STC contract and related documents for your consideration and approval.

    Please feel free to contact me if you need any further information or questions.

Yours sincerely,



(       Name Surname       )
Position
Authorized person
`;
}
```

- [ ] **Step 4: Run to verify pass** — same command → 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/lib/rec-cover-letter.ts carbon-ready/src/lib/rec-cover-letter.test.ts
git commit --no-verify -m "feat(rec): EGAT cover-letter template builder from official example"
```

---

### Task 2: Modal + RecGuide button + UI tests

**Files:**
- Create: `carbon-ready/src/components/registration/RecCoverLetterModal.tsx`
- Modify: `carbon-ready/src/components/registration/RecGuide.tsx` (phase-① links row + modal mount)
- Test: `carbon-ready/src/components/registration/recguide.ui.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `recguide.ui.test.tsx` (add `vi` to the vitest import):

```tsx
describe('cover letter draft', () => {
  it('phase 1 has a draft button that opens the letter modal; typed company name appears in the preview', () => {
    render(<RecGuide />);
    fireEvent.click(screen.getByRole('button', { name: /ร่างจดหมายนำส่ง/ }));
    expect(screen.getByText(/Registrant Application/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/ชื่อบริษัท/), { target: { value: 'Rocks Green Energy Co., Ltd.' } });
    expect(screen.getByTestId('cover-letter-preview')).toHaveTextContent('Rocks Green Energy Co., Ltd.');
  });

  it('ticked checklist items appear as attachment lines in the letter', () => {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, JSON.stringify(['company-cert']));
    render(<RecGuide />);
    fireEvent.click(screen.getByRole('button', { name: /ร่างจดหมายนำส่ง/ }));
    expect(screen.getByTestId('cover-letter-preview'))
      .toHaveTextContent('Proof of company registration');
  });

  it('Copy writes the letter to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<RecGuide />);
    fireEvent.click(screen.getByRole('button', { name: /ร่างจดหมายนำส่ง/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain('Registrant Application');
  });
});
```

(Import `waitFor` from `@testing-library/react` if not already imported in the file.)

- [ ] **Step 2: Run to verify failure** — `cd carbon-ready && npx vitest run src/components/registration/recguide.ui.test.tsx` → new tests FAIL (button missing).

- [ ] **Step 3: Create `carbon-ready/src/components/registration/RecCoverLetterModal.tsx`:**

```tsx
import { useMemo, useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { toast } from '../layout/Toast';
import { buildRecCoverLetter } from '../../lib/rec-cover-letter';

/**
 * Drafts the EGAT registrant-submission cover letter (Process Guide V15 p.5
 * official example). Ephemeral tool: nothing is persisted — the user copies
 * the text onto company letterhead or prints it.
 */
export function RecCoverLetterModal({ checkedIds, onClose }: {
  checkedIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [copied, setCopied] = useState(false);

  const letter = useMemo(
    () => buildRecCoverLetter({ companyName, companyAddress, date, checkedIds }),
    [companyName, companyAddress, date, checkedIds],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('คัดลอกไม่สำเร็จ', 'เลือกข้อความในกล่องด้านบนแล้วคัดลอกเองได้');
    }
  }

  function printLetter() {
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('เปิดหน้าพิมพ์ไม่สำเร็จ', 'เบราว์เซอร์บล็อกป๊อปอัป — อนุญาตป๊อปอัปแล้วลองใหม่');
      return;
    }
    w.document.write(`<pre style="font-family: monospace; white-space: pre-wrap; padding: 24px;">${
      letter.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    }</pre>`);
    w.document.close();
    w.print();
  }

  return (
    <Modal open onClose={onClose} title="ร่างจดหมายนำส่งถึง EGAT" size="lg">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="ชื่อบริษัท" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          <Input label="วันที่" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Textarea label="ที่อยู่บริษัท" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
        <p className="text-xs text-ink-400">
          โครงจดหมายตามตัวอย่างทางการใน EGAT Process Guide — ช่อง [.....] ให้กรอกเพิ่มใน Word/กระดาษหัวจดหมายบริษัท
        </p>
        <pre data-testid="cover-letter-preview"
          className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-4 font-mono text-xs text-ink-800 ring-1 ring-ink-200">
          {letter}
        </pre>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="secondary" onClick={printLetter}><Printer size={15} /> พิมพ์</Button>
          <Button onClick={copy}><Copy size={15} /> {copied ? 'Copied ✓' : 'Copy'}</Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 4: Wire the button into `RecGuide.tsx`:**

4a. Imports: add `FileText` to the lucide import; add `import { RecCoverLetterModal } from './RecCoverLetterModal';`.
4b. State: `const [letterOpen, setLetterOpen] = useState(false);`
4c. In the links-row render (the `phase.links` block), append INSIDE phase ① only — simplest: render the button after the links map when `phase.key === 'registrant'`:

```tsx
                      {phase.key === 'registrant' && (
                        <button
                          type="button"
                          onClick={() => setLetterOpen(true)}
                          className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50/60 px-2.5 py-1 text-[11px] font-medium text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50"
                        >
                          <FileText size={12} aria-hidden />
                          ร่างจดหมายนำส่ง
                        </button>
                      )}
```

(Phase ① has `links`, so the flex-wrap row always renders there; keep the button as the last pill in that row.)
4d. Mount the modal before the component's closing `</div>`:

```tsx
      {letterOpen && <RecCoverLetterModal checkedIds={checked} onClose={() => setLetterOpen(false)} />}
```

(`checked` is the existing `Set<string>` state in RecGuide.)

- [ ] **Step 5: Run tests** — `npx vitest run src/components/registration/recguide.ui.test.tsx` → 11/11 PASS (8 existing + 3 new). Then full SPA suite + `npx tsc -b` → green.

- [ ] **Step 6: Commit**

```bash
git add carbon-ready/src/components/registration/RecCoverLetterModal.tsx carbon-ready/src/components/registration/RecGuide.tsx carbon-ready/src/components/registration/recguide.ui.test.tsx
git commit --no-verify -m "feat(rec): draft EGAT cover letter from guide phase 1 — copy/print modal"
```

---

## Self-review notes

- **Spec coverage:** builder + blanks + attachment mapping (Task 1), modal with Copy/Print + toast failure paths (Task 2 Step 3), button wiring phase-① only (Step 4), tests per spec's Testing section (both tasks). No persistence anywhere.
- **Type consistency:** `buildRecCoverLetter`/`CoverLetterInput` names match across builder, tests, modal. `checkedIds: ReadonlySet<string>` in both. `REC_GUIDE_STORAGE_KEY` already exported from RecGuide.
- **Attachment numbering:** dynamic `i + 1` keeps the Others line last with a correct running number (asserted in the unit test).
