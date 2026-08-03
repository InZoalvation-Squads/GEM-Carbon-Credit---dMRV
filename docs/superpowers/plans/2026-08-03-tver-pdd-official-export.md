# T-VER-S-F001-PDD Official Document Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a Thai TGO-form PDD (T-VER-S-F001-PDD v2.1) from platform data — extended methodology schema, calc engine reproducing the official form's numbers, and a print-ready HTML template behind a button on the PDD page.

**Architecture:** Methodology-as-data stays the single source of truth: the T-VER-S-01 document gains new sections/fields (incl. a new `table` field type) validated by the shared zod schema (SPA source of truth, mirrored to server). `lib/pdd.ts` gains yearly BE/PE/ER math (degradation + floor rounding, verified against the MCRU reference PDD). A form-specific React template (`TverSF001Pdd`) renders the official layout; browser print = PDF.

**Tech Stack:** React 18 + TS + Tailwind (SPA), zod, vitest + testing-library, Prisma seed JSON (server). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-03-tver-pdd-official-export-design.md`

**Reference figures (MCRU example, must reproduce):** EF 0.4682; year-1 gen 963,915 kWh; degradation 0.40 %/yr; BE rows 451.31 / 449.50 / 447.70 / 445.91 / 444.13 / 442.35 / 440.58 (total 3,121.48, avg 445.93); EC_PJ 5,801.68 kWh → PE 2.72; ER rows 448/446/444/443/441/439/437 (total 3,098, avg 443). Yearly ER is **floored** to integers (448.59→448, 437.86→437); everything else standard 2-dp rounding.

---

### Task 1: `table` field type + new computed sources (SPA types & validator)

**Files:**
- Modify: `carbon-ready/src/types/index.ts:295-314` (PddFieldType, PddComputedSource, PddFieldSchema, Methodology)
- Modify: `carbon-ready/src/lib/methodology-schema.ts`
- Modify: `carbon-ready/src/lib/pdd.ts:29-41` (validatePdd empty-array check)
- Test: `carbon-ready/src/lib/methodology-schema.test.ts`

- [x] **Step 1: Write failing tests** — append to `methodology-schema.test.ts` (reuse the file's existing `validDoc()` helper if present; otherwise build a minimal doc from the file's existing fixtures):

```ts
describe('schema v2 — table fields & document_template', () => {
  it('accepts a table field with columns and a document_template', () => {
    const doc = validDoc();
    doc.document_template = 'T-VER-S-F001-PDD';
    doc.pdd_sections[0].fields.push({
      key: 'installations', label: 'Installations', type: 'table', required: false,
      columns: [
        { key: 'building', label: 'Building', type: 'text' },
        { key: 'kwp', label: 'Capacity', type: 'number', unit: 'kWp' },
      ],
    });
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok).toBe(true);
  });
  it('rejects a table field without columns', () => {
    const doc = validDoc();
    doc.pdd_sections[0].fields.push({ key: 't', label: 'T', type: 'table', required: false });
    const res = parseMethodologyJson(JSON.stringify(doc));
    expect(res.ok).toBe(false);
  });
  it('rejects columns on a non-table field', () => {
    const doc = validDoc();
    doc.pdd_sections[0].fields.push({
      key: 't', label: 'T', type: 'text', required: false,
      columns: [{ key: 'c', label: 'C', type: 'text' }],
    });
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(false);
  });
  it('accepts the new computed sources', () => {
    const doc = validDoc();
    for (const source of ['annual_generation', 'ec_pj', 'be_annual', 'pe_annual', 'er_annual']) {
      doc.pdd_sections[0].fields.push({ key: `c_${source}`, label: source, type: 'computed', required: false, source });
    }
    expect(parseMethodologyJson(JSON.stringify(doc)).ok).toBe(true);
  });
});
```

- [x] **Step 2: Run to verify failure** — `cd carbon-ready && npx vitest run src/lib/methodology-schema.test.ts` → FAIL (type + zod reject `table`).

- [x] **Step 3: Types** — in `types/index.ts`:

```ts
export type PddFieldType =
  | 'text' | 'textarea' | 'number' | 'select' | 'date'
  | 'boolean' | 'url' | 'email' | 'image' | 'computed' | 'table';

export type PddComputedSource =
  | 'capacity_kwp' | 'project_location' | 'commission_date'
  | 'grid_factor' | 'er_estimate'
  | 'annual_generation' | 'ec_pj' | 'be_annual' | 'pe_annual' | 'er_annual';

export interface PddTableColumn {
  key: string;
  label: string;
  type: 'text' | 'number';
  unit?: string;
}
```

Add `columns?: PddTableColumn[];` to `PddFieldSchema`, and to `Methodology`:

```ts
  /** Official-form renderer registered for this methodology (template-per-form). */
  document_template?: 'T-VER-S-F001-PDD';
