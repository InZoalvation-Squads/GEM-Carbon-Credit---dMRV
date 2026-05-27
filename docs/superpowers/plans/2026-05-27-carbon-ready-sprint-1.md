# Carbon Ready Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clickable Vite + React + Tailwind SPA that implements the Carbon Ready Sprint 1 MVP — project CRUD, CSV monitoring upload with validation, emission factor versioning, carbon calculation engine, dashboard with KPIs and charts, and append-only audit log — backed by a stubbed Zustand store that matches the documented REST API contracts.

**Architecture:** Single-page React app, Zustand store persisted to `localStorage`, stubbed `api.ts` module returning Promises that read/write the store (mirroring the future Sprint 2 REST endpoints). Pure-function libraries for CSV validation and carbon calculation are TDD-driven with Vitest. Every state-changing store action automatically writes an `audit_logs` entry.

**Tech Stack:** Vite 5, React 18, TypeScript 5, Tailwind CSS 3, React Router 6, Recharts 2, Zustand 4, PapaParse 5, date-fns 3, Lucide React, Vitest 1.

**Source spec:** `docs/superpowers/specs/2026-05-27-carbon-ready-sprint-1-design.md`

---

## File Structure

```
carbon-ready/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── README.md
├── .gitignore
└── src/
    ├── main.tsx                        # Entry, mounts <App/>
    ├── App.tsx                         # BrowserRouter + routes
    ├── index.css                       # Tailwind directives + base styles
    ├── types/
    │   └── index.ts                    # Project, MonitoringRecord, EmissionFactor, CalculationResult, AuditLog, User, Organization
    ├── lib/
    │   ├── csv.ts                      # parseAndValidateCsv() — pure
    │   ├── csv.test.ts                 # ≥12 unit tests
    │   ├── calc.ts                     # calculateCarbon() — pure
    │   ├── calc.test.ts                # ≥8 unit tests
    │   ├── date.ts                     # formatDate, monthKey helpers
    │   ├── format.ts                   # formatKwh, formatTco2e, formatNumber
    │   └── api.ts                      # Stub REST client → store
    ├── store/
    │   ├── index.ts                    # createAppStore, persist middleware
    │   ├── projects.ts                 # slice
    │   ├── monitoring.ts               # slice
    │   ├── factors.ts                  # slice
    │   ├── calculations.ts             # slice
    │   ├── audit.ts                    # slice + writeAudit helper
    │   └── selectors.ts                # dashboard KPI derivations
    ├── data/
    │   └── seed.ts                     # 3 projects, ~180 days records each, 3 EFs, 1 user
    ├── layouts/
    │   └── AppShell.tsx                # Sidebar + TopBar + <Outlet/>
    ├── components/
    │   ├── Sidebar.tsx
    │   ├── TopBar.tsx
    │   ├── Card.tsx
    │   ├── KpiCard.tsx
    │   ├── Button.tsx
    │   ├── Input.tsx
    │   ├── Select.tsx
    │   ├── Textarea.tsx
    │   ├── Modal.tsx
    │   ├── Drawer.tsx
    │   ├── Table.tsx
    │   ├── Badge.tsx
    │   ├── FileDrop.tsx
    │   ├── EmptyState.tsx
    │   ├── PageHeader.tsx
    │   └── charts/
    │       ├── DailyGenerationChart.tsx
    │       └── MonthlyReductionChart.tsx
    └── pages/
        ├── Dashboard.tsx
        ├── Projects.tsx
        ├── ProjectDetail.tsx
        ├── Upload.tsx
        ├── Calculations.tsx
        ├── EmissionFactors.tsx
        └── AuditLog.tsx
```

**Decomposition principles:**
- Pure libraries (`lib/csv.ts`, `lib/calc.ts`) have no React or store imports — easy to unit test.
- Store slices are split by entity; selectors live in their own module so components don't compute KPIs inline.
- API stub layer (`lib/api.ts`) is the *only* place pages call into for mutations — page → api → store → audit. This lets Sprint 2 swap `lib/api.ts` to `fetch()` without touching pages.
- Charts are isolated components consuming arrays — testable in isolation, swappable for a different chart library later.

---

## Task 1: Bootstrap project

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/index.css`

- [ ] **Step 1: Initialize Vite + React + TS project**

Run from repo root:
```bash
npm create vite@5 carbon-ready -- --template react-ts
cd carbon-ready
```

This creates a `carbon-ready/` subdirectory with Vite scaffolding. All subsequent paths in this plan are relative to `carbon-ready/`.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install react-router-dom@6 zustand@4 recharts@2 papaparse@5 date-fns@3 lucide-react clsx
npm install -D @types/papaparse tailwindcss@3 postcss autoprefixer vitest@1 @testing-library/react @testing-library/jest-dom jsdom @types/node
```

- [ ] **Step 3: Initialize Tailwind**

```bash
npx tailwindcss init -p
```

- [ ] **Step 4: Replace `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        ink: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          700: '#334155',
          900: '#0f172a',
        },
        accent: { 500: '#14b8a6' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15,23,42,0.04), 0 1px 3px 0 rgba(15,23,42,0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 5: Replace `src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body {
  @apply bg-ink-50 text-ink-900 font-sans antialiased;
}
*:focus-visible {
  @apply outline-none ring-2 ring-brand-500 ring-offset-2 ring-offset-white rounded;
}
```

- [ ] **Step 6: Configure Vitest in `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

- [ ] **Step 7: Create `src/test-setup.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 8: Add scripts to `package.json`**

Modify the `"scripts"` block to:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 9: Replace `src/App.tsx` with placeholder routing skeleton**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<div className="p-8">Carbon Ready — bootstrap OK</div>} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 10: Verify dev server boots**

Run: `npm run dev`
Expected: Vite prints a local URL, opening it shows "Carbon Ready — bootstrap OK". Stop with Ctrl+C.

- [ ] **Step 11: Verify tests run**

Run: `npm test`
Expected: "No test files found" exit 0 (or a similar empty-pass message — Vitest exits 0 when there are no tests).

- [ ] **Step 12: Commit**

```bash
git add carbon-ready/
git commit -m "feat: bootstrap Vite + React + TS + Tailwind project"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Write the type definitions**

```ts
export type UUID = string;

export type ProjectStatus = 'draft' | 'active' | 'suspended' | 'retired';
export type UserRole = 'admin' | 'project_owner' | 'esg_manager' | 'verifier';
export type AuditAction =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'CSV_UPLOADED'
  | 'CALCULATION_EXECUTED'
  | 'EMISSION_FACTOR_ADDED';
export type EntityType = 'project' | 'monitoring' | 'factor' | 'calculation';
export type PeriodType = 'daily' | 'monthly' | 'total';

export interface Organization {
  id: UUID;
  name: string;
  country: string;
  created_at: string;
}

export interface User {
  id: UUID;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Project {
  id: UUID;
  organization_id: UUID;
  name: string;
  location: string;
  capacity_kwp: number;
  commission_date: string;       // ISO date
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface MonitoringRecord {
  id: UUID;
  project_id: UUID;
  record_date: string;           // ISO date
  generation_kwh: number;
  source: string;
  uploaded_at: string;
}

export interface EmissionFactor {
  id: UUID;
  country: string;
  source: string;
  factor_kgco2e_per_kwh: number;
  effective_date: string;        // ISO date
  version: number;
  is_current: boolean;
  created_at: string;
}

export interface CalculationResult {
  id: UUID;
  project_id: UUID;
  emission_factor_id: UUID;
  period_date: string;
  period_type: PeriodType;
  generation_kwh: number;
  reduction_kgco2e: number;
  calculated_at: string;
}

export interface AuditLog {
  id: UUID;
  user_id: UUID;
  action: AuditAction;
  entity_type: EntityType;
  entity_id: UUID | null;
  payload: Record<string, unknown>;
  hcs_topic_id: string | null;
  hcs_sequence_number: number | null;
  created_at: string;
}

export type CsvErrorCode =
  | 'DUPLICATE_DATE'
  | 'MISSING_DATE'
  | 'NEGATIVE_VALUE'
  | 'INVALID_NUMBER'
  | 'INVALID_DATE';

export interface CsvRowError {
  row: number;
  code: CsvErrorCode;
  date?: string;
  value?: string | number;
}

export interface CsvValidationResult {
  accepted: Array<{ record_date: string; generation_kwh: number }>;
  rejected: CsvRowError[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/types/
git commit -m "feat: shared TypeScript types matching DB schema"
```

---

## Task 3: CSV validation library (TDD)

**Files:**
- Create: `src/lib/csv.ts`, `src/lib/csv.test.ts`

- [ ] **Step 1: Write the failing test file**

`src/lib/csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseAndValidateCsv } from './csv';

const header = 'Date,Generation_kWh\n';

describe('parseAndValidateCsv', () => {
  it('accepts a valid CSV', () => {
    const csv = header + '2026-01-01,120.5\n2026-01-02,118.2\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(2);
    expect(r.rejected).toHaveLength(0);
    expect(r.accepted[0]).toEqual({ record_date: '2026-01-01', generation_kwh: 120.5 });
  });

  it('rejects missing date', () => {
    const csv = header + ',120.5\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].code).toBe('MISSING_DATE');
  });

  it('rejects negative generation', () => {
    const csv = header + '2026-01-01,-3.2\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.rejected[0].code).toBe('NEGATIVE_VALUE');
    expect(r.rejected[0].value).toBe(-3.2);
  });

  it('rejects non-numeric generation', () => {
    const csv = header + '2026-01-01,abc\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.rejected[0].code).toBe('INVALID_NUMBER');
  });

  it('rejects invalid date format', () => {
    const csv = header + '01/01/2026,120\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.rejected[0].code).toBe('INVALID_DATE');
  });

  it('rejects duplicate dates within file', () => {
    const csv = header + '2026-01-01,120\n2026-01-01,130\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejected[0].code).toBe('DUPLICATE_DATE');
    expect(r.rejected[0].date).toBe('2026-01-01');
  });

  it('rejects dates already in existing records', () => {
    const csv = header + '2026-01-01,120\n';
    const r = parseAndValidateCsv(csv, ['2026-01-01']);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected[0].code).toBe('DUPLICATE_DATE');
  });

  it('partially accepts a mixed-validity file', () => {
    const csv =
      header +
      '2026-01-01,120\n' +
      '2026-01-02,-5\n' +
      '2026-01-03,abc\n' +
      '2026-01-04,200\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted.map((a) => a.record_date)).toEqual(['2026-01-01', '2026-01-04']);
    expect(r.rejected.map((x) => x.code)).toEqual(['NEGATIVE_VALUE', 'INVALID_NUMBER']);
  });

  it('strips BOM and trims whitespace', () => {
    const csv = '﻿' + header + '  2026-01-01 , 120.5 \n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].record_date).toBe('2026-01-01');
  });

  it('accepts zero generation', () => {
    const csv = header + '2026-01-01,0\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.accepted).toHaveLength(1);
  });

  it('reports correct row numbers (1-indexed, header is row 1)', () => {
    const csv = header + '2026-01-01,120\n,50\n';
    const r = parseAndValidateCsv(csv, []);
    expect(r.rejected[0].row).toBe(3);
  });

  it('handles empty file gracefully', () => {
    const r = parseAndValidateCsv('', []);
    expect(r.accepted).toHaveLength(0);
    expect(r.rejected).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- src/lib/csv.test.ts`
