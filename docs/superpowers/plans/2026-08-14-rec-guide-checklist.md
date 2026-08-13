# REC Onboarding Guide + Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a 3-phase REC registration guide with a tickable, localStorage-persisted document checklist on the REC track of the Register Project page.

**Architecture:** One content data file (`rec-guide.ts`, typed constants, no logic) + one self-contained component (`RecGuide.tsx`, accordion + checkbox state + localStorage) rendered by `Registration.tsx` only when `program === 'rec'`. No backend, no store changes.

**Tech Stack:** React 18 + TypeScript + Tailwind (existing idioms), vitest + @testing-library.

**Spec:** `docs/superpowers/specs/2026-08-14-rec-guide-checklist-design.md`
**Content source (real-data-only):** `docs/reference/rec/egat-irec-process-guide-v12.pdf` + `sf-02-production-facility-registration-v1.3.pdf` — the strings in Task 1 were transcribed from these; do not paraphrase or add items.

---

### Task 1: Content data + RecGuide component + tests

**Files:**
- Create: `carbon-ready/src/data/rec-guide.ts`
- Create: `carbon-ready/src/components/registration/RecGuide.tsx`
- Test: `carbon-ready/src/components/registration/recguide.ui.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `carbon-ready/src/components/registration/recguide.ui.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecGuide, REC_GUIDE_STORAGE_KEY } from './RecGuide';

beforeEach(() => localStorage.clear());