```

- [x] **Step 4: Validator** — in `methodology-schema.ts`: add `'table'` to `PDD_FIELD_TYPES`; add the five sources to `PDD_COMPUTED_SOURCES`; add

```ts
const PddTableColumnSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number']),
  unit: z.string().min(1).optional(),
});
```

`columns: z.array(PddTableColumnSchema).min(1).optional()` on `PddFieldSchema`; `document_template: z.enum(['T-VER-S-F001-PDD']).optional()` on `MethodologyDocSchema` (before `.superRefine`). In the per-field cross-checks add:

```ts
      if (f.type === 'table' && (!f.columns || f.columns.length === 0)) {
        ctx.addIssue({ code: 'custom', path: [...path, 'columns'], message: `table field "${f.key}" must declare non-empty columns` });
      }
      if (f.type !== 'table' && f.columns) {
        ctx.addIssue({ code: 'custom', path: [...path, 'columns'], message: `field "${f.key}" is not a table and must not declare columns` });
      }
```

- [x] **Step 5: validatePdd treats `[]` as empty** — in `lib/pdd.ts` `validatePdd`:

```ts
      const empty = v === undefined || v === null || v === ''
        || (Array.isArray(v) && v.length === 0);
```

- [x] **Step 6: Run** — `npx vitest run src/lib/methodology-schema.test.ts src/lib/pdd.test.ts` → PASS. Then `npx tsc -b --noEmit` (or `npm run build` typecheck leg) → clean.

- [x] **Step 7: Commit** — `git add -A && git commit -m "feat(pdd): table field type, official-form computed sources, document_template"`

---

### Task 2: Mirror validator to server

**Files:**
- Modify: `server/src/lib/methodology-schema.ts` (copy of SPA file; keep the header comment, import from `./methodology-types.js`)
- Modify: `server/src/lib/methodology-types.ts` (add `PddTableColumn`, `columns`, `document_template`, new sources — mirror Task 1 types)

- [x] **Step 1: Copy + adjust** — copy the SPA `methodology-schema.ts` body over the server copy, restoring the server's 4-line header comment and `import type { Methodology } from './methodology-types.js';`. Update `methodology-types.ts` with the same type changes as Task 1 Step 3.
- [x] **Step 2: Verify** — `cd server && npm run typecheck && npx vitest run src/modules/methodologies` → PASS.
- [x] **Step 3: Commit** — `git commit -m "feat(server): mirror methodology schema — table fields + document_template"`

---

### Task 3: Calc engine — EC_PJ, yearly BE/PE/ER table (MCRU-exact)

**Files:**
- Modify: `carbon-ready/src/lib/pdd.ts`
- Test: `carbon-ready/src/lib/pdd.test.ts`

- [x] **Step 1: Failing tests** — append to `pdd.test.ts` (reuse `PROJECT`; add a TGO factor):

```ts
const TGO_FACTORS: EmissionFactor[] = [
  { id: 'ef-tgo', country: 'TH', source: 'TGO', factor_kgco2e_per_kwh: 0.4682,
    effective_date: '2025-01-01', version: 2, is_current: true, created_at: '' },
];

// Consumers table from the MCRU reference PDD (kwh_year on the inverter row is a
// direct entry; the others derive from rated_w × hours). Total = 5,801.68 kWh.
const MCRU_CONSUMERS = [
  { equipment: 'Smart Logger 5 เครื่อง', rated_w: 40, hours_per_year: 8760 },       // 350.40
  { equipment: 'Power Supply 1 เครื่อง', rated_w: 550, hours_per_year: 8760 },      // 4,818.00
  { equipment: 'Water Pump', rated_w: 2300, hours_per_year: 10 },                    // 23.00
  { equipment: 'Inverter (Standby Mode)', kwh_year: 610.28 },                        // 610.28
];

const MCRU_DATA = {
  year1_generation_kwh: 963915,
  degradation_pct: 0.4,
  crediting_years: '7',
  consumers: MCRU_CONSUMERS,
};

describe('computeEcPj', () => {
  it('sums rated×hours and direct kWh entries (MCRU appendix)', () => {
    expect(computeEcPj(MCRU_CONSUMERS)).toBe(5801.68);
  });
  it('returns 0 for missing/empty tables', () => {
    expect(computeEcPj(undefined)).toBe(0);
    expect(computeEcPj([])).toBe(0);
  });
});

describe('computeYearlyTable — reproduces the MCRU reference PDD', () => {
  const ctx = { project: PROJECT, factors: TGO_FACTORS, sectionData: MCRU_DATA };
  const table = computeYearlyTable(ctx)!;

  it('BE per year (2-dp) matches the form', () => {
    expect(table.rows.map((r) => r.be)).toEqual([451.31, 449.5, 447.7, 445.91, 444.13, 442.35, 440.58]);
  });
  it('PE is constant 2.72 tCO2/yr', () => {
    expect(table.rows.every((r) => r.pe === 2.72)).toBe(true);
  });
  it('yearly ER is floored to whole tCO2e', () => {
    expect(table.rows.map((r) => r.er)).toEqual([448, 446, 444, 443, 441, 439, 437]);
  });
  it('totals and averages match the form', () => {
    expect(table.totals.be).toBe(3121.48);
    expect(table.totals.er).toBe(3098);
    expect(table.avg.be).toBe(445.93);
    expect(table.avg.er).toBe(443);
  });
  it('returns null without a grid factor', () => {
    expect(computeYearlyTable({ project: PROJECT, factors: [], sectionData: MCRU_DATA })).toBeNull();
  });
});