Expected: All 12 tests fail with "parseAndValidateCsv is not defined" or similar.

- [ ] **Step 3: Implement `src/lib/csv.ts`**

```ts
import Papa from 'papaparse';
import type { CsvRowError, CsvValidationResult } from '../types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseAndValidateCsv(
  csvText: string,
  existingDates: string[]
): CsvValidationResult {
  const trimmed = csvText.replace(/^﻿/, '').trim();
  if (!trimmed) return { accepted: [], rejected: [] };

  const parsed = Papa.parse<string[]>(trimmed, { skipEmptyLines: true });
  const rows = parsed.data;
  if (rows.length <= 1) return { accepted: [], rejected: [] };

  const accepted: CsvValidationResult['accepted'] = [];
  const rejected: CsvRowError[] = [];
  const seenInFile = new Set<string>();
  const existing = new Set(existingDates);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1; // header is row 1
    const dateRaw = (row[0] ?? '').trim();
    const valRaw  = (row[1] ?? '').trim();

    if (!dateRaw) { rejected.push({ row: rowNum, code: 'MISSING_DATE' }); continue; }
    if (!ISO_DATE.test(dateRaw) || Number.isNaN(Date.parse(dateRaw))) {
      rejected.push({ row: rowNum, code: 'INVALID_DATE', date: dateRaw }); continue;
    }
    const val = Number(valRaw);
    if (valRaw === '' || Number.isNaN(val)) {
      rejected.push({ row: rowNum, code: 'INVALID_NUMBER', date: dateRaw, value: valRaw }); continue;
    }
    if (val < 0) {
      rejected.push({ row: rowNum, code: 'NEGATIVE_VALUE', date: dateRaw, value: val }); continue;
    }
    if (seenInFile.has(dateRaw) || existing.has(dateRaw)) {
      rejected.push({ row: rowNum, code: 'DUPLICATE_DATE', date: dateRaw }); continue;
    }
    seenInFile.add(dateRaw);
    accepted.push({ record_date: dateRaw, generation_kwh: val });
  }
  return { accepted, rejected };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- src/lib/csv.test.ts`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat: CSV parser + validator with 12 unit tests"
```

---

## Task 4: Carbon calculation engine (TDD)

**Files:**
- Create: `src/lib/calc.ts`, `src/lib/calc.test.ts`

- [ ] **Step 1: Write the failing test file**

`src/lib/calc.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { calculateCarbon, pickFactorForDate } from './calc';
import type { EmissionFactor, MonitoringRecord } from '../types';

const ef = (over: Partial<EmissionFactor>): EmissionFactor => ({
  id: 'ef-1', country: 'IN', source: 'CEA', factor_kgco2e_per_kwh: 0.82,
  effective_date: '2025-01-01', version: 1, is_current: true,
  created_at: '2025-01-01T00:00:00Z', ...over,
});

const mr = (date: string, kwh: number): MonitoringRecord => ({
  id: 'm-' + date, project_id: 'p1', record_date: date,
  generation_kwh: kwh, source: 'csv_upload', uploaded_at: '2026-01-01T00:00:00Z',
});

describe('pickFactorForDate', () => {
  it('returns the latest factor whose effective_date <= given date', () => {
    const factors = [
      ef({ id: 'a', version: 1, effective_date: '2024-01-01', factor_kgco2e_per_kwh: 0.90 }),
      ef({ id: 'b', version: 2, effective_date: '2025-04-01', factor_kgco2e_per_kwh: 0.82 }),
    ];
    expect(pickFactorForDate(factors, '2024-06-01')?.id).toBe('a');
    expect(pickFactorForDate(factors, '2025-04-01')?.id).toBe('b');
    expect(pickFactorForDate(factors, '2026-01-01')?.id).toBe('b');
  });

  it('returns undefined if no factor effective by the date', () => {
    const factors = [ef({ effective_date: '2027-01-01' })];
    expect(pickFactorForDate(factors, '2026-01-01')).toBeUndefined();
  });

  it('matches on country+source only (ignores unrelated factors)', () => {
    const factors = [
      ef({ id: 'a', country: 'IN', source: 'CEA' }),
      ef({ id: 'b', country: 'TH', source: 'EGAT' }),
    ];
    const pick = pickFactorForDate(factors.filter(f => f.country === 'TH' && f.source === 'EGAT'), '2026-01-01');
    expect(pick?.id).toBe('b');
  });
});

