# PDD Defaults + Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ลด field ที่ user ต้องกรอกใน PDD — seed ค่ามาตรฐานตอนสร้าง PDD ใหม่ และ clone ข้อมูลจาก PDD เดิมของ methodology เดียวกัน (เว้น field เฉพาะไซต์)

**Architecture:** helper ใหม่ `lib/pdd-prefill.ts` (pure functions: `buildDefaults`, `cloneableData`, `buildPrefill`) + flag ใหม่ 2 ตัวใน `PddFieldSchema` + ประกาศ defaults/siteSpecific ใน methodology data ของ solar. จุด seed อยู่ที่ `StartPddModal.startWith` (client-side, ทำงานได้ทั้ง local-store และ server mode ผ่าน `api.savePddDraft` เดิม — **deviation จาก spec** ที่บอกให้ seed ใน `store.selectMethodology`: ย้ายมาที่นี่เพื่อให้ path เดียวครอบคลุม server mode ด้วย ไม่แตะ server)

**Tech Stack:** React + TypeScript, Zustand store, vitest + @testing-library/react. ทุกคำสั่งรันจาก `carbon-ready/`

**Spec:** `docs/superpowers/specs/2026-08-10-pdd-defaults-clone-design.md`

**File map:**
- Create: `carbon-ready/src/lib/pdd-prefill.ts` — pure prefill/clone logic
- Create: `carbon-ready/src/lib/pdd-prefill.test.ts` — unit tests
- Modify: `carbon-ready/src/types/index.ts:321-333` — เพิ่ม `defaultValue` / `siteSpecific`
- Modify: `carbon-ready/src/data/methodology-tver-solar.ts` — ประกาศ defaults + siteSpecific
- Modify: `carbon-ready/src/pages/Registration.tsx` (StartPddModal ~บรรทัด 122-252) — clone select + seed
- Modify: `carbon-ready/src/pages/registration.ui.test.tsx` — UI tests

**กติกาสำคัญ (จาก spec):** default ได้เฉพาะค่า "มาตรฐาน" ของ methodology ห้ามเดา fact เฉพาะโครงการ; clone ห้ามพา field ที่ `siteSpecific`, `computed`, textarea ที่ draft ได้ (`draftableKeys`), key ที่ schema ไม่รู้จัก, และ `evidence_ids`

---

### Task 1: Schema flags + `buildDefaults`

**Files:**
- Modify: `carbon-ready/src/types/index.ts:321-333`
- Create: `carbon-ready/src/lib/pdd-prefill.test.ts`
- Create: `carbon-ready/src/lib/pdd-prefill.ts`

- [ ] **Step 1: เพิ่ม 2 flag ใน `PddFieldSchema`**

ใน `carbon-ready/src/types/index.ts` แก้ interface (บรรทัด 321-333) — เพิ่ม 2 บรรทัดท้าย interface:

```ts
export interface PddFieldSchema {
  key: string;                 // unique across the methodology
  label: string;
  type: PddFieldType;
  unit?: string;
  required: boolean;
  options?: string[];          // for 'select'
  help?: string;
  showIf?: { field: string; equals: string };   // conditional visibility
  source?: PddComputedSource;  // for 'computed'
  sensitive?: boolean;         // selective disclosure: published only as a hash
  columns?: PddTableColumn[];  // for 'table' — value is Array<Record<column.key, string|number>>
  defaultValue?: unknown;      // methodology-standard value seeded into a brand-new PDD
  siteSpecific?: boolean;      // per-site fact — never carried over when cloning another PDD
}
```

- [ ] **Step 2: เขียน failing test สำหรับ `buildDefaults`**