describe('resolveComputed — new sources', () => {
  const ctx = { project: PROJECT, factors: TGO_FACTORS, sectionData: MCRU_DATA };
  it('annual_generation honors the year-1 override', () => {
    expect(resolveComputed('annual_generation', ctx)).toBe(963915);
  });
  it('ec_pj / be_annual / pe_annual / er_annual', () => {
    expect(resolveComputed('ec_pj', ctx)).toBe(5801.68);
    expect(resolveComputed('be_annual', ctx)).toBe(445.93);
    expect(resolveComputed('pe_annual', ctx)).toBe(2.72);
    expect(resolveComputed('er_annual', ctx)).toBe(443);
  });
});
```

- [x] **Step 2: Run to verify failure** — `npx vitest run src/lib/pdd.test.ts` → FAIL (functions not exported).

- [x] **Step 3: Implement** in `lib/pdd.ts` (below `resolveComputed`; `gridFactor` already exists):

```ts
const round2 = (n: number) => Math.round(n * 100) / 100;

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Σ project electricity consumers (kWh/yr): direct kwh_year, else rated_w × hours ÷ 1000. */
export function computeEcPj(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let total = 0;
  for (const r of rows as Array<Record<string, unknown>>) {
    const direct = numOrNull(r.kwh_year);
    if (direct !== null) { total += direct; continue; }
    const w = numOrNull(r.rated_w);
    const h = numOrNull(r.hours_per_year);
    if (w !== null && h !== null) total += (w * h) / 1000;
  }
  return round2(total);
}

/** Year-1 generation: explicit PVsyst-style override, else the capacity model. */
export function year1GenerationKwh(ctx: ComputeContext): number {
  const override = numOrNull(ctx.sectionData.year1_generation_kwh);
  if (override !== null && override > 0) return override;
  const raw = numOrNull(ctx.sectionData.performance_ratio);
  const pr = raw !== null && raw > 0 ? raw : DEFAULT_PERFORMANCE_RATIO;
  return ctx.project.capacity_kwp * SUN_HOURS_PER_DAY * 365 * pr;
}

export interface PddYearlyRow {
  year: number; generation_kwh: number;
  be: number; pe: number; le: number; er: number;
}
export interface PddYearlyTable {
  rows: PddYearlyRow[];
  totals: { be: number; pe: number; le: number; er: number };
  avg: { be: number; pe: number; le: number; er: number };
  ef: number;
  years: number;
}

/**
 * Crediting-period table exactly as the TGO form computes it:
 * gen_y = gen_1 × (1 − d)^(y−1); BE_y = gen_y × EF ÷ 1000 (2 dp);
 * PE constant from the consumers table; ER_y = floor(BE_y − PE − LE) — the
 * form truncates yearly ER to whole tCO2e (448.59 → 448).
 */
export function computeYearlyTable(ctx: ComputeContext): PddYearlyTable | null {
  const ef = gridFactor(ctx);
  if (ef === null) return null;
  const years = numOrNull(ctx.sectionData.crediting_years) ?? 7;
  const d = (numOrNull(ctx.sectionData.degradation_pct) ?? 0) / 100;
  const gen1 = year1GenerationKwh(ctx);
  const pe = round2((computeEcPj(ctx.sectionData.consumers) * ef) / 1000);
  const rows: PddYearlyRow[] = [];
  for (let y = 1; y <= years; y++) {
    const gen = gen1 * Math.pow(1 - d, y - 1);
    const be = round2((gen * ef) / 1000);
    rows.push({ year: y, generation_kwh: Math.round(gen), be, pe, le: 0, er: Math.floor(be - pe) });
  }
  const totals = {
    be: round2(rows.reduce((a, r) => a + r.be, 0)),
    pe: round2(rows.reduce((a, r) => a + r.pe, 0)),
    le: 0,
    er: rows.reduce((a, r) => a + r.er, 0),
  };
  const avg = { be: round2(totals.be / years), pe, le: 0, er: Math.round(totals.er / years) };
  return { rows, totals, avg, ef, years };
}
```

Extend `resolveComputed`'s switch:

```ts
    case 'annual_generation': return Math.round(year1GenerationKwh(ctx));
    case 'ec_pj': return computeEcPj(ctx.sectionData.consumers);
    case 'be_annual':
    case 'pe_annual':
    case 'er_annual': {
      const t = computeYearlyTable(ctx);
      if (!t) return null;
      return source === 'be_annual' ? t.avg.be : source === 'pe_annual' ? t.avg.pe : t.avg.er;
    }