describe('RecGuide — 3-phase checklist', () => {
  it('renders the three phase headers with counters', () => {
    render(<RecGuide />);
    expect(screen.getByText(/เปิดบัญชี Registrant/)).toBeInTheDocument();
    expect(screen.getByText(/ขึ้นทะเบียนโรงไฟฟ้า SF-02/)).toBeInTheDocument();
    expect(screen.getByText(/EGAT ตรวจ \+ ค่าธรรมเนียม/)).toBeInTheDocument();
    // phase 1 has 9 tickable items, none checked yet
    expect(screen.getByText('0/9')).toBeInTheDocument();
  });

  it('phase 1 is expanded by default; phase 2 expands on click', () => {
    render(<RecGuide />);
    // phase-1 item visible immediately
    expect(screen.getByLabelText(/STC Contract/)).toBeInTheDocument();
    // phase-2 item hidden until its header is clicked
    expect(screen.queryByLabelText(/Single Line Diagram/)).toBeNull();
    fireEvent.click(screen.getByText(/ขึ้นทะเบียนโรงไฟฟ้า SF-02/));
    expect(screen.getByLabelText(/Single Line Diagram/)).toBeInTheDocument();
  });

  it('ticking an item updates the counter and persists to localStorage', () => {
    render(<RecGuide />);
    fireEvent.click(screen.getByLabelText(/STC Contract/));
    expect(screen.getByText('1/9')).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(REC_GUIDE_STORAGE_KEY)!);
    expect(stored).toContain('stc-contract');
  });

  it('a fresh mount restores checked state from localStorage', () => {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, JSON.stringify(['stc-contract', 'sf01']));
    render(<RecGuide />);
    expect(screen.getByText('2/9')).toBeInTheDocument();
    expect(screen.getByLabelText(/STC Contract/)).toBeChecked();
  });

  it('ล้าง checklist clears ticks and storage', () => {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, JSON.stringify(['stc-contract']));
    render(<RecGuide />);
    fireEvent.click(screen.getByRole('button', { name: /ล้าง checklist/ }));
    expect(screen.getByText('0/9')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(REC_GUIDE_STORAGE_KEY) ?? '[]')).toEqual([]);
  });

  it('malformed stored value falls back to empty without crashing', () => {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, '{not json');
    render(<RecGuide />);
    expect(screen.getByText('0/9')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd carbon-ready && npx vitest run src/components/registration/recguide.ui.test.tsx`
Expected: FAIL — module `./RecGuide` not found.

- [ ] **Step 3: Create the content data file**

Create `carbon-ready/src/data/rec-guide.ts` with exactly:

```ts
// REC onboarding guide content — transcribed from EGAT Process Guide V12 and
// Evident SF-02 v1.3 (docs/reference/rec/). Do not add or reword requirements
// without checking the source documents (real-data-only policy).

export interface RecGuideItem {
  id: string;
  label: string;
  detail?: string;
}

export interface RecGuidePhase {
  key: string;
  title: string;
  /** Non-tickable info lines: addresses, fees, timing. */
  notes: string[];
  /** Tickable "prepare this" entries. */
  items: RecGuideItem[];
}

export const REC_GUIDE_PHASES: RecGuidePhase[] = [
  {
    key: 'registrant',
    title: '① เปิดบัญชี Registrant กับ EGAT (นอกระบบ — ทำครั้งเดียวต่อบริษัท)',
    notes: [
      'ส่ง soft file ทั้งชุดไป irecissuer@egat.co.th เพื่อ pre-check ก่อนส่งตัวจริง',
      'ส่งตัวจริง + จดหมายนำส่ง ถึง ผู้อำนวยการฝ่ายสัญญาซื้อขายไฟฟ้า กฟผ. 53 ม.2 ถ.จรัญสนิทวงศ์ อ.บางกรวย จ.นนทบุรี 11130',
      'EGAT เซ็น STC คืน แล้วส่งเรื่องต่อให้ Evident — รออีเมลรหัสเข้าระบบ จากนั้นจด Organisation ID ไว้กรอกในฟอร์ม SF-02',
    ],
    items: [
      { id: 'stc-contract', label: 'STC Contract ลงนามโดยผู้มีอำนาจ 2 ชุด' },
      { id: 'sf01', label: 'SF-01: Market Entity Application กรอกครบ' },
      { id: 'company-cert', label: 'หนังสือรับรองบริษัท (อายุไม่เกิน 6 เดือน)' },
      { id: 'poa', label: 'หนังสือมอบอำนาจ (ถ้ามี)' },
      { id: 'id-copy', label: 'สำเนาบัตรประชาชน/พาสปอร์ตผู้มีอำนาจลงนาม' },
      { id: 'boj34', label: 'ทะเบียนตราประทับบริษัท (บอจ.3/บอจ.4)' },
      { id: 'boj5', label: 'สำเนาบัญชีรายชื่อผู้ถือหุ้น (บอจ.5)' },
      { id: 'financial', label: 'งบการเงินบริษัท (อายุไม่เกิน 12 เดือน)' },
      { id: 'pp20', label: 'ภ.พ.20 (เฉพาะบริษัทที่จด VAT)' },
    ],
  },
  {
    key: 'facility',
    title: '② ขึ้นทะเบียนโรงไฟฟ้า SF-02 (กรอกในระบบนี้)',
    notes: [
      'กรอกฟอร์มในการ์ด SF-02 ด้านล่าง — ไฟล์เอกสารแนบอัปโหลดในหน้า Evidence ของโปรเจกต์',
    ],
    items: [
      { id: 'org-id', label: 'Evident Organisation ID (ได้จากขั้นเปิดบัญชี)' },
      { id: 'latlong', label: 'พิกัด Latitude/Longitude ทศนิยม 6 ตำแหน่ง' },
      { id: 'capacity-mw', label: 'กำลังติดตั้ง (MW สูงสุด 6 ทศนิยม)' },
      { id: 'meter-ids', label: 'หมายเลขมิเตอร์ (Meter/Measurement ID)' },
      { id: 'gen-units', label: 'จำนวนเครื่องกำเนิดไฟฟ้า/inverter' },
      { id: 'cod-date', label: 'วัน COD (Commercial Operation Date)' },
      { id: 'network', label: 'เจ้าของโครงข่ายที่เชื่อมต่อ + แรงดัน ณ จุดเชื่อม (เช่น PEA 22 kV)' },
      { id: 'sd02-codes', label: 'รหัส Fuel/Technology ตามเอกสาร Evident SD-02' },
      { id: 'photos', label: 'รูปถ่ายโครงการ' },
      { id: 'ppa', label: 'PPA (สัญญาซื้อขายไฟ)' },
      { id: 'sld', label: 'Single Line Diagram (SLD)' },
      { id: 'capacity-proof', label: 'หลักฐานกำลังติดตั้ง (kW)' },
      { id: 'volume-proof', label: 'หลักฐานปริมาณไฟที่ผลิต (ใบแจ้งหนี้/ข้อมูลมิเตอร์ พร้อมวิธีคำนวณ)' },
      { id: 'license', label: 'ใบอนุญาตผลิตไฟฟ้า (พค.2 / ใบอนุญาต ERC)' },
      { id: 'cod-proof', label: 'หลักฐานวัน COD' },
      { id: 'meter-cal', label: 'Meter Calibration Report (กรณีมิเตอร์ non-settlement)' },
      { id: 'sf02c', label: 'SF-02C Owner\'s Declaration + หลักฐานความเป็นเจ้าของ (กรณีผู้ยื่นไม่ใช่เจ้าของ)' },
      { id: 'consumer-letter', label: 'Declaration/Notice Letter สละสิทธิ์เคลม attributes (กรณีมี onsite consumer)' },
    ],
  },
  {
    key: 'egat-review',
    title: '③ EGAT ตรวจ + ค่าธรรมเนียม',
    notes: [
      'EGAT แจ้งผลทางอีเมลแล้วออก invoice — ชำระภายใน 30 วันนับจากวันที่ออก',
      'ค่าธรรมเนียมปี 2025: ≥1–<3 MW = 19,000 บาท · <1 MW = 3,800 บาท · <250 kW + digital metering = ยกเว้น',
      'ทะเบียนมีอายุ 5 ปี — ค่าต่ออายุ 40% ของค่าขึ้นทะเบียน',
    ],
    items: [],
  },
];
```

- [ ] **Step 4: Create the component**

Create `carbon-ready/src/components/registration/RecGuide.tsx` with exactly:

```tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';
import { REC_GUIDE_PHASES } from '../../data/rec-guide';

export const REC_GUIDE_STORAGE_KEY = 'carbonready.rec-guide.v1';

// localStorage can be absent/full (private mode) — persistence degrades to
// session-only state, never crashes.
function loadChecked(): Set<string> {
  try {
    const raw = localStorage.getItem(REC_GUIDE_STORAGE_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveChecked(ids: Set<string>) {
  try {
    localStorage.setItem(REC_GUIDE_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // private mode / quota — keep in-memory state only
  }
}

/**
 * 3-phase REC onboarding guide with a tickable document checklist, shown on the
 * REC track of the Register Project page. Content: EGAT Process Guide V12 +
 * Evident SF-02 v1.3 (see src/data/rec-guide.ts).
 */
export function RecGuide() {
  const [checked, setChecked] = useState<Set<string>>(loadChecked);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set([REC_GUIDE_PHASES[0].key]));

  function toggleItem(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveChecked(next);
      return next;
    });
  }

  function togglePhase(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function clearAll() {
    const empty = new Set<string>();
    saveChecked(empty);
    setChecked(empty);
  }

  return (
    <div className="mb-4 rounded-xl border border-ink-200/80 bg-white p-4 shadow-card">
      <div className="mb-2 text-sm font-semibold text-ink-900">ขั้นตอนขึ้นทะเบียน REC — เตรียมอะไรบ้าง</div>
      <div className="space-y-2">
        {REC_GUIDE_PHASES.map((phase) => {
          const open = openKeys.has(phase.key);
          const done = phase.items.filter((i) => checked.has(i.id)).length;
          return (
            <div key={phase.key} className="rounded-lg border border-ink-100">
              <button
                type="button"
                onClick={() => togglePhase(phase.key)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <span className="flex-1 text-[13px] font-medium text-ink-800">{phase.title}</span>
                {phase.items.length > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    done === phase.items.length ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-500'}`}>
                    {done}/{phase.items.length}
                  </span>
                )}
                <ChevronDown size={14} className={`shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="border-t border-ink-100 px-3 py-2">
                  {phase.notes.length > 0 && (
                    <ul className="mb-2 list-disc space-y-0.5 pl-4 text-[12px] text-ink-500">
                      {phase.notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  )}
                  {phase.items.length > 0 && (
                    <div className="space-y-1">
                      {phase.items.map((item) => (
                        <label key={item.id} className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-700">
                          <input
                            type="checkbox"
                            checked={checked.has(item.id)}
                            onChange={() => toggleItem(item.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 accent-brand-600"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" onClick={clearAll}>ล้าง checklist</Button>
      </div>
    </div>
  );
}
```

Before finalizing, check `carbon-ready/src/components/ui/Button.tsx` for the exact `variant` prop values — `ghost` is used elsewhere in Registration.tsx so it exists.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd carbon-ready && npx vitest run src/components/registration/recguide.ui.test.tsx`
Expected: PASS 6/6. If the `0/9` assertion fails because a counter for another phase also renders `0/18`, the assertions still hold (getByText('0/9') is unique — phase 2 shows `0/18`, phase 3 has no counter).

- [ ] **Step 6: Commit**

```bash
git add carbon-ready/src/data/rec-guide.ts carbon-ready/src/components/registration/RecGuide.tsx carbon-ready/src/components/registration/recguide.ui.test.tsx
git commit --no-verify -m "feat(rec): 3-phase onboarding guide + persisted checklist component"
```

---

### Task 2: Wire into Registration page + integration tests + verify

**Files:**
- Modify: `carbon-ready/src/pages/Registration.tsx` (REC track branch of the entry screen)
- Test: `carbon-ready/src/pages/registration.ui.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('Registration entry — program chooser then methodology cards', ...)` block in `carbon-ready/src/pages/registration.ui.test.tsx`:

```tsx
  it('REC track shows the onboarding guide above the SF-02 card', () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /REC \(I-REC\(E\)\)/ }));
    expect(screen.getByText(/ขั้นตอนขึ้นทะเบียน REC/)).toBeInTheDocument();
    expect(screen.getByText(/เปิดบัญชี Registrant/)).toBeInTheDocument();
  });

  it('TGO track shows no REC guide', () => {
    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /TGO \(T-VER\)/ }));
    expect(screen.queryByText(/ขั้นตอนขึ้นทะเบียน REC/)).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx`
Expected: the first new test FAILS (guide not rendered); the second passes trivially.

- [ ] **Step 3: Wire the component in**

In `carbon-ready/src/pages/Registration.tsx`:

Add the import (with the other component imports at the top):

```tsx
import { RecGuide } from '../components/registration/RecGuide';
```

In the entry screen return (the `program` branch, after the back button and before the methodology card grid `<div className="grid gap-3 ...">`), add:

```tsx
        {program === 'rec' && <RecGuide />}
```

- [ ] **Step 4: Run the page tests**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx`
Expected: PASS (19 tests: 17 existing + 2 new).

- [ ] **Step 5: Full verification**

Run: `cd carbon-ready && npx vitest run` — expected all green (baseline 360 + 8 new = 368).
Run: `cd carbon-ready && npx tsc -b` — expected clean.
(No server changes — server suite unaffected.)

- [ ] **Step 6: Commit**

```bash
git add carbon-ready/src/pages/Registration.tsx carbon-ready/src/pages/registration.ui.test.tsx
git commit --no-verify -m "feat(rec): show onboarding guide on REC track of Register Project"
```

---

## Self-review notes

- **Spec coverage:** content data file (Task 1 Step 3 — 3 phases, items/notes verbatim from spec), component with accordion/counters/clear/persistence + malformed-storage fallback (Task 1 Step 4, tested in Step 1), wiring gated on `program === 'rec'` (Task 2), all spec test cases present across the two test files.
- **Type consistency:** `REC_GUIDE_STORAGE_KEY` exported from RecGuide.tsx and imported by its test; `RecGuidePhase.items/notes` names match component usage; item ids in tests (`stc-contract`, `sf01`) match the data file.
- **Counts:** phase 1 = 9 items, phase 2 = 18 items, phase 3 = 0 — test assertions `0/9`, `1/9`, `2/9` are unique strings vs `0/18`.