สร้าง `carbon-ready/src/lib/pdd-prefill.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDefaults } from './pdd-prefill';
import type { Methodology } from '../types';

/** Minimal methodology fixture — only what prefill logic reads. */
function meth(fields: Methodology['pdd_sections'][0]['fields']): Methodology {
  return {
    id: 'meth-test', code: 'TEST-01', name: 'Test', standard: 'T-VER', version: 'v1',
    sectoral_scope: 'Energy', status: 'active',
    calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
    required_evidence: [], monitoring_params: [],
    pdd_sections: [{ key: 's1', title: 'S1', fields }],
  };
}

describe('buildDefaults', () => {
  it('seeds declared defaultValue', () => {
    const m = meth([
      { key: 'tech', label: 'Tech', type: 'select', options: ['A', 'B'], required: true, defaultValue: 'A' },
      { key: 'deg', label: 'Deg', type: 'number', required: true, defaultValue: 0.4 },
    ]);
    expect(buildDefaults(m)).toEqual({ tech: 'A', deg: 0.4 });
  });

  it('auto-defaults a select with exactly one option', () => {
    const m = meth([
      { key: 'only', label: 'Only', type: 'select', options: ['the-one'], required: true },
      { key: 'two', label: 'Two', type: 'select', options: ['x', 'y'], required: true },
    ]);
    expect(buildDefaults(m)).toEqual({ only: 'the-one' });
  });

  it('leaves fields without defaults untouched and skips computed', () => {
    const m = meth([
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'calc', label: 'Calc', type: 'computed', source: 'capacity_kwp', required: false },
    ]);
    expect(buildDefaults(m)).toEqual({});
  });
});
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-prefill.test.ts`
Expected: FAIL — `Cannot find module './pdd-prefill'` (หรือ resolve error เทียบเท่า)

- [ ] **Step 4: implement `buildDefaults`**

สร้าง `carbon-ready/src/lib/pdd-prefill.ts`:

```ts
// New-PDD prefill: methodology-standard defaults and clone-from-previous-project.
// Deterministic only — a value appears here when the methodology standard fixes
// it, never as a guess at a project-specific fact (real-data-only rule).
import type { Methodology } from '../types';
import { draftableKeys } from './pdd-drafts';

/** Seed values for a brand-new PDD: declared defaultValue, plus any select with a single option. */
export function buildDefaults(m: Methodology): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of m.pdd_sections) {
    for (const f of section.fields) {
      if (f.type === 'computed') continue;
      if (f.defaultValue !== undefined) out[f.key] = f.defaultValue;
      else if (f.type === 'select' && f.options?.length === 1) out[f.key] = f.options[0];
    }
  }
  return out;
}
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-prefill.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add carbon-ready/src/types/index.ts carbon-ready/src/lib/pdd-prefill.ts carbon-ready/src/lib/pdd-prefill.test.ts
git commit -m "feat(pdd): schema defaultValue/siteSpecific flags + buildDefaults"
```

---

### Task 2: `cloneableData` + `buildPrefill`

**Files:**
- Modify: `carbon-ready/src/lib/pdd-prefill.ts`
- Modify: `carbon-ready/src/lib/pdd-prefill.test.ts`

- [ ] **Step 1: เขียน failing tests**

เพิ่มท้าย `pdd-prefill.test.ts` (ใช้ helper `meth` เดิมในไฟล์):

```ts
import { cloneableData, buildPrefill } from './pdd-prefill';

describe('cloneableData', () => {
  const m = meth([
    { key: 'preparer_name', label: 'Preparer', type: 'text', required: true },
    { key: 'project_title_th', label: 'Title', type: 'text', required: true, siteSpecific: true },
    { key: 'capacity', label: 'Cap', type: 'computed', source: 'capacity_kwp', required: false },
    { key: 'before_project', label: 'Before', type: 'textarea', required: false },
    { key: 'note', label: 'Note', type: 'text', required: false },
  ]);

  it('copies plain fields, skips siteSpecific / computed / draftable / unknown keys / empty values', () => {
    const source = {
      preparer_name: 'สมชาย',
      project_title_th: 'ไซต์เก่า',       // siteSpecific → dropped
      capacity: 999,                      // computed → dropped
      before_project: 'ข้อความไซต์เก่า',   // draftableKeys → dropped
      ghost_field: 'x',                   // not in schema → dropped
      note: '',                           // empty → dropped
    };
    expect(cloneableData(m, source)).toEqual({ preparer_name: 'สมชาย' });
  });
});

describe('buildPrefill', () => {
  it('overlays clone data on defaults — clone wins, defaults fill the rest', () => {
    const m2 = meth([
      { key: 'tech', label: 'Tech', type: 'select', options: ['A', 'B'], required: true, defaultValue: 'A' },
      { key: 'freq', label: 'Freq', type: 'select', options: ['M', 'Q'], required: true, defaultValue: 'M' },
    ]);
    expect(buildPrefill(m2, { tech: 'B' })).toEqual({ tech: 'B', freq: 'M' });
    expect(buildPrefill(m2)).toEqual({ tech: 'A', freq: 'M' });
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-prefill.test.ts`
Expected: FAIL — `cloneableData is not a function` (module มีแต่ buildDefaults)