```

- [x] **Step 4: Run** — `npx vitest run src/lib/pdd.test.ts` → PASS (every MCRU row).
- [x] **Step 5: Commit** — `git commit -m "feat(pdd): yearly BE/PE/ER table + EC_PJ, exact TGO-form rounding"`

---

### Task 4: Extend the T-VER-S-01 methodology document + regenerate server seed

**Files:**
- Modify: `carbon-ready/src/data/methodology-tver-solar.ts`
- Create: `carbon-ready/scripts/export-methodology-seed.ts`
- Regenerate: `server/prisma/seed-data/methodologies/meth-tver-solar.json`
- Test: `carbon-ready/src/lib/methodology-schema.test.ts` (roundtrip)

- [x] **Step 1: Failing roundtrip test:**

```ts
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';

it('extended T-VER solar methodology roundtrips through the JSON contract', () => {
  const res = parseMethodologyJson(methodologyToJson(TVER_SOLAR_METHODOLOGY));
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.methodology.document_template).toBe('T-VER-S-F001-PDD');
    const keys = res.methodology.pdd_sections.flatMap((s) => s.fields.map((f) => f.key));
    for (const k of ['project_title_th', 'installations', 'consumers', 'crediting_years', 'degradation_pct', 'preparer_name']) {
      expect(keys).toContain(k);
    }
  }
});
```

- [x] **Step 2: Extend the methodology** — set `document_template: 'T-VER-S-F001-PDD'` and these sections (existing A–E stay; new fields appended where noted). Full section list:

```ts
  document_template: 'T-VER-S-F001-PDD',
  pdd_sections: [
    {
      key: 'cover',
      title: 'หน้าปก / รายละเอียดโครงการ (T-VER-S-F001)',
      help: 'ข้อมูลตารางรายละเอียดโครงการหน้า 2 ของฟอร์ม อบก.',
      fields: [
        { key: 'project_title_th', label: 'ชื่อโครงการ (ภาษาไทย)', type: 'text', required: true },
        { key: 'project_title_en', label: 'ชื่อโครงการ (ภาษาอังกฤษ)', type: 'text', required: false },
        { key: 'project_owner', label: 'เจ้าของโครงการ / ผู้พัฒนาโครงการ', type: 'text', required: true },
        { key: 'co_developer', label: 'ผู้พัฒนาโครงการร่วม', type: 'text', required: false },
        { key: 'investment_mthb', label: 'เงินลงทุนทั้งหมดของโครงการ', type: 'number', required: false, unit: 'ล้านบาท' },
        { key: 'project_scale', label: 'ขนาดโครงการ', type: 'select', options: ['เล็กมาก', 'เล็ก', 'ใหญ่'], required: true },
        { key: 'crediting_years', label: 'ระยะเวลาคิดคาร์บอนเครดิต', type: 'select', options: ['7', '10'], required: true, unit: 'ปี' },
        { key: 'crediting_start', label: 'วันเริ่มคิดเครดิต (Crediting Start Date)', type: 'date', required: true },
      ],
    },
    {
      key: 'preparer',
      title: 'ผู้จัดทำเอกสาร / ผู้ประสานงาน',
      fields: [
        { key: 'doc_completed_date', label: 'วันที่จัดทำแล้วเสร็จ', type: 'date', required: false },
        { key: 'doc_revision', label: 'เอกสารฉบับที่', type: 'text', required: false },
        { key: 'preparer_name', label: 'ผู้จัดทำเอกสาร — ชื่อ-นามสกุล', type: 'text', required: true },
        { key: 'preparer_position', label: 'ผู้จัดทำเอกสาร — ตำแหน่ง', type: 'text', required: false },
        { key: 'preparer_org', label: 'ผู้จัดทำเอกสาร — หน่วยงาน', type: 'text', required: false },
        { key: 'preparer_phone', label: 'ผู้จัดทำเอกสาร — เบอร์ติดต่อ', type: 'text', required: false },
        { key: 'coordinator_name', label: 'ผู้ประสานงาน — ชื่อ-นามสกุล', type: 'text', required: true },
        { key: 'coordinator_position', label: 'ผู้ประสานงาน — ตำแหน่ง', type: 'text', required: false },
        { key: 'coordinator_phone', label: 'ผู้ประสานงาน — โทรศัพท์', type: 'text', required: false },
        { key: 'coordinator_email', label: 'ผู้ประสานงาน — E-mail', type: 'email', required: false },
      ],
    },
    {
      key: 'project_info',   // existing section A + 3 new fields at the end
      title: 'A. Project description / ข้อมูลโครงการ',
      help: 'Core project identity. Some values are pulled from the registered project record.',
      fields: [
        /* …existing five fields unchanged… */
        { key: 'before_project', label: 'ก่อนดำเนินโครงการ', type: 'textarea', required: false },
        { key: 'after_project', label: 'หลังดำเนินโครงการ / กิจกรรมของโครงการ', type: 'textarea', required: false },
        { key: 'installations', label: 'อุปกรณ์หลักที่ติดตั้งรายอาคาร', type: 'table', required: false,
          columns: [
            { key: 'building', label: 'พื้นที่ติดตั้ง', type: 'text' },
            { key: 'coordinates', label: 'พิกัด', type: 'text' },
            { key: 'panels', label: 'จำนวนแผง (แผ่น)', type: 'number' },
            { key: 'inverters', label: 'อินเวอร์เตอร์ (เครื่อง)', type: 'number' },
            { key: 'kwp', label: 'ขนาดติดตั้ง', type: 'number', unit: 'kWp' },
          ] },
      ],
    },
    {
      key: 'double_counting',
      title: '1.3 การนับซ้ำ (Double Counting)',
      fields: [
        { key: 'registered_elsewhere', label: 'เคย/อยู่ระหว่างขึ้นทะเบียนกลไกอื่น (CDM, VCS, Gold Standard, REC)', type: 'select', options: ['ไม่มี', 'มี'], required: true },
        { key: 'registry_name', label: 'ชื่อโครงการที่ขึ้นทะเบียน', type: 'text', required: true, showIf: { field: 'registered_elsewhere', equals: 'มี' } },
        { key: 'registry_scheme', label: 'ชื่อกลไก/มาตรฐาน', type: 'text', required: true, showIf: { field: 'registered_elsewhere', equals: 'มี' } },
        { key: 'registry_period', label: 'ช่วงระยะเวลาที่ขอรับรองเครดิต', type: 'text', required: true, showIf: { field: 'registered_elsewhere', equals: 'มี' } },
      ],
    },
    /* baseline (B) unchanged */
    /* additionality (C) unchanged */
    {
      key: 'ghg_reduction',   // existing section D + new fields; er_estimate stays
      title: 'D. GHG emission reduction (ex-ante) / การลดก๊าซเรือนกระจก',
      help: 'Ex-ante estimate. The yearly table is auto-calculated from year-1 generation, degradation, and the consumers table.',
      fields: [
        { key: 'performance_ratio', label: 'Performance ratio', type: 'number', required: true, help: 'Typical rooftop solar PR ≈ 0.75–0.85.' },
        { key: 'year1_generation_kwh', label: 'ไฟฟ้าที่คาดว่าจะผลิตได้ปีที่ 1', type: 'number', required: false, unit: 'kWh',
          help: 'จากรายงาน PVsyst / การประเมินผู้ติดตั้ง เว้นว่างเพื่อใช้แบบจำลองของระบบ (capacity × 4.0 h × 365 × PR)' },
        { key: 'degradation_pct', label: 'อัตราการเสื่อมของแผงต่อปี', type: 'number', required: true, unit: '%', help: 'โดยทั่วไป 0.40% ต่อปี' },
        { key: 'consumers', label: 'อุปกรณ์ไฟฟ้าที่ใช้ในโครงการ (คำนวณ EC_PJ)', type: 'table', required: false,
          columns: [
            { key: 'equipment', label: 'รายการอุปกรณ์', type: 'text' },
            { key: 'rated_w', label: 'พิกัดอุปกรณ์', type: 'number', unit: 'W' },
            { key: 'hours_per_year', label: 'ชั่วโมงการทำงานต่อปี', type: 'number' },
            { key: 'kwh_year', label: 'กรอกตรง (ถ้ามี)', type: 'number', unit: 'kWh/ปี' },
            { key: 'note', label: 'หมายเหตุ', type: 'text' },
          ] },
        { key: 'annual_generation', label: 'EG (ปีที่ 1)', type: 'computed', source: 'annual_generation', required: false, unit: 'kWh/year' },
        { key: 'ec_pj', label: 'EC_PJ — ไฟฟ้าที่ใช้ในโครงการ', type: 'computed', source: 'ec_pj', required: false, unit: 'kWh/year' },
        { key: 'be_annual', label: 'BE เฉลี่ย', type: 'computed', source: 'be_annual', required: false, unit: 'tCO₂e/yr' },
        { key: 'pe_annual', label: 'PE เฉลี่ย', type: 'computed', source: 'pe_annual', required: false, unit: 'tCO₂e/yr' },
        { key: 'er_annual', label: 'ER เฉลี่ย', type: 'computed', source: 'er_annual', required: false, unit: 'tCO₂e/yr' },
        { key: 'er_estimate', label: 'Estimated annual reduction', type: 'computed', source: 'er_estimate', required: false, unit: 'tCO₂e/yr' },
      ],
    },
    /* monitoring_plan (E) unchanged */
  ],