describe('calculateCarbon', () => {
  const factor = ef({ factor_kgco2e_per_kwh: 0.82 });

  it('computes per-record reduction', () => {
    const r = calculateCarbon([mr('2026-01-01', 100)], [factor]);
    expect(r.daily[0]).toMatchObject({ date: '2026-01-01', generation_kwh: 100, reduction_kgco2e: 82 });
  });

  it('rolls up monthly', () => {
    const r = calculateCarbon(
      [mr('2026-01-01', 100), mr('2026-01-02', 200), mr('2026-02-01', 50)],
      [factor]
    );
    const jan = r.monthly.find(m => m.period === '2026-01')!;
    const feb = r.monthly.find(m => m.period === '2026-02')!;
    expect(jan.generation_kwh).toBe(300);
    expect(jan.reduction_kgco2e).toBeCloseTo(246, 3);
    expect(feb.generation_kwh).toBe(50);
  });

  it('rolls up total', () => {
    const r = calculateCarbon([mr('2026-01-01', 100), mr('2026-02-01', 50)], [factor]);
    expect(r.totals.generation_kwh).toBe(150);
    expect(r.totals.reduction_kgco2e).toBeCloseTo(123, 3);
    expect(r.totals.reduction_tco2e).toBeCloseTo(0.123, 4);
  });

  it('uses the correct EF version for each record date', () => {
    const factors = [
      ef({ id: 'old', version: 1, effective_date: '2024-01-01', factor_kgco2e_per_kwh: 0.90 }),
      ef({ id: 'new', version: 2, effective_date: '2026-01-01', factor_kgco2e_per_kwh: 0.82 }),
    ];
    const r = calculateCarbon(
      [mr('2025-06-01', 100), mr('2026-06-01', 100)],
      factors
    );
    expect(r.daily.find(d => d.date === '2025-06-01')?.reduction_kgco2e).toBeCloseTo(90, 3);
    expect(r.daily.find(d => d.date === '2026-06-01')?.reduction_kgco2e).toBeCloseTo(82, 3);
  });

  it('skips records with no applicable factor', () => {
    const r = calculateCarbon([mr('2020-01-01', 100)], [ef({ effective_date: '2025-01-01' })]);
    expect(r.daily).toHaveLength(0);
    expect(r.totals.generation_kwh).toBe(0);
  });

  it('filters by date range when provided', () => {
    const r = calculateCarbon(
      [mr('2026-01-01', 100), mr('2026-02-01', 200), mr('2026-03-01', 300)],
      [factor],
      { from: '2026-02-01', to: '2026-02-28' }
    );
    expect(r.totals.generation_kwh).toBe(200);
  });

  it('returns zeros for empty input', () => {
    const r = calculateCarbon([], [factor]);
    expect(r.totals).toEqual({ generation_kwh: 0, reduction_kgco2e: 0, reduction_tco2e: 0 });
    expect(r.daily).toHaveLength(0);
    expect(r.monthly).toHaveLength(0);
  });

  it('returns the EF id used (most recent applied)', () => {
    const r = calculateCarbon([mr('2026-01-01', 100)], [factor]);
    expect(r.emission_factor_id).toBe(factor.id);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test -- src/lib/calc.test.ts`
Expected: All tests fail — module not found.

- [ ] **Step 3: Implement `src/lib/calc.ts`**

```ts
import type { EmissionFactor, MonitoringRecord } from '../types';

export interface CalculationOutput {
  emission_factor_id: string | null;
  totals: { generation_kwh: number; reduction_kgco2e: number; reduction_tco2e: number };
  daily: Array<{ date: string; generation_kwh: number; reduction_kgco2e: number; emission_factor_id: string }>;
  monthly: Array<{ period: string; generation_kwh: number; reduction_kgco2e: number }>;
}

export function pickFactorForDate(
  factors: EmissionFactor[],
  isoDate: string
): EmissionFactor | undefined {
  return factors
    .filter((f) => f.effective_date <= isoDate)
    .sort((a, b) =>
      a.effective_date === b.effective_date
        ? b.version - a.version
        : b.effective_date.localeCompare(a.effective_date)
    )[0];
}

export function calculateCarbon(
  records: MonitoringRecord[],
  factors: EmissionFactor[],
  range?: { from?: string; to?: string }
): CalculationOutput {
  const daily: CalculationOutput['daily'] = [];
  let lastEfId: string | null = null;

  for (const r of records) {
    if (range?.from && r.record_date < range.from) continue;
    if (range?.to   && r.record_date > range.to)   continue;
    const factor = pickFactorForDate(factors, r.record_date);
    if (!factor) continue;
    lastEfId = factor.id;
    daily.push({
      date: r.record_date,
      generation_kwh: r.generation_kwh,
      reduction_kgco2e: round3(r.generation_kwh * factor.factor_kgco2e_per_kwh),
      emission_factor_id: factor.id,
    });
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));

  const monthlyMap = new Map<string, { generation_kwh: number; reduction_kgco2e: number }>();
  for (const d of daily) {
    const key = d.date.slice(0, 7);
    const cur = monthlyMap.get(key) ?? { generation_kwh: 0, reduction_kgco2e: 0 };
    cur.generation_kwh += d.generation_kwh;
    cur.reduction_kgco2e += d.reduction_kgco2e;
    monthlyMap.set(key, cur);
  }
  const monthly = [...monthlyMap.entries()]
    .map(([period, v]) => ({ period, ...round3Obj(v) }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const totalGen = daily.reduce((s, d) => s + d.generation_kwh, 0);
  const totalRed = daily.reduce((s, d) => s + d.reduction_kgco2e, 0);

  return {
    emission_factor_id: lastEfId,
    totals: {
      generation_kwh: round3(totalGen),
      reduction_kgco2e: round3(totalRed),
      reduction_tco2e: round3(totalRed / 1000),
    },
    daily,
    monthly,
  };
}

function round3(n: number) { return Math.round(n * 1000) / 1000; }
function round3Obj(o: { generation_kwh: number; reduction_kgco2e: number }) {
  return { generation_kwh: round3(o.generation_kwh), reduction_kgco2e: round3(o.reduction_kgco2e) };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- src/lib/calc.test.ts`
Expected: All tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/calc.ts src/lib/calc.test.ts
git commit -m "feat: carbon calculation engine with EF version selection"
```

---

## Task 5: Format and date helpers

**Files:**
- Create: `src/lib/format.ts`, `src/lib/date.ts`

- [ ] **Step 1: Write `src/lib/format.ts`**

```ts
export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function formatKwh(n: number): string {
  if (n >= 1_000_000) return formatNumber(n / 1_000_000, 2) + ' GWh';
  if (n >= 1_000)     return formatNumber(n / 1_000, 1) + ' MWh';
  return formatNumber(n, 1) + ' kWh';
}
export function formatTco2e(kg: number): string {
  return formatNumber(kg / 1000, 2) + ' tCO₂e';
}
```

- [ ] **Step 2: Write `src/lib/date.ts`**

```ts
import { format, parseISO } from 'date-fns';

export function fmtDate(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy');
}
export function fmtDateTime(iso: string): string {
  return format(parseISO(iso), 'd MMM yyyy, HH:mm');
}
export function monthLabel(yyyyMm: string): string {
  return format(parseISO(yyyyMm + '-01'), 'MMM yyyy');
}
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/format.ts src/lib/date.ts
git commit -m "feat: number, kWh, tCO2e and date formatting helpers"
```

---

## Task 6: Seed data

**Files:**
- Create: `src/data/seed.ts`

- [ ] **Step 1: Write `src/data/seed.ts`**

```ts
import type {
  Organization, Project, MonitoringRecord, EmissionFactor, User, AuditLog
} from '../types';

const uid = (p: string, n: number) => `${p}-${String(n).padStart(4, '0')}`;

export const seedOrg: Organization = {
  id: 'org-0001', name: 'GreenGrid Asia', country: 'IN',
  created_at: '2025-01-01T00:00:00Z',
};

export const seedUser: User = {
  id: 'usr-0001', email: 'asha@greengrid.example', name: 'Asha Iyer',
  role: 'esg_manager', created_at: '2025-01-01T00:00:00Z',
};

export const seedFactors: EmissionFactor[] = [
  { id: 'ef-0001', country: 'IN', source: 'CEA',  factor_kgco2e_per_kwh: 0.82, effective_date: '2024-01-01', version: 1, is_current: false, created_at: '2024-01-01T00:00:00Z' },
  { id: 'ef-0002', country: 'IN', source: 'CEA',  factor_kgco2e_per_kwh: 0.79, effective_date: '2025-04-01', version: 2, is_current: true,  created_at: '2025-04-01T00:00:00Z' },
  { id: 'ef-0003', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.51, effective_date: '2024-01-01', version: 1, is_current: true,  created_at: '2024-01-01T00:00:00Z' },
  { id: 'ef-0004', country: 'VN', source: 'EVN',  factor_kgco2e_per_kwh: 0.68, effective_date: '2024-01-01', version: 1, is_current: true,  created_at: '2024-01-01T00:00:00Z' },
];

export const seedProjects: Project[] = [
  { id: 'prj-0001', organization_id: seedOrg.id, name: 'Pune Rooftop Phase 1',  location: 'Pune, India',     capacity_kwp: 250,  commission_date: '2025-03-15', status: 'active', created_at: '2025-03-15T00:00:00Z', updated_at: '2025-03-15T00:00:00Z' },
  { id: 'prj-0002', organization_id: seedOrg.id, name: 'Bangkok Industrial Park',location: 'Bangkok, Thailand',capacity_kwp: 820,  commission_date: '2024-11-01', status: 'active', created_at: '2024-11-01T00:00:00Z', updated_at: '2024-11-01T00:00:00Z' },
  { id: 'prj-0003', organization_id: seedOrg.id, name: 'Hanoi Warehouse Cluster',location: 'Hanoi, Vietnam',  capacity_kwp: 510,  commission_date: '2026-02-10', status: 'draft',  created_at: '2026-02-10T00:00:00Z', updated_at: '2026-02-10T00:00:00Z' },
];

// Pseudo-deterministic daily kWh generator: kWp × ~4 sun-hours × seasonal modifier × jitter
function generationFor(kwp: number, dateIso: string, seed: number): number {
  const d = new Date(dateIso);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const seasonal = 0.85 + 0.25 * Math.sin((2 * Math.PI * dayOfYear) / 365);
  // deterministic pseudo-random in [0.85, 1.15]
  const jitter = 0.85 + 0.3 * ((Math.sin(seed * 9301 + dayOfYear * 49297) * 0.5 + 0.5));
  const sunHours = 4.0;
  return Math.round(kwp * sunHours * seasonal * jitter * 10) / 10;
}

function rangeDates(fromIso: string, days: number): string[] {
  const start = new Date(fromIso);
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function buildRecords(): MonitoringRecord[] {
  const out: MonitoringRecord[] = [];
  let counter = 0;
  // Only active projects get records
  for (const p of seedProjects.filter((x) => x.status === 'active')) {
    const dates = rangeDates('2025-12-01', 180); // Dec 2025 → ~May 2026
    for (const date of dates) {
      counter++;
      out.push({
        id: uid('mon', counter),
        project_id: p.id,
        record_date: date,
        generation_kwh: generationFor(p.capacity_kwp, date, p.capacity_kwp),
        source: 'csv_upload',
        uploaded_at: '2026-05-26T18:30:00Z',
      });
    }
  }
  return out;
}

export const seedRecords: MonitoringRecord[] = buildRecords();

export const seedAudit: AuditLog[] = [
  { id: 'aud-0001', user_id: seedUser.id, action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 'prj-0001', payload: { name: 'Pune Rooftop Phase 1' }, hcs_topic_id: null, hcs_sequence_number: null, created_at: '2025-03-15T09:12:00Z' },
  { id: 'aud-0002', user_id: seedUser.id, action: 'PROJECT_CREATED', entity_type: 'project', entity_id: 'prj-0002', payload: { name: 'Bangkok Industrial Park' }, hcs_topic_id: null, hcs_sequence_number: null, created_at: '2024-11-01T10:05:00Z' },
  { id: 'aud-0003', user_id: seedUser.id, action: 'EMISSION_FACTOR_ADDED', entity_type: 'factor', entity_id: 'ef-0002', payload: { country: 'IN', source: 'CEA', version: 2 }, hcs_topic_id: null, hcs_sequence_number: null, created_at: '2025-04-01T08:00:00Z' },
  { id: 'aud-0004', user_id: seedUser.id, action: 'CSV_UPLOADED', entity_type: 'monitoring', entity_id: 'prj-0001', payload: { accepted: 180, rejected: 0 }, hcs_topic_id: null, hcs_sequence_number: null, created_at: '2026-05-26T18:30:00Z' },
];
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/data/seed.ts
git commit -m "feat: seed data — 3 projects, ~360 records, 4 emission factors"
```

---

## Task 7: Zustand store

**Files:**
- Create: `src/store/index.ts`, `src/store/audit.ts`, `src/store/selectors.ts`

- [ ] **Step 1: Write `src/store/audit.ts`**

```ts
import type { AuditAction, AuditLog, EntityType, UUID } from '../types';

let auditSeq = 0;
export function newAudit(
  userId: UUID,
  action: AuditAction,
  entity_type: EntityType,
  entity_id: UUID | null,
  payload: Record<string, unknown> = {}
): AuditLog {
  auditSeq++;
  return {
    id: `aud-${Date.now()}-${auditSeq}`,
    user_id: userId,
    action,
    entity_type,
    entity_id,
    payload,
    hcs_topic_id: null,
    hcs_sequence_number: null,
    created_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: Write `src/store/index.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Project, MonitoringRecord, EmissionFactor, CalculationResult,
  AuditLog, User, Organization, UUID, AuditAction, EntityType,
} from '../types';
import {
  seedOrg, seedUser, seedFactors, seedProjects, seedRecords, seedAudit,
} from '../data/seed';
import { newAudit } from './audit';

interface AppState {
  currentUser: User;
  organization: Organization;
  projects: Project[];
  records: MonitoringRecord[];
  factors: EmissionFactor[];
  calculations: CalculationResult[];
  audit: AuditLog[];

  audit_write: (action: AuditAction, entity_type: EntityType, entity_id: UUID | null, payload?: Record<string, unknown>) => void;

  createProject: (p: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id'>) => Project;
  updateProject: (id: UUID, patch: Partial<Project>) => Project | undefined;

  addMonitoringRecords: (project_id: UUID, rows: Array<{ record_date: string; generation_kwh: number }>) => number;

  addEmissionFactor: (input: Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>) => EmissionFactor;

  recordCalculation: (project_id: UUID, emission_factor_id: UUID, totals: { generation_kwh: number; reduction_kgco2e: number }) => void;

  resetToSeed: () => void;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: seedUser,
      organization: seedOrg,
      projects: seedProjects,
      records: seedRecords,
      factors: seedFactors,
      calculations: [],
      audit: seedAudit,

      audit_write: (action, entity_type, entity_id, payload = {}) =>
        set((s) => ({ audit: [newAudit(s.currentUser.id, action, entity_type, entity_id, payload), ...s.audit] })),

      createProject: (input) => {
        const now = new Date().toISOString();
        const p: Project = { id: uid('prj'), organization_id: get().organization.id, created_at: now, updated_at: now, ...input };
        set((s) => ({ projects: [p, ...s.projects] }));
        get().audit_write('PROJECT_CREATED', 'project', p.id, { name: p.name });
        return p;
      },

      updateProject: (id, patch) => {
        let updated: Project | undefined;
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p;
            updated = { ...p, ...patch, updated_at: new Date().toISOString() };
            return updated;
          }),
        }));
        if (updated) get().audit_write('PROJECT_UPDATED', 'project', id, { changes: patch });
        return updated;
      },

      addMonitoringRecords: (project_id, rows) => {
        const uploaded_at = new Date().toISOString();
        const recs: MonitoringRecord[] = rows.map((r) => ({
          id: uid('mon'), project_id, source: 'csv_upload', uploaded_at, ...r,
        }));
        set((s) => ({ records: [...s.records, ...recs] }));
        get().audit_write('CSV_UPLOADED', 'monitoring', project_id, { accepted: rows.length });
        return recs.length;
      },

      addEmissionFactor: (input) => {
        const existing = get().factors.filter((f) => f.country === input.country && f.source === input.source);
        const nextVersion = existing.reduce((m, f) => Math.max(m, f.version), 0) + 1;
        const ef: EmissionFactor = {
          id: uid('ef'), version: nextVersion, is_current: true,
          created_at: new Date().toISOString(), ...input,
        };
        set((s) => ({
          factors: [
            ef,
            ...s.factors.map((f) =>
              f.country === input.country && f.source === input.source ? { ...f, is_current: false } : f
            ),
          ],
        }));
        get().audit_write('EMISSION_FACTOR_ADDED', 'factor', ef.id, { country: ef.country, source: ef.source, version: ef.version });
        return ef;
      },

      recordCalculation: (project_id, emission_factor_id, totals) => {
        get().audit_write('CALCULATION_EXECUTED', 'calculation', project_id, { emission_factor_id, ...totals });
      },

      resetToSeed: () => set({
        projects: seedProjects, records: seedRecords, factors: seedFactors, calculations: [], audit: seedAudit,
      }),
    }),
    { name: 'carbon-ready-store-v1' }
  )
);
```

- [ ] **Step 3: Write `src/store/selectors.ts`**

```ts
import { useStore } from './index';
import { calculateCarbon } from '../lib/calc';