- [ ] **Step 3: implement**

เพิ่มท้าย `pdd-prefill.ts`:

```ts
/**
 * Fields safe to carry over from another project's PDD of the same methodology.
 * Dropped: computed (recomputed from the new site), siteSpecific facts, draftable
 * prose (embeds the old site's name/address — user re-drafts instead), keys the
 * current schema doesn't know, and empty values.
 */
export function cloneableData(m: Methodology, source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const section of m.pdd_sections) {
    for (const f of section.fields) {
      if (f.type === 'computed' || f.siteSpecific) continue;
      if ((draftableKeys as readonly string[]).includes(f.key)) continue;
      const v = source[f.key];
      if (v === undefined || v === null || v === '') continue;
      out[f.key] = v;
    }
  }
  return out;
}

/** Prefill for a brand-new PDD: standard defaults, overlaid by clone data when a source is given. */
export function buildPrefill(m: Methodology, source?: Record<string, unknown>): Record<string, unknown> {
  const out = buildDefaults(m);
  if (source) Object.assign(out, cloneableData(m, source));
  return out;
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-prefill.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/lib/pdd-prefill.ts carbon-ready/src/lib/pdd-prefill.test.ts
git commit -m "feat(pdd): cloneableData + buildPrefill — clone-safe field carry-over"
```

---

### Task 3: ประกาศ defaults + siteSpecific ใน solar methodology

**Files:**
- Modify: `carbon-ready/src/data/methodology-tver-solar.ts` (บรรทัดอ้างอิงจาก HEAD ปัจจุบัน)
- Modify: `carbon-ready/src/lib/pdd-prefill.test.ts`

- [ ] **Step 1: เขียน failing test กับ methodology จริง**

เพิ่มท้าย `pdd-prefill.test.ts`:

```ts
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';

describe('TVER solar methodology prefill data', () => {
  it('buildDefaults seeds exactly the 9 standard values', () => {
    expect(buildDefaults(TVER_SOLAR_METHODOLOGY)).toEqual({
      technology: 'Solar PV rooftop',
      grid_connection: 'Grid-connected',
      crediting_years: '7',
      registered_elsewhere: 'ไม่มี',
      degradation_pct: 0.4,
      monitored_parameter: 'EG_PJ — net electricity supplied to the grid',
      measurement_method: 'Revenue-grade bi-directional meter',
      monitoring_frequency: 'Monthly',
      baseline_scenario: 'Grid electricity displaced by solar generation', // single-option rule
    });
  });

  it('site-specific facts never survive a clone', () => {
    const SITE_KEYS = [
      'project_title_th', 'project_title_en', 'project_address', 'permit_no',
      'permit_date', 'investment_mthb', 'project_scale', 'crediting_start',
      'doc_completed_date', 'doc_revision', 'installations', 'year1_generation_kwh',
    ];
    const source = Object.fromEntries(SITE_KEYS.map((k) => [k, 'some-value']));
    source.preparer_name = 'สมชาย';
    source.equipment_specs = [{ item: 'แผง', brand: 'X', model: 'Y', spec: '600W', qty: 100 }];
    const cloned = cloneableData(TVER_SOLAR_METHODOLOGY, source);
    for (const k of SITE_KEYS) expect(cloned, k).not.toHaveProperty(k);
    expect(cloned.preparer_name).toBe('สมชาย');           // people carry over
    expect(cloned.equipment_specs).toEqual(source.equipment_specs); // fleet shares equipment models
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-prefill.test.ts`
Expected: FAIL — buildDefaults ได้แค่ `{ baseline_scenario: ... }` (single-option rule) และ site-specific test fail เพราะยังไม่มี flag

- [ ] **Step 3: แก้ methodology data**

ใน `carbon-ready/src/data/methodology-tver-solar.ts` แก้ทีละบรรทัด (Edit old → new):

`defaultValue` — 8 จุด:

```ts
// technology (บรรทัด 66)
{ key: 'technology', label: 'Technology', type: 'select', options: ['Solar PV rooftop', 'Solar PV ground-mounted'], required: true, defaultValue: 'Solar PV rooftop' },
// grid_connection (67)
{ key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true, defaultValue: 'Grid-connected' },
// crediting_years (38) — options เป็น string จึง default เป็น '7'
{ key: 'crediting_years', label: 'ระยะเวลาคิดคาร์บอนเครดิต', type: 'select', options: ['7', '10'], required: true, unit: 'ปี', defaultValue: '7' },
// registered_elsewhere (95)
{ key: 'registered_elsewhere', label: 'เคย/อยู่ระหว่างขึ้นทะเบียนกลไกอื่น (CDM, VCS, Gold Standard, REC)', type: 'select', options: ['ไม่มี', 'มี'], required: true, defaultValue: 'ไม่มี' },
// degradation_pct (127) — ค่ามาตรฐานที่ help ระบุอยู่แล้ว
{ key: 'degradation_pct', label: 'อัตราการเสื่อมของแผงต่อปี', type: 'number', required: true, unit: '%', help: 'โดยทั่วไป 0.40% ต่อปี', defaultValue: 0.4 },
// monitored_parameter (149) — จาก monitoring_params ของ methodology นี้เอง
{ key: 'monitored_parameter', label: 'Monitored parameter', type: 'text', required: true, help: 'e.g. EG_PJ — net electricity to grid.', defaultValue: 'EG_PJ — net electricity supplied to the grid' },
// measurement_method (150)
{ key: 'measurement_method', label: 'Measurement method', type: 'text', required: true, defaultValue: 'Revenue-grade bi-directional meter' },
// monitoring_frequency (151)
{ key: 'monitoring_frequency', label: 'Frequency', type: 'select', options: ['Continuous', 'Monthly', 'Quarterly'], required: true, defaultValue: 'Monthly' },
```

`siteSpecific: true` — 12 จุด (เพิ่ม property ท้าย object เดิม ก่อน `}`):

```ts
{ key: 'project_title_th', label: 'ชื่อโครงการ (ภาษาไทย)', type: 'text', required: true, siteSpecific: true },
{ key: 'project_title_en', label: 'ชื่อโครงการ (ภาษาอังกฤษ)', type: 'text', required: false, siteSpecific: true },
{ key: 'project_address', label: 'ที่ตั้งโครงการ (เต็ม)', type: 'textarea', required: false, siteSpecific: true,
  help: 'บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์ — เว้นว่างเพื่อใช้ที่ตั้งจากทะเบียนโครงการ' },
{ key: 'permit_no', label: 'ใบอนุญาตก่อสร้าง/ดัดแปลงอาคาร เลขที่', type: 'text', required: false, siteSpecific: true },
{ key: 'permit_date', label: 'ใบอนุญาตฯ ลงวันที่', type: 'date', required: false, siteSpecific: true },
{ key: 'investment_mthb', label: 'เงินลงทุนทั้งหมดของโครงการ', type: 'number', required: false, unit: 'ล้านบาท', siteSpecific: true },
{ key: 'project_scale', label: 'ขนาดโครงการ', type: 'select', options: ['เล็กมาก', 'เล็ก', 'ใหญ่'], required: true, siteSpecific: true },
{ key: 'crediting_start', label: 'วันเริ่มคิดเครดิต (Crediting Start Date)', type: 'date', required: true, siteSpecific: true },
{ key: 'doc_completed_date', label: 'วันที่จัดทำแล้วเสร็จ', type: 'date', required: false, siteSpecific: true },
{ key: 'doc_revision', label: 'เอกสารฉบับที่', type: 'text', required: false, siteSpecific: true },
// installations (72-79) — เพิ่ม siteSpecific: true ที่บรรทัดแรกของ object:
{ key: 'installations', label: 'อุปกรณ์หลักที่ติดตั้งรายอาคาร', type: 'table', required: false, siteSpecific: true,
  columns: [ /* ...คงเดิมทั้งบล็อก... */ ] },
// year1_generation_kwh (125-126) — เพิ่มที่บรรทัดแรก คง help เดิม:
{ key: 'year1_generation_kwh', label: 'ไฟฟ้าที่คาดว่าจะผลิตได้ปีที่ 1', type: 'number', required: false, unit: 'kWh', siteSpecific: true,
  help: 'จากรายงาน PVsyst / การประเมินของผู้ติดตั้ง — เว้นว่างเพื่อใช้แบบจำลองของระบบ (capacity × 4.0 h × 365 × PR)' },
```