```

- [x] **Step 3: Run** — `npx vitest run src/lib/methodology-schema.test.ts` → PASS. Also run the full SPA suite (`npm test`) — seeded-PDD tests must still pass (new required fields are only enforced on *submit*, existing registered fixtures are unaffected; fix any fixture-dependent test that asserts section counts).

- [x] **Step 4: Seed export script** — `carbon-ready/scripts/export-methodology-seed.ts`:

```ts
// Regenerates server/prisma/seed-data/methodologies/*.json from the SPA
// methodology sources (methodologyToJson is the single serializer).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { methodologyToJson } from '../src/lib/methodology-schema';
import { TVER_SOLAR_METHODOLOGY } from '../src/data/methodology-tver-solar';

const outDir = resolve(__dirname, '../../server/prisma/seed-data/methodologies');
writeFileSync(resolve(outDir, `${TVER_SOLAR_METHODOLOGY.id}.json`), methodologyToJson(TVER_SOLAR_METHODOLOGY) + '\n');
console.log(`wrote ${TVER_SOLAR_METHODOLOGY.id}.json`);
```

Run: `cd carbon-ready && npx tsx scripts/export-methodology-seed.ts` → `wrote meth-tver-solar.json`. Verify with `git diff --stat ../server/prisma/seed-data`.

- [x] **Step 5: Server seed sanity** — `cd server && npm run typecheck && npx vitest run` → PASS (seed JSON parses under the mirrored schema).
- [x] **Step 6: Commit** — `git commit -m "feat(methodology): T-VER-S-01 full T-VER-S-F001-PDD field set + seed regen"`

---

### Task 5: Table field editor in the Registration form

**Files:**
- Modify: `carbon-ready/src/pages/Registration.tsx` (FieldInput)
- Test: `carbon-ready/src/pages/registration.ui.test.tsx`

- [x] **Step 1: Failing UI test** (solar PDD `PDD-2000` from `seedDemo()` now has table fields):

```ts
describe('table field editor', () => {
  function renderEditor() {
    return render(
      <MemoryRouter initialEntries={['/registration/PDD-2000']}>
        <Routes><Route path="/registration/:pddId" element={<Registration />} /></Routes>
      </MemoryRouter>,
    );
  }
  it('adds and removes rows on a table field', () => {
    renderEditor();
    // navigate to section A (project_info) via its progress chip
    fireEvent.click(screen.getByRole('button', { name: 'A.' }));
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มแถว/ }));
    expect(screen.getAllByPlaceholderText('พื้นที่ติดตั้ง').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /ลบแถว/ }));
    expect(screen.queryAllByPlaceholderText('พื้นที่ติดตั้ง').length).toBe(0);
  });
});
```

- [x] **Step 2: Run to verify failure**, then implement `TableFieldInput` in `Registration.tsx` and branch to it from `FieldInput` (`if (field.type === 'table') return <TableFieldInput … />;` before the computed branch):

```tsx
function TableFieldInput({ field, value, readonly, onChange }: {
  field: PddFieldSchema; value: unknown; readonly: boolean; onChange: (v: unknown) => void;
}) {
  const columns = field.columns ?? [];
  const rows = (Array.isArray(value) ? value : []) as Array<Record<string, unknown>>;
  const setCell = (ri: number, key: string, v: unknown) =>
    onChange(rows.map((r, i) => (i === ri ? { ...r, [key]: v } : r)));
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-ink-700">{field.label}</span>
      <div className="overflow-x-auto rounded-lg ring-1 ring-ink-200">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs text-ink-500">
            <tr>
              {columns.map((c) => <th key={c.key} className="px-2 py-1.5 font-medium">{c.label}{c.unit ? ` (${c.unit})` : ''}</th>)}
              {!readonly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t border-ink-100">
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-1">
                    <input
                      className="w-full rounded border border-ink-200 px-2 py-1 text-sm disabled:bg-ink-50"
                      type={c.type === 'number' ? 'number' : 'text'}
                      placeholder={c.label}
                      disabled={readonly}
                      value={String(row[c.key] ?? '')}
                      onChange={(e) => setCell(ri, c.key, c.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                    />
                  </td>
                ))}
                {!readonly && (
                  <td className="px-1 text-center">
                    <button type="button" aria-label={`ลบแถว ${ri + 1}`} className="text-ink-400 hover:text-red-600"
                      onClick={() => onChange(rows.filter((_, i) => i !== ri))}>✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readonly && (
        <Button variant="ghost" className="mt-1" onClick={() => onChange([...rows, {}])}>+ เพิ่มแถว</Button>
      )}
      {field.help && <span className="mt-1 block text-xs text-ink-400">{field.help}</span>}
    </div>
  );
}
```

(Adjust the test's chip name/selectors to the actual rendered chip label — chips render `s.title.split(' ')[0]`.)

- [x] **Step 3: Run** — `npx vitest run src/pages/registration.ui.test.tsx` → PASS.
- [x] **Step 4: Commit** — `git commit -m "feat(registration): row-based editor for table PDD fields"`

---

### Task 6: Official TGO document template + export button

**Files:**
- Create: `carbon-ready/src/templates/TverSF001Pdd.tsx`
- Modify: `carbon-ready/src/App.tsx` (route `/registration/:pddId/official`)
- Modify: `carbon-ready/src/pages/PddDocument.tsx` (button, shown when `methodology.document_template` is set)
- Test: `carbon-ready/src/templates/tver-sf001.ui.test.tsx`

**Layout contract (from the reference PDF):**
- Every logical page starts with the TGO header box: 3-row bordered table — row1 "โครงการลดก๊าซเรือนกระจกภาคสมัครใจตามมาตรฐานของประเทศไทย", row2 "Standard T-VER", row3 "เอกสารข้อเสนอโครงการ (PDD) แบบเดี่ยว"; right column "T-VER-S-F001-PDD" / "VERSION 2.1" and a page chip.
- Font stack: `'Sarabun', 'Leelawadee UI', 'Thonburi', 'Tahoma', sans-serif` (no external fetch).
- Checkboxes render ☑ (selected) / ☐; bordered tables `border-collapse` with 1px `#333` borders; A4 print CSS (`@page { size: A4; margin: 18mm 15mm; }`, `.page-break { break-before: page; }`), all app chrome hidden via `print:hidden` on the toolbar.
- Static Thai boilerplate (section 2.2 applicability rows with standard rationales, 2.3 emission-source rows, section 4 parameter cards for EF/EG/EC) is hardcoded in the template — identical for every project under T-VER-S-01; dynamic values (EF, parameter numbers, monitoring text from section E answers) are injected.