export function useDashboardSummary() {
  const projects = useStore((s) => s.projects);
  const records  = useStore((s) => s.records);
  const factors  = useStore((s) => s.factors);

  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const latestUpload = records.reduce<string | null>(
    (latest, r) => (!latest || r.uploaded_at > latest ? r.uploaded_at : latest),
    null
  );

  // Aggregate per project then sum (each project uses its own country's EF)
  let totalGen = 0;
  let totalRedKg = 0;
  const dailyMap = new Map<string, number>();
  const monthlyMap = new Map<string, number>();

  for (const project of projects) {
    const country = project.location.split(',').pop()?.trim() ?? '';
    const countryCode = locationToCountryCode(country);
    const projectFactors = factors.filter((f) => f.country === countryCode);
    const projectRecords = records.filter((r) => r.project_id === project.id);
    const r = calculateCarbon(projectRecords, projectFactors);
    totalGen += r.totals.generation_kwh;
    totalRedKg += r.totals.reduction_kgco2e;
    for (const d of r.daily) {
      dailyMap.set(d.date, (dailyMap.get(d.date) ?? 0) + d.generation_kwh);
    }
    for (const m of r.monthly) {
      monthlyMap.set(m.period, (monthlyMap.get(m.period) ?? 0) + m.reduction_kgco2e);
    }
  }

  const daily_generation = [...dailyMap.entries()]
    .map(([date, kwh]) => ({ date, kwh }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90); // last ~90 days

  const monthly_reduction = [...monthlyMap.entries()]
    .map(([period, kg]) => ({ period, tco2e: kg / 1000 }))
    .sort((a, b) => a.period.localeCompare(b.period));

  return {
    kpis: {
      total_generation_kwh: totalGen,
      total_reduction_tco2e: totalRedKg / 1000,
      active_projects: activeProjects,
      latest_upload_at: latestUpload,
    },
    daily_generation,
    monthly_reduction,
  };
}

function locationToCountryCode(s: string): string {
  const map: Record<string, string> = { India: 'IN', Thailand: 'TH', Vietnam: 'VN' };
  return map[s] ?? s;
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/store/
git commit -m "feat: Zustand store with slices, persistence, and audit write-through"
```

---

## Task 8: API stub

**Files:**
- Create: `src/lib/api.ts`

- [ ] **Step 1: Write `src/lib/api.ts`**

```ts
import { useStore } from '../store';
import { parseAndValidateCsv } from './csv';
import { calculateCarbon } from './calc';
import type { Project, EmissionFactor, MonitoringRecord, CsvValidationResult, UUID } from '../types';

const tick = <T>(value: T, ms = 120): Promise<T> =>
  new Promise((res) => setTimeout(() => res(value), ms));

export const api = {
  async listProjects(): Promise<Project[]> {
    return tick(useStore.getState().projects);
  },
  async getProject(id: UUID): Promise<Project | undefined> {
    return tick(useStore.getState().projects.find((p) => p.id === id));
  },
  async createProject(input: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'organization_id'>): Promise<Project> {
    return tick(useStore.getState().createProject(input));
  },
  async updateProject(id: UUID, patch: Partial<Project>): Promise<Project | undefined> {
    return tick(useStore.getState().updateProject(id, patch));
  },

  async uploadMonitoringCsv(project_id: UUID, csvText: string): Promise<CsvValidationResult & { uploaded_at: string }> {
    const state = useStore.getState();
    const existing = state.records.filter((r) => r.project_id === project_id).map((r) => r.record_date);
    const result = parseAndValidateCsv(csvText, existing);
    if (result.accepted.length > 0) {
      state.addMonitoringRecords(project_id, result.accepted);
    }
    return tick({ ...result, uploaded_at: new Date().toISOString() });
  },

  async listMonitoring(project_id: UUID): Promise<MonitoringRecord[]> {
    return tick(useStore.getState().records.filter((r) => r.project_id === project_id));
  },

  async calculate(project_id: UUID, range?: { from?: string; to?: string }) {
    const state = useStore.getState();
    const project = state.projects.find((p) => p.id === project_id);
    if (!project) throw new Error('Project not found');
    const country = locationToCountryCode(project.location.split(',').pop()?.trim() ?? '');
    const factors = state.factors.filter((f) => f.country === country);
    const records = state.records.filter((r) => r.project_id === project_id);
    const result = calculateCarbon(records, factors, range);
    if (result.emission_factor_id) {
      state.recordCalculation(project_id, result.emission_factor_id, {
        generation_kwh: result.totals.generation_kwh,
        reduction_kgco2e: result.totals.reduction_kgco2e,
      });
    }
    return tick(result);
  },

  async listFactors(): Promise<EmissionFactor[]> {
    return tick(useStore.getState().factors);
  },
  async addFactor(input: Omit<EmissionFactor, 'id' | 'version' | 'is_current' | 'created_at'>): Promise<EmissionFactor> {
    return tick(useStore.getState().addEmissionFactor(input));
  },
};

function locationToCountryCode(s: string): string {
  const map: Record<string, string> = { India: 'IN', Thailand: 'TH', Vietnam: 'VN' };
  return map[s] ?? s;
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: stubbed API client backed by Zustand store"
```

---

## Task 9: Component kit

**Files:**
- Create: `src/components/Button.tsx`, `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Card.tsx`, `Badge.tsx`, `KpiCard.tsx`, `Modal.tsx`, `Drawer.tsx`, `Table.tsx`, `EmptyState.tsx`, `FileDrop.tsx`, `PageHeader.tsx`

- [ ] **Step 1: Write `src/components/Button.tsx`**

```tsx
import { ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'bg-white border border-ink-200 text-ink-900 hover:bg-ink-50',
  ghost:     'bg-transparent text-ink-700 hover:bg-ink-100',
  danger:    'bg-red-600 text-white hover:bg-red-700',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', className, ...rest }, ref
) {
  return (
    <button
      ref={ref}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
      {...rest}
    />
  );
});
```

- [ ] **Step 2: Write `src/components/Input.tsx`, `Select.tsx`, `Textarea.tsx`**

`src/components/Input.tsx`:
```tsx
import { InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, className, id, ...rest }, ref
) {
  const inputId = id ?? rest.name;
  return (
    <label className="block">
      {label && <span className="block mb-1 text-sm font-medium text-ink-700">{label}</span>}
      <input
        ref={ref} id={inputId}
        className={clsx(
          'block w-full rounded-md border border-ink-200 bg-white px-3 h-10 text-sm shadow-sm placeholder:text-ink-400',
          'focus:border-brand-500 focus:ring-1 focus:ring-brand-500',
          error && 'border-red-400', className
        )}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
});
```

`src/components/Select.tsx`:
```tsx
import { SelectHTMLAttributes, forwardRef, ReactNode } from 'react';
import clsx from 'clsx';

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: ReactNode;
}
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, className, children, id, ...rest }, ref
) {
  return (
    <label className="block">
      {label && <span className="block mb-1 text-sm font-medium text-ink-700">{label}</span>}
      <select
        ref={ref} id={id ?? rest.name}
        className={clsx(
          'block w-full rounded-md border border-ink-200 bg-white px-3 h-10 text-sm shadow-sm',
          'focus:border-brand-500 focus:ring-1 focus:ring-brand-500', className
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
});
```

`src/components/Textarea.tsx`:
```tsx
import { TextareaHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { label, className, id, ...rest }, ref
) {
  return (
    <label className="block">
      {label && <span className="block mb-1 text-sm font-medium text-ink-700">{label}</span>}
      <textarea
        ref={ref} id={id ?? rest.name}
        className={clsx(
          'block w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm',
          'focus:border-brand-500 focus:ring-1 focus:ring-brand-500', className
        )}
        {...rest}
      />
    </label>
  );
});
```

- [ ] **Step 3: Write `src/components/Card.tsx` and `Badge.tsx`**

`src/components/Card.tsx`:
```tsx
import { HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-xl border border-ink-200 bg-white shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}
export function CardHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      {action}
    </div>
  );
}
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('px-5 py-4', className)}>{children}</div>;
}
```

`src/components/Badge.tsx`:
```tsx
import { ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'green' | 'amber' | 'red' | 'gray' | 'blue';
const tones: Record<Tone, string> = {
  green: 'bg-brand-50 text-brand-700 ring-brand-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  red:   'bg-red-50 text-red-700 ring-red-100',
  gray:  'bg-ink-100 text-ink-700 ring-ink-200',
  blue:  'bg-sky-50 text-sky-700 ring-sky-100',
};
export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Write `src/components/KpiCard.tsx`**

```tsx
import { ReactNode } from 'react';
import { Card } from './Card';

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}
export function KpiCard({ label, value, hint, icon }: Props) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-ink-900">{value}</div>
          {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
        </div>
        {icon && <div className="text-brand-600">{icon}</div>}
      </div>
    </Card>
  );
}
```

- [ ] **Step 5: Write `src/components/Modal.tsx` and `Drawer.tsx`**

`src/components/Modal.tsx`:
```tsx
import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; title: string; children: ReactNode; }
export function Modal({ open, onClose, title, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-900"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
```

`src/components/Drawer.tsx`:
```tsx
import { ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props { open: boolean; onClose: () => void; title: string; children: ReactNode; }
export function Drawer({ open, onClose, title, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 sticky top-0 bg-white">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-500 hover:text-ink-900"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write `src/components/Table.tsx`, `EmptyState.tsx`, `PageHeader.tsx`**

`src/components/Table.tsx`:
```tsx
import { ReactNode } from 'react';
import clsx from 'clsx';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">{children}</thead>;
}
export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={clsx('border-b border-ink-100', className)}>{children}</tr>;
}
export function TH({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={clsx('px-5 py-3 text-left font-medium', className)}>{children}</th>;
}
export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={clsx('px-5 py-3 text-ink-700', className)}>{children}</td>;
}
```

`src/components/EmptyState.tsx`:
```tsx
import { ReactNode } from 'react';
export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode; }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && <div className="text-ink-300 mb-3">{icon}</div>}
      <div className="text-sm font-semibold text-ink-900">{title}</div>
      {hint && <div className="mt-1 text-sm text-ink-500 max-w-md">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

`src/components/PageHeader.tsx`:
```tsx
import { ReactNode } from 'react';
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 7: Write `src/components/FileDrop.tsx`**

```tsx
import { DragEvent, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import clsx from 'clsx';

interface Props { onFile: (f: File) => void; accept?: string; }
export function FileDrop({ onFile, accept = '.csv,text/csv' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      className={clsx(
        'cursor-pointer rounded-xl border-2 border-dashed bg-white px-6 py-12 text-center transition-colors',
        hover ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-brand-500'
      )}
    >
      <Upload className="mx-auto text-ink-400" size={32} />
      <div className="mt-3 text-sm font-medium text-ink-900">Drop CSV here, or click to browse</div>
      <div className="mt-1 text-xs text-ink-500">Expected columns: <code>Date, Generation_kWh</code></div>
      <input
        ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}
```

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/components/
git commit -m "feat: base UI component kit (Button, Input, Select, Card, KPI, Modal, Drawer, Table, FileDrop)"
```

---

## Task 10: App shell + routing

**Files:**
- Create: `src/layouts/AppShell.tsx`, `src/components/Sidebar.tsx`, `src/components/TopBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/components/Sidebar.tsx`**

```tsx
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Upload, Calculator, Gauge, ScrollText, Leaf } from 'lucide-react';
import clsx from 'clsx';

const links = [
  { to: '/dashboard',          label: 'Dashboard',         icon: LayoutDashboard },
  { to: '/projects',           label: 'Projects',          icon: FolderKanban },
  { to: '/upload',             label: 'Upload',            icon: Upload },
  { to: '/calculations',       label: 'Calculations',      icon: Calculator },
  { to: '/emission-factors',   label: 'Emission Factors',  icon: Gauge },
  { to: '/audit-log',          label: 'Audit Log',         icon: ScrollText },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <div
        className={clsx('fixed inset-0 z-30 bg-ink-900/40 md:hidden', open ? 'block' : 'hidden')}
        onClick={onClose}
      />
      <aside className={clsx(
        'fixed md:static z-40 w-60 h-full bg-ink-900 text-ink-100 flex-col',
        'transition-transform md:translate-x-0', open ? 'translate-x-0 flex' : '-translate-x-full hidden md:flex'
      )}>
        <div className="flex items-center gap-2 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded bg-brand-500 flex items-center justify-center"><Leaf size={18} className="text-white" /></div>
          <div className="font-semibold tracking-tight">Carbon Ready</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to} to={to} onClick={onClose}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white'
              )}
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs text-ink-400">
          v0.1.0 • Sprint 1 MVP
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Write `src/components/TopBar.tsx`**

```tsx
import { useStore } from '../store';
import { Menu, Bell, Search } from 'lucide-react';
import { Badge } from './Badge';

export function TopBar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const user = useStore((s) => s.currentUser);
  return (
    <header className="h-16 bg-white border-b border-ink-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button onClick={onOpenSidebar} className="md:hidden text-ink-700" aria-label="Open menu"><Menu /></button>
        <div className="hidden sm:flex items-center gap-2 text-sm text-ink-500">
          <Search size={16} />
          <input className="bg-transparent outline-none placeholder:text-ink-400 text-ink-900" placeholder="Search projects, factors..." />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button aria-label="Notifications" className="text-ink-500 hover:text-ink-900"><Bell size={18} /></button>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-ink-900">{user.name}</div>
            <div className="text-xs text-ink-500">{user.email}</div>
          </div>
          <Badge tone="green">{user.role.replace('_', ' ')}</Badge>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Write `src/layouts/AppShell.tsx`**

```tsx
import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex h-full">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-[1440px] mx-auto"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { UploadPage } from './pages/Upload';
import { Calculations } from './pages/Calculations';
import { EmissionFactors } from './pages/EmissionFactors';
import { AuditLogPage } from './pages/AuditLog';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/calculations" element={<Calculations />} />
          <Route path="/emission-factors" element={<EmissionFactors />} />
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="*" element={<div className="p-8 text-ink-500">Page not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Create placeholder page files so imports compile**

Create each file at `src/pages/<Name>.tsx` with a one-liner. Each will be replaced in the page tasks below.

```tsx
export function Dashboard() { return <div>Dashboard placeholder</div>; }
```
```tsx
export function Projects() { return <div>Projects placeholder</div>; }
```
```tsx
export function ProjectDetail() { return <div>ProjectDetail placeholder</div>; }
```
```tsx
export function UploadPage() { return <div>Upload placeholder</div>; }
```
```tsx
export function Calculations() { return <div>Calculations placeholder</div>; }
```
```tsx
export function EmissionFactors() { return <div>EmissionFactors placeholder</div>; }
```
```tsx
export function AuditLogPage() { return <div>AuditLog placeholder</div>; }
```

- [ ] **Step 6: Run dev server and click through nav**

Run: `npm run dev`
Open browser, click each sidebar link, confirm placeholders render and active state highlights correctly. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: app shell with sidebar, top bar, routing skeleton"
```

---

## Task 11: Charts

**Files:**
- Create: `src/components/charts/DailyGenerationChart.tsx`, `MonthlyReductionChart.tsx`

- [ ] **Step 1: Write `DailyGenerationChart.tsx`**

```tsx
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, parseISO } from 'date-fns';

interface Props { data: Array<{ date: string; kwh: number }>; height?: number; }
export function DailyGenerationChart({ data, height = 280 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="genGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), 'd MMM')} stroke="#94a3b8" tick={{ fontSize: 11 }} minTickGap={28} />
        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          labelFormatter={(d) => format(parseISO(String(d)), 'd MMM yyyy')}
          formatter={(v: number) => [`${v.toLocaleString()} kWh`, 'Generation']}
        />
        <Area type="monotone" dataKey="kwh" stroke="#10b981" strokeWidth={2} fill="url(#genGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Write `MonthlyReductionChart.tsx`**

```tsx
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format, parseISO } from 'date-fns';

interface Props { data: Array<{ period: string; tco2e: number }>; height?: number; }
export function MonthlyReductionChart({ data, height = 280 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="period" tickFormatter={(p) => format(parseISO(p + '-01'), 'MMM yy')} stroke="#94a3b8" tick={{ fontSize: 11 }} />
        <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          labelFormatter={(p) => format(parseISO(String(p) + '-01'), 'MMM yyyy')}
          formatter={(v: number) => [`${v.toFixed(2)} tCO₂e`, 'Reduction']}
        />
        <Bar dataKey="tco2e" fill="#14b8a6" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/charts/
git commit -m "feat: Recharts daily generation and monthly reduction components"
```

---

## Task 12: Dashboard page

**Files:**
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace `src/pages/Dashboard.tsx`**

```tsx
import { Card, CardBody, CardHeader } from '../components/Card';
import { KpiCard } from '../components/KpiCard';
import { PageHeader } from '../components/PageHeader';
import { DailyGenerationChart } from '../components/charts/DailyGenerationChart';
import { MonthlyReductionChart } from '../components/charts/MonthlyReductionChart';
import { useDashboardSummary } from '../store/selectors';
import { useStore } from '../store';
import { formatKwh, formatNumber } from '../lib/format';
import { fmtDateTime } from '../lib/date';
import { Zap, Leaf, FolderKanban, Clock } from 'lucide-react';

export function Dashboard() {
  const summary = useDashboardSummary();
  const audit = useStore((s) => s.audit).slice(0, 6);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Realtime overview of your solar rooftop portfolio" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Generation" value={formatKwh(summary.kpis.total_generation_kwh)} icon={<Zap size={20} />} />
        <KpiCard label="Carbon Reduction" value={`${formatNumber(summary.kpis.total_reduction_tco2e, 2)} tCO₂e`} icon={<Leaf size={20} />} />
        <KpiCard label="Active Projects" value={summary.kpis.active_projects} icon={<FolderKanban size={20} />} />
        <KpiCard
          label="Latest Upload"
          value={summary.kpis.latest_upload_at ? fmtDateTime(summary.kpis.latest_upload_at) : '—'}
          icon={<Clock size={20} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Daily Generation Trend" />
          <CardBody><DailyGenerationChart data={summary.daily_generation} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent Activity" />
          <CardBody className="space-y-3">
            {audit.length === 0 && <div className="text-sm text-ink-500">No activity yet.</div>}
            {audit.map((a) => (
              <div key={a.id} className="text-sm">
                <div className="font-medium text-ink-900">{a.action.replace(/_/g, ' ').toLowerCase()}</div>
                <div className="text-xs text-ink-500">{fmtDateTime(a.created_at)}</div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Monthly Carbon Reduction" />
        <CardBody><MonthlyReductionChart data={summary.monthly_reduction} /></CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Run dev server and view dashboard**

Run: `npm run dev`
Open `/dashboard`. Confirm: 4 KPI cards populated (Generation in MWh, Reduction in tCO₂e, 2 active projects, latest upload date), area chart for daily generation, bar chart for monthly reduction, recent activity list with ≥ 4 entries. No console errors. Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: dashboard with KPIs, generation/reduction charts, recent activity"
```

---

## Task 13: Projects list, create, edit

**Files:**
- Modify: `src/pages/Projects.tsx`

- [ ] **Step 1: Replace `src/pages/Projects.tsx`**

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil } from 'lucide-react';
import { Card } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { Drawer } from '../components/Drawer';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { api } from '../lib/api';
import { useStore } from '../store';
import { fmtDate } from '../lib/date';
import type { Project, ProjectStatus } from '../types';

const STATUSES: ProjectStatus[] = ['draft', 'active', 'suspended', 'retired'];

export function Projects() {
  const projects = useStore((s) => s.projects);
  const records = useStore((s) => s.records);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | ProjectStatus>('');

  const filtered = projects.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    return true;
  });

  const lastUpload = (projectId: string) =>
    records.filter((r) => r.project_id === projectId)
      .reduce<string | null>((latest, r) => (!latest || r.uploaded_at > latest ? r.uploaded_at : latest), null);

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Solar rooftop projects under your organisation"
        action={<Button onClick={() => setCreating(true)}><Plus size={16} /> New Project</Button>}
      />

      <Card className="mb-4 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | '')}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No projects yet" hint="Create a project to start tracking generation."
            action={<Button onClick={() => setCreating(true)}><Plus size={16} /> New Project</Button>} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH><TH>Location</TH><TH className="text-right">Capacity</TH>
                <TH>Status</TH><TH>Commissioned</TH><TH>Last Upload</TH><TH />
              </TR>
            </THead>
            <tbody>
              {filtered.map((p) => {
                const lu = lastUpload(p.id);
                return (
                  <TR key={p.id}>
                    <TD className="font-medium"><Link to={`/projects/${p.id}`} className="hover:text-brand-700">{p.name}</Link></TD>
                    <TD>{p.location}</TD>
                    <TD className="text-right">{p.capacity_kwp} kWp</TD>
                    <TD><StatusBadge status={p.status} /></TD>
                    <TD>{fmtDate(p.commission_date)}</TD>
                    <TD>{lu ? fmtDate(lu.slice(0, 10)) : '—'}</TD>
                    <TD className="text-right">
                      <button onClick={() => setEditing(p)} className="text-ink-500 hover:text-ink-900" aria-label="Edit">
                        <Pencil size={16} />
                      </button>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {creating && <CreateProjectModal onClose={() => setCreating(false)} />}
      {editing && <EditProjectDrawer project={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  const tone = status === 'active' ? 'green' : status === 'draft' ? 'gray' : status === 'suspended' ? 'amber' : 'red';
  return <Badge tone={tone as 'green' | 'gray' | 'amber' | 'red'}>{status}</Badge>;
}

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    name: '', location: '', capacity_kwp: '', commission_date: new Date().toISOString().slice(0, 10), status: 'draft' as ProjectStatus,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.location.trim()) errs.location = 'Required';
    const cap = Number(form.capacity_kwp);
    if (!form.capacity_kwp || Number.isNaN(cap) || cap <= 0) errs.capacity_kwp = 'Must be > 0';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    await api.createProject({
      name: form.name.trim(), location: form.location.trim(), capacity_kwp: cap,
      commission_date: form.commission_date, status: form.status,
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="New Project">
      <div className="space-y-4">
        <Input label="Project Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <Input label="Location" placeholder="e.g. Pune, India" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} error={errors.location} />
        <Input label="Capacity (kWp)" type="number" inputMode="decimal" value={form.capacity_kwp} onChange={(e) => setForm({ ...form, capacity_kwp: e.target.value })} error={errors.capacity_kwp} />
        <Input label="Commission Date" type="date" value={form.commission_date} onChange={(e) => setForm({ ...form, commission_date: e.target.value })} />
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Create Project</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditProjectDrawer({ project, onClose }: { project: Project; onClose: () => void }) {
  const [form, setForm] = useState({
    name: project.name, location: project.location,
    capacity_kwp: String(project.capacity_kwp),
    commission_date: project.commission_date, status: project.status,
  });
  const submit = async () => {
    await api.updateProject(project.id, {
      name: form.name.trim(), location: form.location.trim(),
      capacity_kwp: Number(form.capacity_kwp), commission_date: form.commission_date, status: form.status,
    });
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={`Edit ${project.name}`}>
      <div className="space-y-4">
        <Input label="Project Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <Input label="Capacity (kWp)" type="number" inputMode="decimal" value={form.capacity_kwp} onChange={(e) => setForm({ ...form, capacity_kwp: e.target.value })} />
        <Input label="Commission Date" type="date" value={form.commission_date} onChange={(e) => setForm({ ...form, commission_date: e.target.value })} />
        <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save Changes</Button>
        </div>
      </div>
    </Drawer>
  );
}
```

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev`
- Open `/projects` — 3 seed projects render.
- Click "+ New Project" → fill form → submit → row appears at top, audit log on dashboard shows new entry.
- Click pencil icon on a project → drawer opens with prefilled fields → change name → save → table updates.
- Submit empty form → inline errors show.
- Search by name and status filter both work.
Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Projects.tsx
git commit -m "feat: projects list with create modal, edit drawer, search and filter"
```

---

## Task 14: Project detail page

**Files:**
- Modify: `src/pages/ProjectDetail.tsx`

- [ ] **Step 1: Replace `src/pages/ProjectDetail.tsx`**

```tsx
import { useParams, Link } from 'react-router-dom';
import { useStore } from '../store';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Badge } from '../components/Badge';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/Button';
import { fmtDate } from '../lib/date';
import { formatNumber } from '../lib/format';
import { ChevronLeft, Upload as UploadIcon } from 'lucide-react';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const records = useStore((s) =>
    s.records.filter((r) => r.project_id === id).sort((a, b) => b.record_date.localeCompare(a.record_date))
  );

  if (!project) return <div className="text-sm text-ink-500">Project not found. <Link to="/projects" className="text-brand-700 underline">Back to list</Link></div>;

  const totalKwh = records.reduce((s, r) => s + r.generation_kwh, 0);

  return (
    <div>
      <div className="mb-4">
        <Link to="/projects" className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1"><ChevronLeft size={14} /> Projects</Link>
      </div>
      <PageHeader
        title={project.name}
        subtitle={`${project.location} • ${project.capacity_kwp} kWp • commissioned ${fmtDate(project.commission_date)}`}
        action={<Link to="/upload"><Button><UploadIcon size={16} /> Upload Data</Button></Link>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Status</div>
          <div className="mt-2"><Badge tone={project.status === 'active' ? 'green' : 'gray'}>{project.status}</Badge></div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Records</div>
          <div className="mt-2 text-2xl font-semibold">{records.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wide text-ink-500">Total Generation</div>
          <div className="mt-2 text-2xl font-semibold">{formatNumber(totalKwh, 1)} kWh</div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Monitoring Records" />
        <CardBody className="p-0">
          {records.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-ink-500">No records uploaded yet.</div>
          ) : (
            <Table>
              <THead><TR><TH>Date</TH><TH className="text-right">Generation (kWh)</TH><TH>Source</TH></TR></THead>
              <tbody>
                {records.slice(0, 50).map((r) => (
                  <TR key={r.id}>
                    <TD>{fmtDate(r.record_date)}</TD>
                    <TD className="text-right">{formatNumber(r.generation_kwh, 1)}</TD>
                    <TD className="text-ink-500">{r.source}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev`
- Open `/projects` → click a project name → detail page opens.
- Verify 3 KPI cards + records table showing latest 50 records of ~180.
Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectDetail.tsx
git commit -m "feat: project detail page with KPIs and recent records"
```

---

## Task 15: Upload page

**Files:**
- Modify: `src/pages/Upload.tsx`

- [ ] **Step 1: Replace `src/pages/Upload.tsx`**

```tsx
import { useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Select } from '../components/Select';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { FileDrop } from '../components/FileDrop';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import { parseAndValidateCsv } from '../lib/csv';
import { api } from '../lib/api';
import type { CsvValidationResult } from '../types';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export function UploadPage() {
  const projects = useStore((s) => s.projects);
  const records = useStore((s) => s.records);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [preview, setPreview] = useState<CsvValidationResult | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ accepted: number; rejected: number } | null>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    const existing = records.filter((r) => r.project_id === projectId).map((r) => r.record_date);
    const result = parseAndValidateCsv(text, existing);
    setPreview(result);
    setPendingText(text);
    setSubmitted(null);
  };

  const confirm = async () => {
    if (!pendingText || !projectId) return;
    const result = await api.uploadMonitoringCsv(projectId, pendingText);
    setSubmitted({ accepted: result.accepted.length, rejected: result.rejected.length });
    setPreview(null); setPendingText(null);
  };

  const reset = () => { setPreview(null); setPendingText(null); setSubmitted(null); };

  return (
    <div>
      <PageHeader title="Upload Monitoring Data" subtitle="Drop a CSV with daily generation; we'll validate row-by-row before saving." />

      <Card className="mb-4 p-4">
        <Select label="Project" value={projectId} onChange={(e) => { setProjectId(e.target.value); reset(); }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.location}</option>)}
        </Select>
      </Card>

      {!preview && !submitted && (
        <Card className="mb-4">
          <CardBody><FileDrop onFile={onFile} /></CardBody>
        </Card>
      )}

      {preview && (
        <Card className="mb-4">
          <CardHeader title="Validation Report" />
          <CardBody>
            <div className="flex items-center gap-3 mb-4">
              <Badge tone="green"><CheckCircle2 size={12} /> {preview.accepted.length} accepted</Badge>
              <Badge tone={preview.rejected.length ? 'red' : 'gray'}><AlertTriangle size={12} /> {preview.rejected.length} rejected</Badge>
            </div>
            {preview.rejected.length > 0 && (
              <Table>
                <THead><TR><TH>Row</TH><TH>Code</TH><TH>Date</TH><TH>Value</TH></TR></THead>
                <tbody>
                  {preview.rejected.slice(0, 50).map((r, i) => (
                    <TR key={i}>
                      <TD>{r.row}</TD>
                      <TD className="font-mono text-xs">{r.code}</TD>
                      <TD>{r.date ?? '—'}</TD>
                      <TD>{r.value ?? '—'}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={reset}>Cancel</Button>
              <Button onClick={confirm} disabled={preview.accepted.length === 0}>Confirm Upload {preview.accepted.length} rows</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {submitted && (
        <Card className="mb-4">
          <CardBody>
            <div className="text-sm">
              <span className="font-medium">Upload complete.</span> {submitted.accepted} rows saved, {submitted.rejected} rejected.
            </div>
            <div className="mt-3"><Button variant="secondary" onClick={reset}>Upload another file</Button></div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="CSV Format" />
        <CardBody>
          <pre className="bg-ink-50 text-xs p-3 rounded-md overflow-x-auto">{`Date,Generation_kWh
2026-01-01,1234.5
2026-01-02,1180.2`}</pre>
          <p className="mt-3 text-sm text-ink-500">Dates must be ISO-8601 (<code>YYYY-MM-DD</code>). Generation must be non-negative. Duplicate dates — within the file or against records already on the project — are rejected.</p>
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Test the upload happy path**

Run: `npm run dev`
- Open `/upload`, select a draft project (e.g. Hanoi Warehouse Cluster).
- Create a local file `test.csv`:
  ```
  Date,Generation_kWh
  2026-01-01,1200
  2026-01-02,-5
  2026-01-03,abc
  2026-01-04,1300
  2026-01-04,1400
  ```
- Drop the file. Expect: 2 accepted, 3 rejected, error codes `NEGATIVE_VALUE`, `INVALID_NUMBER`, `DUPLICATE_DATE`.
- Click "Confirm Upload 2 rows" → success message.
- Navigate to project detail → 2 new records visible.
- Navigate to dashboard → "Latest Upload" timestamp is recent; audit log entry for CSV_UPLOADED appears.
Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Upload.tsx
git commit -m "feat: CSV upload page with validation report and confirm flow"
```

---

## Task 16: Calculations page

**Files:**
- Modify: `src/pages/Calculations.tsx`

- [ ] **Step 1: Replace `src/pages/Calculations.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Select } from '../components/Select';
import { Button } from '../components/Button';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { PageHeader } from '../components/PageHeader';
import { KpiCard } from '../components/KpiCard';
import { MonthlyReductionChart } from '../components/charts/MonthlyReductionChart';
import { useStore } from '../store';
import { api } from '../lib/api';
import { formatNumber } from '../lib/format';
import { fmtDate } from '../lib/date';
import type { CalculationOutput } from '../lib/calc';
import { Calculator, Leaf, Zap } from 'lucide-react';

type Tab = 'daily' | 'monthly' | 'total';

export function Calculations() {
  const projects = useStore((s) => s.projects);
  const factors = useStore((s) => s.factors);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [tab, setTab] = useState<Tab>('monthly');
  const [result, setResult] = useState<CalculationOutput | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!projectId) return;
    setLoading(true);
    const r = await api.calculate(projectId);
    setResult(r);
    setLoading(false);
  };
  useEffect(() => { run(); /* run on project change */ }, [projectId]);

  const efUsed = result?.emission_factor_id ? factors.find((f) => f.id === result.emission_factor_id) : null;

  return (
    <div>
      <PageHeader
        title="Calculations"
        subtitle="Apply emission factors to monitoring data and roll up daily / monthly / total reductions."
        action={<Button onClick={run} disabled={loading}><Calculator size={16} /> {loading ? 'Calculating...' : 'Run Calculation'}</Button>}
      />

      <Card className="mb-4 p-4">
        <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Card>

      {efUsed && (
        <Card className="mb-4 p-4 text-sm">
          <span className="font-medium">Emission Factor:</span>{' '}
          {efUsed.country} / {efUsed.source} v{efUsed.version} —{' '}
          <span className="font-mono">{efUsed.factor_kgco2e_per_kwh} kgCO₂e/kWh</span>{' '}
          <span className="text-ink-500">(effective {fmtDate(efUsed.effective_date)})</span>
        </Card>
      )}

      {result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <KpiCard label="Total Generation" value={`${formatNumber(result.totals.generation_kwh, 1)} kWh`} icon={<Zap size={20} />} />
            <KpiCard label="Reduction (kgCO₂e)" value={formatNumber(result.totals.reduction_kgco2e, 1)} icon={<Leaf size={20} />} />
            <KpiCard label="Reduction (tCO₂e)" value={formatNumber(result.totals.reduction_tco2e, 3)} icon={<Leaf size={20} />} />
          </div>

          <Card className="mb-4">
            <CardHeader title="Monthly Reduction Trend" />
            <CardBody><MonthlyReductionChart data={result.monthly.map((m) => ({ period: m.period, tco2e: m.reduction_kgco2e / 1000 }))} /></CardBody>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-ink-100 flex gap-2">
              {(['daily', 'monthly', 'total'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={'px-3 py-1.5 text-sm rounded-md ' + (tab === t ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:text-ink-900')}
                >{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            <CardBody className="p-0">
              {tab === 'daily' && (
                <Table>
                  <THead><TR><TH>Date</TH><TH className="text-right">kWh</TH><TH className="text-right">kgCO₂e</TH></TR></THead>
                  <tbody>
                    {result.daily.slice(-90).reverse().map((d) => (
                      <TR key={d.date}><TD>{fmtDate(d.date)}</TD><TD className="text-right">{formatNumber(d.generation_kwh, 1)}</TD><TD className="text-right">{formatNumber(d.reduction_kgco2e, 1)}</TD></TR>
                    ))}
                  </tbody>
                </Table>
              )}
              {tab === 'monthly' && (
                <Table>
                  <THead><TR><TH>Month</TH><TH className="text-right">kWh</TH><TH className="text-right">tCO₂e</TH></TR></THead>
                  <tbody>
                    {result.monthly.map((m) => (
                      <TR key={m.period}><TD>{m.period}</TD><TD className="text-right">{formatNumber(m.generation_kwh, 1)}</TD><TD className="text-right">{formatNumber(m.reduction_kgco2e / 1000, 3)}</TD></TR>
                    ))}
                  </tbody>
                </Table>
              )}
              {tab === 'total' && (
                <div className="p-6 text-center">
                  <div className="text-4xl font-semibold">{formatNumber(result.totals.reduction_tco2e, 2)} tCO₂e</div>
                  <div className="mt-2 text-sm text-ink-500">across {formatNumber(result.totals.generation_kwh, 0)} kWh of generation</div>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev`
- Open `/calculations` → page auto-runs for first project, shows EF used, KPIs populated, monthly chart, tabbed daily/monthly/total tables.
- Switch project in dropdown → result refreshes.
- Click "Run Calculation" → audit log on dashboard shows new CALCULATION_EXECUTED entry.
Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Calculations.tsx
git commit -m "feat: calculation page with EF display, KPI summary, daily/monthly/total tabs"
```

---

## Task 17: Emission factors page

**Files:**
- Modify: `src/pages/EmissionFactors.tsx`

- [ ] **Step 1: Replace `src/pages/EmissionFactors.tsx`**

```tsx
import { useState } from 'react';
import { Card, CardBody } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import { api } from '../lib/api';
import { fmtDate } from '../lib/date';
import { Plus } from 'lucide-react';

export function EmissionFactors() {
  const factors = useStore((s) => s.factors);
  const [open, setOpen] = useState(false);

  const sorted = [...factors].sort((a, b) =>
    a.country.localeCompare(b.country) ||
    a.source.localeCompare(b.source) ||
    b.version - a.version
  );

  return (
    <div>
      <PageHeader
        title="Emission Factors"
        subtitle="Country-specific grid emission factors. Add a new entry to supersede an existing version."
        action={<Button onClick={() => setOpen(true)}><Plus size={16} /> Add Factor</Button>}
      />

      <Card>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Country</TH><TH>Source</TH><TH className="text-right">Factor (kgCO₂e/kWh)</TH>
                <TH>Effective Date</TH><TH>Version</TH><TH />
              </TR>
            </THead>
            <tbody>
              {sorted.map((f) => (
                <TR key={f.id}>
                  <TD className="font-medium">{f.country}</TD>
                  <TD>{f.source}</TD>
                  <TD className="text-right font-mono">{f.factor_kgco2e_per_kwh.toFixed(3)}</TD>
                  <TD>{fmtDate(f.effective_date)}</TD>
                  <TD>v{f.version}</TD>
                  <TD>{f.is_current ? <Badge tone="green">Current</Badge> : <Badge tone="gray">Historical</Badge>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {open && <AddFactorModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function AddFactorModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    country: 'IN', source: '',
    factor_kgco2e_per_kwh: '',
    effective_date: new Date().toISOString().slice(0, 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!form.country.trim()) errs.country = 'Required';
    if (!form.source.trim()) errs.source = 'Required';
    const v = Number(form.factor_kgco2e_per_kwh);
    if (!form.factor_kgco2e_per_kwh || Number.isNaN(v) || v < 0) errs.factor_kgco2e_per_kwh = 'Must be ≥ 0';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    await api.addFactor({
      country: form.country.trim().toUpperCase(),
      source: form.source.trim(),
      factor_kgco2e_per_kwh: v,
      effective_date: form.effective_date,
    });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Add Emission Factor">
      <div className="space-y-4">
        <Select label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
          <option value="IN">India (IN)</option>
          <option value="TH">Thailand (TH)</option>
          <option value="VN">Vietnam (VN)</option>
        </Select>
        <Input label="Source" placeholder="e.g. CEA, EGAT, EVN" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} error={errors.source} />
        <Input label="Factor (kgCO₂e/kWh)" type="number" inputMode="decimal" step="0.001" value={form.factor_kgco2e_per_kwh} onChange={(e) => setForm({ ...form, factor_kgco2e_per_kwh: e.target.value })} error={errors.factor_kgco2e_per_kwh} />
        <Input label="Effective Date" type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Add Factor</Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Run dev server and verify versioning**

Run: `npm run dev`
- Open `/emission-factors` — verify the 4 seed rows; IN/CEA v2 has "Current" badge, IN/CEA v1 has "Historical".
- Click "+ Add Factor", choose IN, source `CEA`, factor `0.75`, effective today → submit.
- Verify a new v3 row appears with "Current", and v2 flips to "Historical".
- Audit log on dashboard shows EMISSION_FACTOR_ADDED entry.
Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/pages/EmissionFactors.tsx
git commit -m "feat: emission factors with versioning + supersede-on-add"
```

---

## Task 18: Audit log page

**Files:**
- Modify: `src/pages/AuditLog.tsx`

- [ ] **Step 1: Replace `src/pages/AuditLog.tsx`**

```tsx
import { useState } from 'react';
import { Card, CardBody } from '../components/Card';
import { Table, THead, TR, TH, TD } from '../components/Table';
import { Badge } from '../components/Badge';
import { Select } from '../components/Select';
import { Input } from '../components/Input';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import { fmtDateTime } from '../lib/date';
import type { AuditAction, EntityType } from '../types';

const ACTIONS: AuditAction[] = ['PROJECT_CREATED', 'PROJECT_UPDATED', 'CSV_UPLOADED', 'CALCULATION_EXECUTED', 'EMISSION_FACTOR_ADDED'];
const ENTITIES: EntityType[] = ['project', 'monitoring', 'factor', 'calculation'];

export function AuditLogPage() {
  const audit = useStore((s) => s.audit);
  const user = useStore((s) => s.currentUser);
  const [action, setAction] = useState<'' | AuditAction>('');
  const [entity, setEntity] = useState<'' | EntityType>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filtered = audit.filter((a) => {
    if (action && a.action !== action) return false;
    if (entity && a.entity_type !== entity) return false;
    if (from && a.created_at < from) return false;
    if (to && a.created_at > to + 'T23:59:59Z') return false;
    return true;
  });

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Append-only chronological record of state changes. Ready for Hedera Consensus Service anchoring in Sprint 3." />

      <Card className="mb-4 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Select label="Action" value={action} onChange={(e) => setAction(e.target.value as AuditAction | '')}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
        <Select label="Entity" value={entity} onChange={(e) => setEntity(e.target.value as EntityType | '')}>
          <option value="">All entities</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Card>

      <Card>
        <CardBody className="p-0">
          <Table>
            <THead><TR><TH>Timestamp</TH><TH>User</TH><TH>Action</TH><TH>Entity</TH><TH>Payload</TH></TR></THead>
            <tbody>
              {filtered.length === 0 && (
                <TR><TD className="text-center text-ink-500 py-8" {...({ colSpan: 5 } as object)}>No matching entries</TD></TR>
              )}
              {filtered.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-xs text-ink-500">{fmtDateTime(a.created_at)}</TD>
                  <TD>{user.id === a.user_id ? user.name : a.user_id}</TD>
                  <TD><Badge tone={actionTone(a.action)}>{a.action}</Badge></TD>
                  <TD className="text-ink-500">{a.entity_type}</TD>
                  <TD><pre className="text-xs whitespace-pre-wrap break-all max-w-md text-ink-500">{JSON.stringify(a.payload)}</pre></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

function actionTone(a: AuditAction) {
  switch (a) {
    case 'PROJECT_CREATED': return 'green' as const;
    case 'PROJECT_UPDATED': return 'blue' as const;
    case 'CSV_UPLOADED': return 'blue' as const;
    case 'CALCULATION_EXECUTED': return 'amber' as const;
    case 'EMISSION_FACTOR_ADDED': return 'gray' as const;
  }
}
```

Note on the `colSpan` cast: `TD` is typed to accept `children` and `className` only — the cast is a deliberate narrow escape hatch for the empty-state row. If you prefer, extend `TD`'s props to include `colSpan?: number` instead.

- [ ] **Step 2: Run dev server and verify**

Run: `npm run dev`
- Open `/audit-log`. Seed entries render newest first.
- Filter by Action = `CSV_UPLOADED` → only matching rows show.
- Filter by Entity = `factor` → only factor entries.
- Set From = today → only today's entries.
- Combine all filters → AND semantics work.
- Trigger an action elsewhere (create a project) → return to audit log → new entry visible at top.
Stop with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AuditLog.tsx
git commit -m "feat: audit log page with action/entity/date filters"
```

---

## Task 19: Mobile + accessibility pass

**Files:**
- Modify: any pages needing tweaks (Dashboard, Projects, Calculations most likely)

- [ ] **Step 1: Open in mobile viewport**

Run: `npm run dev`
Open Chrome DevTools, set viewport to 375px (iPhone SE). Walk through each page:
- Dashboard — KPI grid should stack to 1 column at sm, 2 at md, 4 at lg. Charts should fit width.
- Projects — table should scroll horizontally without forcing page scroll. Search/filter row stacks.
- Upload — file drop fills width; validation table scrolls.
- Calculations — KPI cards stack; tabs row scrolls if needed.
- Emission Factors / Audit Log — tables scroll horizontally.

- [ ] **Step 2: Fix any layout regressions**

If a row overflows, add `overflow-x-auto` to the relevant `Table` parent or convert wide-row content to a smaller layout. Tables already use `overflow-x-auto` from the `Table` component.

If the sidebar hides content on mobile, confirm hamburger button is visible and opens the drawer.

- [ ] **Step 3: Run a quick keyboard navigation pass**

Tab through Dashboard → Projects → +New Project. Verify:
- Focus outline is visible on every interactive element (the global `focus-visible:ring-2 ring-brand-500` rule covers this).
- Modal can be closed with Escape (already wired in `Modal.tsx`).
- All `<button aria-label="...">` are present for icon-only buttons.

- [ ] **Step 4: Commit any fixes (skip if none)**

```bash
git add -A
git commit -m "chore: mobile responsive and a11y polish"
```

---

## Task 20: README + final check

**Files:**
- Create: `carbon-ready/README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# Carbon Ready — Sprint 1 MVP

Digital MRV platform for solar rooftop carbon credit tracking. Sprint 1 ships a clickable React app with stubbed API calls — backend planned for Sprint 2.

## Quick Start

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest run
npm run build    # production bundle
```

## What's Inside

- **Dashboard** — KPIs (generation, reduction, active projects, latest upload), daily generation area chart, monthly reduction bar chart, recent activity feed.
- **Projects** — list, search/filter, create (modal), edit (drawer), detail page with records.
- **Upload** — drop a CSV of `Date,Generation_kWh`, row-by-row validation, confirm + save.
- **Calculations** — run carbon calc per project, see EF used, KPI totals, daily / monthly / total tabs, monthly trend chart.
- **Emission Factors** — country/source master data with versioning; adding a new factor for an existing pair supersedes the previous version.
- **Audit Log** — append-only timeline of every state change, filterable by action / entity / date.

## Architecture

```
React SPA  →  lib/api.ts (stub)  →  Zustand store  →  localStorage
                                       ↓
                                  audit_logs slice (auto-written)
```

The store shape mirrors the documented Postgres schema; `lib/api.ts` mirrors the documented REST contracts. Sprint 2 replaces `lib/api.ts` with real `fetch()` calls without touching pages or components.

## Tech

Vite 5, React 18, TypeScript 5, Tailwind 3, React Router 6, Recharts 2, Zustand 4, PapaParse 5, date-fns 3, Lucide React, Vitest 1.

## Sample Data

3 projects (Pune, Bangkok, Hanoi), ~360 monitoring records spanning Dec 2025 → May 2026, 4 emission factors (IN/CEA v1+v2, TH/EGAT, VN/EVN). To wipe and re-seed, open DevTools console and run `localStorage.removeItem('carbon-ready-store-v1')`, then refresh.

## Tests

```bash
npm test
```

Covers `lib/csv.ts` (12 cases) and `lib/calc.ts` (8 cases) — the two pure-function libraries that power validation and calculation.

## Spec & Plan

- Spec: `../docs/superpowers/specs/2026-05-27-carbon-ready-sprint-1-design.md`
- Plan: `../docs/superpowers/plans/2026-05-27-carbon-ready-sprint-1.md`
````

- [ ] **Step 2: Final smoke test**

Run all of these and confirm green:
```bash
npm test
npm run build
npm run dev
```
Open dashboard, click through every page, confirm no console errors and that the happy path (create project → upload CSV → calculate → see dashboard update → see audit entries) works end to end.

- [ ] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: README with quick start, architecture, and tech stack"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| 1. Product Requirements | covered by all tasks; non-functional in Task 19 |
| 2. User Stories US-01..03 (Project CRUD) | Task 13, 14 |
| US-04, US-05 (Upload + validation) | Task 3 (lib), Task 15 (page) |
| US-06, US-07 (EF + versioning) | Task 17 |
| US-08 (Calculation engine) | Task 4 (lib), Task 16 (page) |
| US-09, US-10 (Dashboard + charts) | Task 11, 12 |
| US-11 (Audit log) | Task 7 (slice), Task 18 (page) |
| US-12 (Responsive) | Task 19 |
| 3. Database Schema | Task 2 (types mirror the schema 1:1) |
| 4. API Design | Task 8 (`api.ts` mirrors endpoints) |
| 5. UI/UX Wireframes | Tasks 9, 10, 12, 13, 14, 15, 16, 17, 18 |
| 6. System Architecture | Task 7 (store), Task 8 (api), README in Task 20 |
| 7. Sprint Backlog | every backlog ticket has at least one task |
| 8. Acceptance Criteria | Tasks 13–18 each include a verification step that maps to AC |

No gaps.

**2. Placeholder scan:** No "TBD" / "TODO" / "implement later" / "handle edge cases" patterns in the plan. Every code-changing step has the actual code.

**3. Type consistency:**
- `CalculationOutput` defined in Task 4 (`lib/calc.ts`), consumed in Task 16 by exact name.
- `CsvValidationResult` defined in Task 2 (`types`), consumed in Tasks 3, 8, 15.
- `Project`, `EmissionFactor`, `MonitoringRecord`, `AuditLog`, `UUID`, `ProjectStatus`, `AuditAction`, `EntityType` all defined in Task 2 and used consistently downstream.
- Store action names (`createProject`, `updateProject`, `addMonitoringRecords`, `addEmissionFactor`, `recordCalculation`, `audit_write`, `resetToSeed`) defined in Task 7 and called in Task 8 with matching signatures.
- API method names (`api.createProject`, `api.updateProject`, `api.uploadMonitoringCsv`, `api.calculate`, `api.listFactors`, `api.addFactor`) defined in Task 8 and called in pages with matching signatures.

All consistent.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-carbon-ready-sprint-1.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