หมายเหตุ: `equipment_specs` **ไม่ใส่** siteSpecific — fleet มักใช้แผง/inverter รุ่นเดียวกัน (ตาม spec); `performance_ratio`, `consumers`, textarea อื่นก็ clone ได้

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-prefill.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/data/methodology-tver-solar.ts carbon-ready/src/lib/pdd-prefill.test.ts
git commit -m "feat(pdd): solar methodology standard defaults + site-specific clone flags"
```

---

### Task 4: StartPddModal — clone select + seed ตอนสร้าง PDD

**Files:**
- Modify: `carbon-ready/src/pages/Registration.tsx` (StartPddModal, บรรทัด ~122-252)
- Modify: `carbon-ready/src/pages/registration.ui.test.tsx`

- [ ] **Step 1: เขียน failing UI tests**

เพิ่มท้าย `registration.ui.test.tsx` (ใช้ `renderEntry` pattern เดิม — ประกาศซ้ำใน describe ใหม่ได้เพราะของเดิมอยู่ใน describe scope อื่น):

```tsx
describe('New-PDD prefill & clone-from-previous', () => {
  function renderEntry() {
    return render(
      <MemoryRouter initialEntries={['/registration']}>
        <Routes>
          <Route path="/registration" element={<Registration />} />
          <Route path="/registration/:pddId" element={<Registration />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  async function createSolarProject(name: string) {
    fireEvent.click(screen.getByRole('button', { name: /T-VER-S-01/ }));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: name } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Khon Kaen, Thailand' } });
    fireEvent.change(screen.getByLabelText('Capacity (kWp)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Start PDD/ }));
    await screen.findByText(new RegExp(`Register: ${name}`));
    const st = useStore.getState();
    const project = st.projects.find((p) => p.name === name)!;
    return st.pdds.find((d) => d.project_id === project.id)!;
  }

  it('seeds methodology-standard defaults into a fresh solar PDD', async () => {
    renderEntry();
    const pdd = await createSolarProject('โซลาร์ทดสอบดีฟอลต์');
    expect(pdd.section_data.technology).toBe('Solar PV rooftop');
    expect(pdd.section_data.baseline_scenario).toBe('Grid electricity displaced by solar generation');
    expect(pdd.section_data.registered_elsewhere).toBe('ไม่มี');
    expect(pdd.section_data.monitoring_frequency).toBe('Monthly');
    expect(pdd.section_data.project_title_th).toBeUndefined(); // ไม่มีการเดา fact เฉพาะไซต์
  });

  it('clone: carries shared fields, blanks site-specific and draftable ones', async () => {
    // source: draft solar PDD ของ prj-0004 พร้อมข้อมูล
    const src = useStore.getState().selectMethodology('prj-0004', 'meth-tver-solar');
    useStore.getState().savePddDraft(src.id, {
      preparer_name: 'สมชาย ทดสอบ',
      project_title_th: 'ไซต์เก่า',
      before_project: 'ข้อความของไซต์เก่า',
    }, []);

    renderEntry();
    fireEvent.click(screen.getByRole('button', { name: /T-VER-S-01/ }));
    // เลือกแหล่ง clone (select โผล่เพราะมี PDD solar ที่มีข้อมูลอยู่)
    fireEvent.change(screen.getByLabelText(/คัดลอกข้อมูลจากโครงการก่อนหน้า/), { target: { value: src.id } });
    // prj-0004 มี draft solar อยู่ → modal เปิดโหมด pick; สลับไปฟอร์มสร้างโปรเจกต์ใหม่ก่อน
    fireEvent.click(screen.getByRole('button', { name: /Create a new project/ }));
    fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: 'โซลาร์ทดสอบโคลน' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Rayong, Thailand' } });
    fireEvent.change(screen.getByLabelText('Capacity (kWp)'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: /Create & Start PDD/ }));
    await screen.findByText(/Register: โซลาร์ทดสอบโคลน/);

    const st = useStore.getState();
    const project = st.projects.find((p) => p.name === 'โซลาร์ทดสอบโคลน')!;
    const pdd = st.pdds.find((d) => d.project_id === project.id)!;
    expect(pdd.section_data.preparer_name).toBe('สมชาย ทดสอบ');     // ติดมา
    expect(pdd.section_data.project_title_th).toBeUndefined();        // siteSpecific → ว่าง
    expect(pdd.section_data.before_project).toBeUndefined();          // draftable → ว่าง (ให้กด ✨ ร่างใหม่)
    expect(pdd.section_data.technology).toBe('Solar PV rooftop');     // defaults ยังเติมส่วนที่ clone ไม่มี
    expect(pdd.evidence_ids).toEqual([]);                             // evidence ไม่ copy
  });
});
```

หมายเหตุ: ถ้า `createSolarProject` ใน test แรกเจอ clone select (เพราะ fixture มี PDD-2000 solar ที่มี section_data) ก็ไม่เป็นไร — ไม่ได้เลือกค่า จึงเป็น defaults ล้วน

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx`
Expected: FAIL — `section_data.technology` เป็น `undefined` (test 1) และหา label `คัดลอกข้อมูลจากโครงการก่อนหน้า` ไม่เจอ (test 2)

- [ ] **Step 3: implement ใน StartPddModal**

ใน `carbon-ready/src/pages/Registration.tsx`:

3a. เพิ่ม import (ท้ายกลุ่ม import จาก '../lib/'):

```ts
import { buildPrefill } from '../lib/pdd-prefill';
```

3b. ใน `StartPddModal` เพิ่ม state + แหล่ง clone (หลังบรรทัด `const [busy, setBusy] = useState(false);`):

```ts
const pdds = useStore((s) => s.pdds);
const allProjects = useStore((s) => s.projects);
const [cloneSourceId, setCloneSourceId] = useState('');
// PDD ของ methodology เดียวกันที่มีข้อมูลแล้ว — ใช้เป็นต้นแบบ clone ได้ (รวม registered)
const cloneSources = pdds
  .filter((p) => p.methodology_id === methodology.id && Object.keys(p.section_data).length > 0)
  .map((p) => ({ pdd: p, name: allProjects.find((x) => x.id === p.project_id)?.name ?? p.id }));
```

3c. แก้ `startWith` ให้ seed prefill (แทนที่ function เดิมทั้งก้อน):

```ts
async function startWith(projectId: string) {
  const created = await api.selectMethodology(projectId, methodology.id);
  // Seed only a brand-new (empty) PDD — re-entering an existing draft keeps its data.
  if (Object.keys(created.section_data).length === 0) {
    const source = pdds.find((p) => p.id === cloneSourceId);
    const prefill = buildPrefill(methodology, source?.section_data);
    if (Object.keys(prefill).length > 0) {
      await api.savePddDraft(created.id, prefill, created.evidence_ids);
    }
  }
  navigate(`/registration/${created.id}`);
}
```

3d. เพิ่ม clone select ใน JSX — วางหลัง `<p className="text-[13px] text-ink-500">{methodology.name}</p>` (ก่อน branch `mode === 'pick'` เพื่อให้เห็นทั้งสองโหมด):

```tsx
{cloneSources.length > 0 && (
  <Select label="คัดลอกข้อมูลจากโครงการก่อนหน้า (ไม่บังคับ)" value={cloneSourceId}
    onChange={(e) => setCloneSourceId(e.target.value)}>
    <option value="">— เริ่มจากค่ามาตรฐาน ไม่คัดลอก —</option>
    {cloneSources.map((s) => (
      <option key={s.pdd.id} value={s.pdd.id}>{s.name}</option>
    ))}
  </Select>
)}
```

(`Select` และ `useStore` ถูก import ในไฟล์นี้อยู่แล้ว)

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx`
Expected: PASS ทั้งไฟล์ (รวม test เดิมทั้งหมด — ถ้า test เดิมพังให้ดูก่อนว่า clone select ไปเปลี่ยน DOM ที่ test เดิม assert หรือไม่ แล้วแก้ที่ implementation ไม่ใช่แก้ test เดิม)

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/pages/Registration.tsx carbon-ready/src/pages/registration.ui.test.tsx
git commit -m "feat(pdd): seed standard defaults + clone-from-previous on new PDD"
```

---

### Task 5: Full verification

- [ ] **Step 1: รัน test ทั้ง suite ของ carbon-ready**

Run: `cd carbon-ready && npx vitest run`
Expected: PASS ทั้งหมด (ก่อนหน้านี้เขียวทั้ง suite — ห้ามมี regression)

- [ ] **Step 2: type-check ผ่าน build**

Run: `cd carbon-ready && npm run build`
Expected: สำเร็จ ไม่มี TS error

- [ ] **Step 3: ถ้ามีไฟล์ที่แก้แล้วยังไม่ commit จาก step ก่อนหน้า — commit ปิดงาน**

```bash
git status --short   # ต้องไม่มีไฟล์ในสโคปงานนี้ค้าง (งานอื่นที่ค้างอยู่เดิม เช่น server/, TverSF001Pdd — ไม่แตะ)
```