- [x] **Step 1: Failing UI test:**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TverSF001Pdd } from './TverSF001Pdd';
import { seedDemo } from '../test/demoFixtures';
import { useStore } from '../store';

beforeEach(() => { localStorage.clear(); seedDemo(); });

function seedOfficialData() {
  // PDD-2000 = registered solar PDD in the demo fixtures
  useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!.section_data = {
    ...useStore.getState().pdds.find((p) => p.id === 'PDD-2000')!.section_data,
    project_title_th: 'โครงการทดสอบพลังงานแสงอาทิตย์',
    project_owner: 'บริษัท ทดสอบ จำกัด',
    project_scale: 'เล็กมาก',
    crediting_years: '7',
    crediting_start: '2026-01-01',
    year1_generation_kwh: 963915,
    degradation_pct: 0.4,
    consumers: [{ equipment: 'Smart Logger', rated_w: 40, hours_per_year: 8760 }],
    registered_elsewhere: 'ไม่มี',
  };
}

describe('TverSF001Pdd official template', () => {
  it('renders the TGO form frame and cover values', () => {
    seedOfficialData();
    render(<MemoryRouter><TverSF001Pdd pddId="PDD-2000" /></MemoryRouter>);
    expect(screen.getAllByText('T-VER-S-F001-PDD').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/VERSION 2.1/).length).toBeGreaterThan(0);
    expect(screen.getByText('โครงการทดสอบพลังงานแสงอาทิตย์')).toBeInTheDocument();
    expect(screen.getByText(/ขนาดโครงการ/)).toBeInTheDocument();
  });
  it('renders the crediting-period yearly table with computed ER', () => {
    seedOfficialData();
    render(<MemoryRouter><TverSF001Pdd pddId="PDD-2000" /></MemoryRouter>);
    // year-1 BE from 963,915 kWh at the seeded factor is present in the table
    expect(screen.getByTestId('yearly-table')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Implement the template** — `TverSF001Pdd.tsx` structure (component skeleton; full Thai boilerplate copied from the reference PDF sections listed above):

```tsx
import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { useStore } from '../store';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { computeYearlyTable, computeEcPj, year1GenerationKwh, resolveComputed } from '../lib/pdd';

const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const Check = ({ on }: { on: boolean }) => <span className="mr-1 inline-block w-4 text-center">{on ? '☑' : '☐'}</span>;

function HeaderBox({ page }: { page?: string }) { /* bordered 3-row TGO header table, right column form code + version + page chip */ }
function SectionBar({ children }: { children: React.ReactNode }) { /* gray full-width section title bar */ }

export function TverSF001Pdd({ pddId: pddIdProp }: { pddId?: string } = {}) {
  const params = useParams();
  const pddId = pddIdProp ?? params.pddId;
  const pdd = useStore((s) => s.pdds.find((p) => p.id === pddId));
  const methodology = useStore((s) => s.methodologies.find((m) => m.id === pdd?.methodology_id));
  const project = useStore((s) => s.projects.find((p) => p.id === pdd?.project_id));
  const factors = useStore((s) => s.factors);
  if (!pdd || !methodology || !project) return <EmptyState title="PDD not found" hint="This document does not exist." />;

  const d = pdd.section_data as Record<string, unknown>;
  const ctx = { project, factors, sectionData: d };
  const table = computeYearlyTable(ctx);
  const str = (k: string) => { const v = d[k]; return v === undefined || v === null || v === '' ? '-' : String(v); };
  const installations = (Array.isArray(d.installations) ? d.installations : []) as Array<Record<string, unknown>>;
  const consumers = (Array.isArray(d.consumers) ? d.consumers : []) as Array<Record<string, unknown>>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link to={`/registration/${pdd.id}/document`}><Button variant="ghost"><ArrowLeft size={16} /> Back</Button></Link>
        <Button onClick={() => window.print()}><Printer size={16} /> Print / PDF</Button>
      </div>
      <div className="tver-doc bg-white p-8 text-[13px] leading-relaxed text-black shadow print:p-0 print:shadow-none"
        style={{ fontFamily: "'Sarabun','Leelawadee UI','Thonburi','Tahoma',sans-serif" }}>
        {/* — cover table: ชื่อโครงการ (ไทย/EN), ผู้พัฒนา, เจ้าของ, ที่ตั้ง (project.location), พิกัด+อุปกรณ์จาก installations,
             ประเภทโครงการ checkbox list (พลังงานหมุนเวียน ☑), รูปแบบ (แบบเดี่ยว ☑), ขนาด ☑ ตาม project_scale,
             ระเบียบวิธี (methodology.code/name/version), เงินลงทุน, er_annual, ระยะเวลาเครดิต ☑ 7/10 ปี — */}
        {/* — preparer + coordinator tables — */}
        {/* — ส่วนที่ 1: before_project / after_project, ตารางที่ 1 installations, 1.3 การนับซ้ำ ☑, 1.4 additionality (Positive List boilerplate), 1.5 crediting period — */}
        {/* — ส่วนที่ 2: methodology table + hardcoded applicability & emission-source boilerplate — */}
        {/* — ส่วนที่ 3: BE (สมการ + parameter table: EG=year1, EF, BE), PE (EC_PJ + parameter table), LE = ไม่เกี่ยวข้อง,
             3.4 สรุป ER, 3.5 yearly table data-testid="yearly-table" rows from computeYearlyTable — */}
        {/* — ส่วนที่ 4: monitoring plan — section E answers + hardcoded parameter cards (EF_EC, EG, EC) — */}
        {/* — ภาคผนวก: consumers table with per-row kWh and EC_PJ total — */}
      </div>
      <style>{`@media print { @page { size: A4; margin: 18mm 15mm; } body { background: white; } }
        .tver-doc table { border-collapse: collapse; width: 100%; }
        .tver-doc td, .tver-doc th { border: 1px solid #333; padding: 4px 8px; vertical-align: top; }
        .page-break { break-before: page; }`}</style>
    </div>
  );
}
```

Every commented block must be fully written out with the Thai labels/boilerplate from the reference PDF (documented in the layout contract above); dynamic values come from `str()`, `fmt()`, `table`, `installations`, `consumers`, `resolveComputed`. Sensitive-field masking: this template only renders cover/technical fields, none of which are sensitive in T-VER-S-01 (`investment_metric`/`barrier_explanation` are not rendered) — render section C as the Positive-List declaration only.

- [x] **Step 3: Route + button** — in `App.tsx`: `<Route path="/registration/:pddId/official" element={<TverSF001Pdd />} />`. In `PddDocument.tsx` toolbar:

```tsx
{methodology.document_template === 'T-VER-S-F001-PDD' && (
  <Link to={`/registration/${pdd.id}/official`}><Button variant="ghost"><FileText size={16} /> เอกสารฟอร์ม อบก.</Button></Link>
)}
```

- [x] **Step 4: Run** — `npx vitest run src/templates/tver-sf001.ui.test.tsx src/pages/pdddocument.ui.test.tsx` → PASS.
- [x] **Step 5: Commit** — `git commit -m "feat(pdd): T-VER-S-F001-PDD official document template + export"`

---

### Task 7: Full verification

- [x] **Step 1:** `cd carbon-ready && npm test && npm run build` → all green.
- [x] **Step 2:** `cd server && npm run typecheck && npm test` → all green.
- [x] **Step 3:** Manual/verify pass: `npm run dev`, open a solar PDD → เอกสารฟอร์ม อบก. → check the cover table, checkboxes, yearly table numbers, print preview page breaks.
- [x] **Step 4:** Final commit of any fixups; do NOT push (single long-lived branch `feat/sprint-1-mvp`, user pushes).

## Self-review notes

- Spec coverage: schema extension (T1/T2), calc (T3), methodology + seed (T4), editor (T5), template/button/route (T6), tests throughout. Applicability boilerplate is hardcoded in the template rather than editable fields — deviation from spec's "prefilled editable" noted; editable overrides can be added later without schema changes.
- Existing behavior preserved: `er_estimate`, disclosure, content hash untouched; `validatePdd` gains only the `[]`-is-empty rule (affects new required tables only — no existing required field is a table).
- Fixture risk: `seedDemo()` PDDs gain new *required* fields ⇒ any test that re-submits a demo PDD must fill them; check `registration.ui.test.tsx` flows that hit Review/submit and update their data entry accordingly.
