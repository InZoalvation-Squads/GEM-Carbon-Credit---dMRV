# T-VER-S-F001-PDD แบบควบรวม (Aggregated PDD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users fill in and generate the aggregated (แบบควบรวม) variant of the official TGO T-VER-S-F001-PDD form, covering several installation sites under one project developer and one crediting period.

**Architecture:** Sites live as a `sites` table field inside the PDD's `section_data`, not as separate `Project` records. Each site row carries a nullable `project_id` column as a seam for later promotion. Bundle mode is triggered by a single predicate — `sites` is a non-empty array — and every calculation function falls back to today's exact behaviour when it is false. The 945-line official-form template is split into a `tver-sf001/` folder so site-dependent blocks take a `sites` array that is length-1 in single mode.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + @testing-library/react, Zustand store, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-07-tver-aggregated-pdd-design.md`

**Run tests with:** `cd carbon-ready && npm test` (single file: `npx vitest run src/lib/pdd.test.ts`)

---

## Background for the implementer

Facts about this codebase you need before starting:

- **The calc engine is `carbon-ready/src/lib/pdd.ts`.** It currently derives everything from one `project.capacity_kwp` and one `project.location`. `ComputeContext` is `{ project, factors, sectionData }`.
- **`generationForecast(gen1, degradationPct, years)` at `lib/pdd.ts:135-144` chain-rounds**: each year is `Math.round()`ed, and the next year degrades from that *rounded* value. This is deliberate and documented — it matches a PEA/TGO appendix (963,915 → 941,011) that pure `pow()` drifts against. **Do not change this function's behaviour.**
- **`table` field type already exists.** `PddTableColumn` is `{ key, label, type: 'text'|'number', unit? }`. The editor is `TableFieldInput` in `src/pages/Registration.tsx:565`. Values are `Array<Record<string, unknown>>`.
- **`siteSpecific: true`** marks a field as a per-site fact that is never carried over when cloning another project's PDD (`lib/pdd-prefill.ts:34`).
- **Real-data-only rule:** never invent plausible values. Blank beats a guess. Aggregate figures must render blank when their input rows are incomplete.

### The page-31 fixture and its tolerance

The reference PDD's page-31 forecast table is **not exactly reproducible**. Chained rounding differs by ±1 kWh on ~15 of 42 cells; unrounded power matches sites E and F exactly but misses others. The residual is spreadsheet float noise.

Tests therefore assert **within ±2 kWh per cell and ±5 kWh per year total**. This is a deliberate decision recorded in the spec, not sloppiness. Do not "fix" the tolerance by changing `generationForecast()`.

The reference PDD also uses **two different degradation rates**: 0.55%/yr for sites A, B, C, E, F and 0.60%/yr for site D. Hence the per-site `degradation_pct` column.

---

## File Structure

**Create:**
- `carbon-ready/src/lib/pdd-forecast.ts` — `generationForecast()`, moved out of `pdd.ts`. See the note below on why.
- `carbon-ready/src/lib/pdd-sites.ts` — site-row parsing and bundle aggregation. All bundle logic lives here so `pdd.ts` only gains thin branches.
- `carbon-ready/src/lib/pdd-sites.test.ts` — unit tests including the page-31 fixture.

**Modify:**
- `carbon-ready/src/types/index.ts` — add `bundle_capacity` / `site_count` computed sources.
- `carbon-ready/src/data/methodology-tver-solar.ts` — add `project_form` and `sites` fields; add `site` column to `installations` and `equipment_specs`.
- `carbon-ready/src/lib/pdd.ts` — bundle branches in `year1GenerationKwh`, `computeYearlyTable`, `resolveComputed`, `validatePdd`.
- `carbon-ready/src/lib/pdd.test.ts` — regression tests proving single-project behaviour is unchanged.
- `carbon-ready/src/templates/TverSF001Pdd.tsx` — mode-driven strings; render bundle tables.
- `carbon-ready/src/templates/tver-sf001.ui.test.tsx` — bundle-mode render tests.

Tasks 0–4 are pure logic and independently testable. Tasks 5–7 are schema and rendering. Task 8 is validation.

### Why `generationForecast()` moves first

`pdd-sites.ts` needs `generationForecast()`, and `pdd.ts` needs `pdd-sites.ts`. Left as-is that is a circular import — ES modules often tolerate it, but evaluation order under Vite's production build can leave one binding undefined at module-init time, producing a failure that unit tests running under Vitest's transform would not catch. Task 0 removes the cycle by moving the shared primitive into a leaf module that imports nothing from either side.

---

### Task 0: Extract `generationForecast()` into a leaf module

Pure move, no behaviour change. Do this before Task 1.

**Files:**
- Create: `carbon-ready/src/lib/pdd-forecast.ts`
- Modify: `carbon-ready/src/lib/pdd.ts:130-144`

- [ ] **Step 1: Create the new module**

Create `carbon-ready/src/lib/pdd-forecast.ts` and move the function verbatim, comment included:

```ts
// Generation forecasting shared by the single-project and aggregated PDD paths.
// A leaf module: it imports nothing from lib/pdd.ts, so lib/pdd.ts and
// lib/pdd-sites.ts can both depend on it without forming an import cycle.

/**
 * Yearly kWh forecast exactly as the PEA/TGO appendix chains it: each year is
 * ROUNDED to whole kWh, then the next year degrades from that rounded value
 * (963,915 → 960,059 → … → 941,011; pure pow() drifts +1 kWh by year 5).
 */
export function generationForecast(gen1: number, degradationPct: number, years: number): number[] {
  const d = degradationPct / 100;
  const rows: number[] = [];
  let g = Math.round(gen1);
  for (let y = 1; y <= years; y++) {
    if (y > 1) g = Math.round(g * (1 - d));
    rows.push(g);
  }
  return rows;
}
```

- [ ] **Step 2: Re-export from `pdd.ts` so existing importers keep working**

In `carbon-ready/src/lib/pdd.ts`, delete the original function (lines 130-144) and add near the top imports:

```ts
import { generationForecast } from './pdd-forecast';

export { generationForecast };
```

The re-export matters: `pdd.test.ts` and any other caller import it from `./pdd` today, and this task must not touch them.

- [ ] **Step 3: Run the full suite to prove nothing changed**

Run: `cd carbon-ready && npm test`
Expected: PASS, with no test file edited. A pure move that needs a test change is not a pure move — investigate rather than editing the test.

- [ ] **Step 4: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/lib/pdd-forecast.ts carbon-ready/src/lib/pdd.ts
git commit -m "refactor(pdd): extract generationForecast into a leaf module"
```

---

### Task 1: Site row parsing

**Files:**
- Create: `carbon-ready/src/lib/pdd-sites.ts`
- Test: `carbon-ready/src/lib/pdd-sites.test.ts`

- [ ] **Step 1: Write the failing test**

Create `carbon-ready/src/lib/pdd-sites.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSites, isBundle } from './pdd-sites';

describe('isBundle', () => {
  it('is false when sites is absent, empty, or not an array', () => {
    expect(isBundle({})).toBe(false);
    expect(isBundle({ sites: [] })).toBe(false);
    expect(isBundle({ sites: 'nope' })).toBe(false);
  });
  it('is true when sites has at least one row', () => {
    expect(isBundle({ sites: [{ owner: 'A' }] })).toBe(true);
  });
});

describe('parseSites', () => {
  it('returns an empty array for non-array input', () => {
    expect(parseSites(undefined)).toEqual([]);
    expect(parseSites('nope')).toEqual([]);
  });

  it('coerces numeric columns and preserves text columns', () => {
    const rows = parseSites([
      { owner: 'บริษัท A จำกัด', address: 'สมุทรสาคร', coordinates: '13.57, 100.35',
        kwp: '261.6', year1_kwh: '325326', first_sync_year: '2569',
        degradation_pct: '0.55', maintenance_per_year: '4', project_id: '' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      owner: 'บริษัท A จำกัด', address: 'สมุทรสาคร', coordinates: '13.57, 100.35',
      kwp: 261.6, year1_kwh: 325326, first_sync_year: 2569,
      degradation_pct: 0.55, maintenance_per_year: 4, project_id: null,
    });
  });

  it('maps blank and unparseable numbers to null rather than 0 or NaN', () => {
    const rows = parseSites([{ owner: 'B', kwp: '', year1_kwh: 'abc', first_sync_year: null }]);
    expect(rows[0].kwp).toBeNull();
    expect(rows[0].year1_kwh).toBeNull();
    expect(rows[0].first_sync_year).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-sites.test.ts`
Expected: FAIL — `Failed to resolve import "./pdd-sites"`.

- [ ] **Step 3: Write minimal implementation**

Create `carbon-ready/src/lib/pdd-sites.ts`:

```ts
// Aggregated-PDD (แบบควบรวม) site rows and their aggregation.
// Sites live as a `sites` table field in section_data rather than as separate
// Project records; each row carries a nullable project_id as the seam for
// promoting a site to a real Project later. All bundle logic lives here so
// pdd.ts only gains thin fallback branches.

export interface PddSite {
  owner: string;
  address: string;
  coordinates: string;
  kwp: number | null;
  year1_kwh: number | null;
  first_sync_year: number | null;
  degradation_pct: number | null;
  maintenance_per_year: number | null;
  project_id: string | null;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** Site rows from section_data.sites, with numeric columns coerced. */
export function parseSites(raw: unknown): PddSite[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((r) => ({
    owner: str(r.owner),
    address: str(r.address),
    coordinates: str(r.coordinates),
    kwp: num(r.kwp),
    year1_kwh: num(r.year1_kwh),
    first_sync_year: num(r.first_sync_year),
    degradation_pct: num(r.degradation_pct),
    maintenance_per_year: num(r.maintenance_per_year),
    project_id: r.project_id === undefined || r.project_id === null || r.project_id === ''
      ? null : String(r.project_id),
  }));
}

/** Bundle mode is on when at least one site row exists. */
export function isBundle(sectionData: Record<string, unknown>): boolean {
  return parseSites(sectionData.sites).length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-sites.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/lib/pdd-sites.ts carbon-ready/src/lib/pdd-sites.test.ts
git commit -m "feat(pdd): parse aggregated-PDD site rows"
```

---

### Task 2: Bundle capacity and year-1 generation totals

**Files:**
- Modify: `carbon-ready/src/lib/pdd-sites.ts`
- Test: `carbon-ready/src/lib/pdd-sites.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `carbon-ready/src/lib/pdd-sites.test.ts`:

```ts
import { sumSiteCapacityKwp, sumSiteYear1Kwh } from './pdd-sites';

// Reference PDD ตารางที่ 1 (p.7): six sites, 2,009.30 kWp / 2,499,410 kWh.
const REF_TABLE1 = [
  { owner: 'บริษัท A จำกัด', kwp: 261.6, year1_kwh: 325326 },
  { owner: 'บริษัท B จำกัด', kwp: 249.61, year1_kwh: 373305 },
  { owner: 'บริษัท C จำกัด', kwp: 234.895, year1_kwh: 288682 },
  { owner: 'บริษัท D จำกัด', kwp: 311.605, year1_kwh: 355673 },
  { owner: 'บริษัท E จำกัด', kwp: 351.0, year1_kwh: 391402 },
  { owner: 'บริษัท F จำกัด', kwp: 600.59, year1_kwh: 747034 },
];

describe('sumSiteCapacityKwp', () => {
  it('reproduces the reference PDD total installed capacity', () => {
    expect(sumSiteCapacityKwp(parseSites(REF_TABLE1))).toBe(2009.3);
  });
  it('returns null when no row carries a capacity', () => {
    expect(sumSiteCapacityKwp(parseSites([{ owner: 'A' }]))).toBeNull();
  });
  it('sums only the rows that have a capacity', () => {
    expect(sumSiteCapacityKwp(parseSites([{ kwp: 10 }, { owner: 'no kwp' }]))).toBe(10);
  });
});

describe('sumSiteYear1Kwh', () => {
  it('reproduces the reference PDD total year-1 generation', () => {
    expect(sumSiteYear1Kwh(parseSites(REF_TABLE1))).toBe(2499410);
  });
  it('returns null when no row carries a year-1 figure', () => {
    expect(sumSiteYear1Kwh(parseSites([{ owner: 'A' }]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-sites.test.ts`
Expected: FAIL — `sumSiteCapacityKwp is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `carbon-ready/src/lib/pdd-sites.ts`:

```ts
/**
 * Σ of a numeric site column, or null when no row carries a value. Null rather
 * than 0 so an incomplete site table renders blank instead of publishing a
 * confidently wrong total (real-data-only rule).
 */
function sumColumn(sites: PddSite[], pick: (s: PddSite) => number | null): number | null {
  const values = sites.map(pick).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  // Round to 3 dp: kWp values carry 3 decimals and float addition drifts
  // (261.6 + 249.61 + … = 2009.3000000000002).
  return Math.round(values.reduce((a, b) => a + b, 0) * 1000) / 1000;
}

/** Total installed capacity across sites (ตารางที่ 1 รวม). */
export function sumSiteCapacityKwp(sites: PddSite[]): number | null {
  return sumColumn(sites, (s) => s.kwp);
}

/** Total year-1 generation across sites (ตารางที่ 1 รวม). */
export function sumSiteYear1Kwh(sites: PddSite[]): number | null {
  return sumColumn(sites, (s) => s.year1_kwh);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-sites.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/lib/pdd-sites.ts carbon-ready/src/lib/pdd-sites.test.ts
git commit -m "feat(pdd): sum site capacity and year-1 generation"
```

---

### Task 3: Staggered per-site generation forecast

This is the substantive calculation change. Each site runs its **own** forecast chain from its own `first_sync_year`; the yearly total sums the sites live in that year.

**Files:**
- Modify: `carbon-ready/src/lib/pdd-sites.ts`
- Test: `carbon-ready/src/lib/pdd-sites.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `carbon-ready/src/lib/pdd-sites.test.ts`:

```ts
import { siteGenerationMatrix } from './pdd-sites';

// Reference PDD p.31: per-site kWh across the 7-year crediting period
// (Buddhist years 2570–2576). Sites B and F synchronised in 2568 and have
// already degraded two years by the time crediting starts; site D starts in
// 2570. Site D degrades at 0.60%/yr, every other site at 0.55%/yr.
const REF_P31_SITES = [
  { owner: 'A', year1_kwh: 327126, first_sync_year: 2569, degradation_pct: 0.55 },
  { owner: 'B', year1_kwh: 377445, first_sync_year: 2568, degradation_pct: 0.55 },
  { owner: 'C', year1_kwh: 290279, first_sync_year: 2569, degradation_pct: 0.55 },
  { owner: 'D', year1_kwh: 355673, first_sync_year: 2570, degradation_pct: 0.60 },
  { owner: 'E', year1_kwh: 393567, first_sync_year: 2569, degradation_pct: 0.55 },
  { owner: 'F', year1_kwh: 755320, first_sync_year: 2568, degradation_pct: 0.55 },
];

const REF_P31_EXPECTED: Record<string, number[]> = {
  A: [325326, 323537, 321758, 319988, 318228, 316478, 314737],
  B: [373305, 371252, 369210, 367179, 365160, 363151, 361154],
  C: [288682, 287094, 285515, 283945, 282383, 280830, 279286],
  D: [355673, 353539, 351418, 349309, 347214, 345130, 343059],
  E: [391402, 389250, 387109, 384980, 382862, 380757, 378662],
  F: [747034, 742926, 738840, 734776, 730735, 726716, 722719],
};
const REF_P31_TOTALS = [2481423, 2467598, 2453850, 2440177, 2426582, 2413062, 2399618];

describe('siteGenerationMatrix', () => {
  // The published table is not exactly reproducible: it came from a spreadsheet
  // whose year-1 figures are themselves rounded, so any clean model differs by
  // ~1 kWh on scattered cells. ±2 per cell validates the staggering model
  // without encoding another tool's float noise as a requirement.
  it('reproduces the reference PDD page-31 table within ±2 kWh per cell', () => {
    const m = siteGenerationMatrix(parseSites(REF_P31_SITES), 2570, 7, 0.4);
    expect(m.years).toEqual([2570, 2571, 2572, 2573, 2574, 2575, 2576]);
    for (const row of m.rows) {
      const expected = REF_P31_EXPECTED[row.site.owner];
      row.generation.forEach((got, i) => {
        expect(Math.abs(got - expected[i])).toBeLessThanOrEqual(2);
      });
    }
  });

  it('reproduces the reference PDD yearly totals within ±5 kWh', () => {
    const m = siteGenerationMatrix(parseSites(REF_P31_SITES), 2570, 7, 0.4);
    m.totals.forEach((got, i) => {
      expect(Math.abs(got - REF_P31_TOTALS[i])).toBeLessThanOrEqual(5);
    });
  });

  it('degrades a late-starting site from its own first year, not the period start', () => {
    // Sync year == period start: year 1 is the undegraded year-1 figure.
    const m = siteGenerationMatrix(
      parseSites([{ owner: 'D', year1_kwh: 355673, first_sync_year: 2570, degradation_pct: 0.6 }]),
      2570, 2, 0.4,
    );
    expect(m.rows[0].generation[0]).toBe(355673);
  });

  it('falls back to the bundle degradation rate when a site omits its own', () => {
    const m = siteGenerationMatrix(
      parseSites([{ owner: 'X', year1_kwh: 100000, first_sync_year: 2570 }]),
      2570, 2, 10,
    );
    expect(m.rows[0].generation[1]).toBe(90000);
  });

  it('treats a site with no first_sync_year as starting at the period start', () => {
    const m = siteGenerationMatrix(
      parseSites([{ owner: 'X', year1_kwh: 1000 }]), 2570, 1, 0,
    );
    expect(m.rows[0].generation[0]).toBe(1000);
  });

  it('contributes zero for years before a site synchronises', () => {
    const m = siteGenerationMatrix(
      parseSites([{ owner: 'late', year1_kwh: 1000, first_sync_year: 2572 }]),
      2570, 3, 0,
    );
    expect(m.rows[0].generation).toEqual([0, 0, 1000]);
    expect(m.totals).toEqual([0, 0, 1000]);
  });

  it('reports zero rather than null for a site with no year-1 figure', () => {
    const m = siteGenerationMatrix(parseSites([{ owner: 'blank' }]), 2570, 2, 0.4);
    expect(m.rows[0].generation).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-sites.test.ts`
Expected: FAIL — `siteGenerationMatrix is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `carbon-ready/src/lib/pdd-sites.ts`:

```ts
import { generationForecast } from './pdd-forecast';

export interface SiteGenerationRow {
  site: PddSite;
  /** kWh per crediting year; 0 for years before the site synchronised. */
  generation: number[];
}

export interface SiteGenerationMatrix {
  /** Calendar (Buddhist) year labels, one per crediting year. */
  years: number[];
  rows: SiteGenerationRow[];
  /** Σ of all sites live in each year. */
  totals: number[];
}

/**
 * Per-site generation across the crediting period, each site degrading from its
 * own first-synchronisation year.
 *
 * A site that synchronised before the crediting period has already been
 * degrading: its year-1 figure is the output in its *own* first year, so by the
 * time crediting starts it is several years down the curve. A site that
 * synchronises mid-period contributes 0 until it comes online. This staggering
 * is what reproduces the reference PDD's page-31 table, where sites B and F run
 * two years ahead of the period and site D starts a year into it.
 *
 * Each site reuses generationForecast() — the same chained rounding the
 * single-project path uses — so bundle and single mode stay arithmetically
 * consistent.
 */
export function siteGenerationMatrix(
  sites: PddSite[],
  startYear: number,
  years: number,
  fallbackDegradationPct: number,
): SiteGenerationMatrix {
  const yearLabels = Array.from({ length: years }, (_, i) => startYear + i);
  const rows: SiteGenerationRow[] = sites.map((site) => {
    const gen1 = site.year1_kwh;
    if (gen1 === null) return { site, generation: new Array(years).fill(0) };
    const sync = site.first_sync_year ?? startYear;
    const d = site.degradation_pct ?? fallbackDegradationPct;
    // Forecast from the site's own sync year through the end of the period, so
    // a pre-period site arrives already degraded.
    const span = Math.max(0, startYear + years - sync);
    const series = generationForecast(gen1, d, span);
    const generation = yearLabels.map((y) => (y < sync ? 0 : series[y - sync] ?? 0));
    return { site, generation };
  });
  const totals = yearLabels.map((_, i) => rows.reduce((sum, r) => sum + r.generation[i], 0));
  return { years: yearLabels, rows, totals };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd carbon-ready && npx vitest run src/lib/pdd-sites.test.ts`
Expected: PASS — 17 tests.

If the page-31 assertions fail by more than ±2, do **not** widen the tolerance or edit `generationForecast()`. Report the actual deltas — a systematic offset means the staggering indexing is wrong, which is a real bug.

- [ ] **Step 5: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/lib/pdd-sites.ts carbon-ready/src/lib/pdd-sites.test.ts
git commit -m "feat(pdd): staggered per-site generation forecast"
```

---

### Task 4: Wire bundle totals into the calc engine

**Files:**
- Modify: `carbon-ready/src/lib/pdd.ts:110-174`
- Test: `carbon-ready/src/lib/pdd.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `carbon-ready/src/lib/pdd.test.ts`:

```ts
import { bundleCapacityKwp } from './pdd';

const BUNDLE_SITES = [
  { owner: 'A', kwp: 100, year1_kwh: 200000, first_sync_year: 2570, degradation_pct: 0.5 },
  { owner: 'B', kwp: 150, year1_kwh: 300000, first_sync_year: 2570, degradation_pct: 0.5 },
];

describe('bundle mode', () => {
  it('sums site capacity instead of using the parent project capacity', () => {
    expect(bundleCapacityKwp({ project: PROJECT, factors: FACTORS, sectionData: {} })).toBe(820);
    expect(bundleCapacityKwp({
      project: PROJECT, factors: FACTORS, sectionData: { sites: BUNDLE_SITES },
    })).toBe(250);
  });

  it('uses summed site generation for year-1 output', () => {
    const ctx = { project: PROJECT, factors: FACTORS, sectionData: { sites: BUNDLE_SITES } };
    expect(year1GenerationKwh(ctx)).toBe(500000);
  });

  it('ignores the single-project override once sites exist', () => {
    const ctx = {
      project: PROJECT, factors: FACTORS,
      sectionData: { sites: BUNDLE_SITES, year1_generation_kwh: 999999 },
    };
    expect(year1GenerationKwh(ctx)).toBe(500000);
  });

  it('builds the yearly table from the staggered site matrix', () => {
    const ctx = {
      project: PROJECT, factors: FACTORS,
      sectionData: { sites: BUNDLE_SITES, crediting_years: 2, crediting_start: '2027-01-01' },
    };
    const t = computeYearlyTable(ctx)!;
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].generation_kwh).toBe(500000);
    // 0.5%/yr on each site, summed: 199000 + 298500.
    expect(t.rows[1].generation_kwh).toBe(497500);
    // BE = gen × EF ÷ 1000, EF = 0.51.
    expect(t.rows[0].be).toBe(255);
  });

  it('leaves single-project behaviour untouched', () => {
    const ctx = {
      project: PROJECT, factors: FACTORS,
      sectionData: { year1_generation_kwh: 1000000, degradation_pct: 0.4, crediting_years: 3 },
    };
    const t = computeYearlyTable(ctx)!;
    expect(t.rows.map((r) => r.generation_kwh)).toEqual([1000000, 996000, 992016]);
  });
});
```

Add `year1GenerationKwh` to the existing import from `./pdd` at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/pdd.test.ts`
Expected: FAIL — `bundleCapacityKwp is not a function`.

- [ ] **Step 3: Write the implementation**

In `carbon-ready/src/lib/pdd.ts`, add the import at the top (after the existing imports):

```ts
import { parseSites, isBundle, sumSiteCapacityKwp, sumSiteYear1Kwh, siteGenerationMatrix } from './pdd-sites';
```

Add after the `numOrNull` helper (around line 93):

```ts
/** Installed capacity: Σ site rows in bundle mode, else the parent project's. */
export function bundleCapacityKwp(ctx: ComputeContext): number {
  const sites = parseSites(ctx.sectionData.sites);
  return sumSiteCapacityKwp(sites) ?? ctx.project.capacity_kwp;
}

/** Buddhist-calendar year the crediting period starts, for the site matrix. */
export function creditingStartYear(ctx: ComputeContext): number {
  const iso = ctx.sectionData.crediting_start;
  const gregorian = typeof iso === 'string' && iso.length >= 4 ? Number(iso.slice(0, 4)) : NaN;
  return Number.isNaN(gregorian) ? 2570 : gregorian + 543;
}
```

Replace `year1GenerationKwh` (currently at lines 110-116) with:

```ts
/** Year-1 generation: Σ site rows in bundle mode, else override, else the capacity model. */
export function year1GenerationKwh(ctx: ComputeContext): number {
  if (isBundle(ctx.sectionData)) {
    return sumSiteYear1Kwh(parseSites(ctx.sectionData.sites)) ?? 0;
  }
  const override = numOrNull(ctx.sectionData.year1_generation_kwh);
  if (override !== null && override > 0) return override;
  const raw = numOrNull(ctx.sectionData.performance_ratio);
  const pr = raw !== null && raw > 0 ? raw : DEFAULT_PERFORMANCE_RATIO;
  return ctx.project.capacity_kwp * SUN_HOURS_PER_DAY * 365 * pr;
}
```

In `computeYearlyTable` (currently at lines 152-174), replace the single line

```ts
  const gens = generationForecast(gen1, d, years);
```

with:

```ts
  // Bundle mode: each site degrades from its own first-synchronisation year, so
  // the yearly total is the staggered sum rather than one aggregate curve.
  const gens = isBundle(ctx.sectionData)
    ? siteGenerationMatrix(parseSites(ctx.sectionData.sites), creditingStartYear(ctx), years, d).totals
    : generationForecast(gen1, d, years);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd carbon-ready && npx vitest run src/lib/pdd.test.ts src/lib/pdd-sites.test.ts`
Expected: PASS — all existing tests plus the 5 new bundle tests. The "leaves single-project behaviour untouched" test is the regression guard.

- [ ] **Step 5: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/lib/pdd.ts carbon-ready/src/lib/pdd.test.ts
git commit -m "feat(pdd): bundle-aware capacity and yearly generation"
```

---

### Task 5: Expose bundle totals as computed fields

**Files:**
- Modify: `carbon-ready/src/types/index.ts:367-370`
- Modify: `carbon-ready/src/lib/pdd.ts:59-85`
- Test: `carbon-ready/src/lib/pdd.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe('bundle mode')` block in `carbon-ready/src/lib/pdd.test.ts`:

```ts
  it('resolves bundle_capacity and site_count as computed sources', () => {
    const ctx = { project: PROJECT, factors: FACTORS, sectionData: { sites: BUNDLE_SITES } };
    expect(resolveComputed('bundle_capacity', ctx)).toBe(250);
    expect(resolveComputed('site_count', ctx)).toBe(2);
  });

  it('falls back to the parent project capacity with no sites', () => {
    const ctx = { project: PROJECT, factors: FACTORS, sectionData: {} };
    expect(resolveComputed('bundle_capacity', ctx)).toBe(820);
    expect(resolveComputed('site_count', ctx)).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/pdd.test.ts`
Expected: FAIL — TypeScript rejects `'bundle_capacity'` as a `PddComputedSource`.

- [ ] **Step 3: Write the implementation**

In `carbon-ready/src/types/index.ts`, replace the `PddComputedSource` union (lines 367-370):

```ts
export type PddComputedSource =
  | 'capacity_kwp' | 'project_location' | 'commission_date'
  | 'grid_factor' | 'er_estimate'
  | 'annual_generation' | 'ec_pj' | 'be_annual' | 'pe_annual' | 'er_annual'
  | 'bundle_capacity' | 'site_count';
```

In `carbon-ready/src/lib/pdd.ts`, add these two cases to the `resolveComputed` switch, immediately before `default:`:

```ts
    case 'bundle_capacity': return bundleCapacityKwp(ctx);
    case 'site_count': return parseSites(ctx.sectionData.sites).length;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd carbon-ready && npx vitest run src/lib/pdd.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/types/index.ts carbon-ready/src/lib/pdd.ts carbon-ready/src/lib/pdd.test.ts
git commit -m "feat(pdd): bundle_capacity and site_count computed sources"
```

---

### Task 6: Methodology schema — `project_form`, `sites`, site attribution

**Files:**
- Modify: `carbon-ready/src/data/methodology-tver-solar.ts:22-38` (cover section), `:72-88` (installations/equipment_specs)
- Test: `carbon-ready/src/lib/methodology-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `carbon-ready/src/lib/methodology-schema.test.ts`:

```ts
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';

describe('aggregated-PDD schema', () => {
  const fields = TVER_SOLAR_METHODOLOGY.pdd_sections.flatMap((s) => s.fields);
  const byKey = (k: string) => fields.find((f) => f.key === k);

  it('offers the single/aggregated form selector, defaulting to single', () => {
    const f = byKey('project_form');
    expect(f?.type).toBe('select');
    expect(f?.options).toEqual(['แบบเดี่ยว', 'แบบควบรวม']);
    expect(f?.defaultValue).toBe('แบบเดี่ยว');
  });

  it('declares the sites table with every column the aggregated form needs', () => {
    const f = byKey('sites');
    expect(f?.type).toBe('table');
    expect(f?.siteSpecific).toBe(true);
    expect(f?.columns?.map((c) => c.key)).toEqual([
      'owner', 'address', 'coordinates', 'kwp', 'year1_kwh',
      'first_sync_year', 'degradation_pct', 'maintenance_per_year', 'project_id',
    ]);
  });

  it('attributes equipment rows to a site', () => {
    expect(byKey('installations')?.columns?.[0].key).toBe('site');
    expect(byKey('equipment_specs')?.columns?.[0].key).toBe('site');
  });

  it('seeds project_form but not sites into a new PDD', () => {
    const defaults = buildDefaults(TVER_SOLAR_METHODOLOGY);
    expect(defaults.project_form).toBe('แบบเดี่ยว');
    expect(defaults.sites).toBeUndefined();
  });
});
```

Add `import { buildDefaults } from './pdd-prefill';` to the file's imports if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/methodology-schema.test.ts`
Expected: FAIL — `project_form` is undefined.

- [ ] **Step 3: Write the implementation**

In `carbon-ready/src/data/methodology-tver-solar.ts`, in the `cover` section's `fields` array, insert immediately after the `co_developer` field:

```ts
        { key: 'project_form', label: 'รูปแบบการดำเนินโครงการ', type: 'select',
          options: ['แบบเดี่ยว', 'แบบควบรวม'], required: true, defaultValue: 'แบบเดี่ยว',
          help: 'แบบควบรวม = หลายพื้นที่ติดตั้งภายใต้โครงการเดียว — กรอกรายละเอียดแต่ละแห่งในตาราง "พื้นที่ติดตั้งในโครงการ"' },
        { key: 'sites', label: 'พื้นที่ติดตั้งในโครงการ (แบบควบรวม)', type: 'table',
          required: false, siteSpecific: true,
          showIf: { field: 'project_form', equals: 'แบบควบรวม' },
          help: 'หนึ่งแถวต่อหนึ่งพื้นที่ติดตั้ง — กำลังผลิตรวมและไฟฟ้าที่ผลิตได้รวมคำนวณจากตารางนี้',
          columns: [
            { key: 'owner', label: 'เจ้าของโครงการ', type: 'text' },
            { key: 'address', label: 'ที่ตั้งโครงการ', type: 'text' },
            { key: 'coordinates', label: 'พิกัด', type: 'text' },
            { key: 'kwp', label: 'กำลังการผลิตติดตั้ง', type: 'number', unit: 'kWp' },
            { key: 'year1_kwh', label: 'ไฟฟ้าปีที่ 1', type: 'number', unit: 'kWh/ปี' },
            { key: 'first_sync_year', label: 'ปีที่ขนานไฟครั้งแรก (พ.ศ.)', type: 'number' },
            { key: 'degradation_pct', label: 'อัตราการเสื่อมต่อปี', type: 'number', unit: '%' },
            { key: 'maintenance_per_year', label: 'บำรุงรักษา (ครั้ง/ปี)', type: 'number' },
            { key: 'project_id', label: 'รหัสโครงการในระบบ (ถ้ามี)', type: 'text' },
          ] },
```

In the same file, add a `site` column as the **first** entry of both existing tables. For `installations` (line 73):

```ts
          columns: [
            { key: 'site', label: 'พื้นที่ติดตั้ง (แบบควบรวม)', type: 'text' },
            { key: 'building', label: 'พื้นที่ติดตั้ง', type: 'text' },
```

For `equipment_specs` (line 82):

```ts
          columns: [
            { key: 'site', label: 'พื้นที่ติดตั้ง (แบบควบรวม)', type: 'text' },
            { key: 'item', label: 'รายการ', type: 'text' },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd carbon-ready && npm test`
Expected: PASS. The whole suite runs here because the methodology schema feeds many tests; `sites` is `required: false` so `validatePdd` tests are unaffected.

- [ ] **Step 5: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/data/methodology-tver-solar.ts carbon-ready/src/lib/methodology-schema.test.ts
git commit -m "feat(pdd): sites table and project_form selector in T-VER schema"
```

---

### Task 7: Render the aggregated form

**Files:**
- Modify: `carbon-ready/src/templates/TverSF001Pdd.tsx:60`, `:260`, `:378-379`, `:474`, `:477`, `:742`, `:853`
- Test: `carbon-ready/src/templates/tver-sf001.ui.test.tsx`

- [ ] **Step 1: Write the failing test**

Read the existing `carbon-ready/src/templates/tver-sf001.ui.test.tsx` first to reuse its store-seeding helper — do not invent a new fixture pattern. Append a bundle-mode block that seeds `section_data.project_form = 'แบบควบรวม'` and a two-row `sites` array, then asserts:

```ts
describe('TverSF001Pdd — aggregated mode', () => {
  it('labels the document แบบควบรวม in the header and cover', () => {
    renderPdd({ project_form: 'แบบควบรวม', sites: TWO_SITES });
    expect(screen.getAllByText(/แบบควบรวม/).length).toBeGreaterThan(0);
    expect(screen.queryByText('เอกสารข้อเสนอโครงการ (PDD) แบบเดี่ยว')).toBeNull();
  });

  it('renders one ตารางที่ 1 row per site with the summed total', () => {
    renderPdd({ project_form: 'แบบควบรวม', sites: TWO_SITES });
    const table = screen.getByTestId('sites-table');
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 2 sites + total
    expect(within(table).getByText('250.000')).toBeInTheDocument();
  });

  it('keeps single-project output unchanged when no sites exist', () => {
    renderPdd({});
    expect(screen.getByText('เอกสารข้อเสนอโครงการ (PDD) แบบเดี่ยว')).toBeInTheDocument();
    expect(screen.queryByTestId('sites-table')).toBeNull();
  });
});
```

`TWO_SITES` is the `BUNDLE_SITES` shape from Task 4. Import `within` from `@testing-library/react`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/templates/tver-sf001.ui.test.tsx`
Expected: FAIL — `sites-table` testid not found, and แบบเดี่ยว still renders.

- [ ] **Step 3: Write the implementation**

In `carbon-ready/src/templates/TverSF001Pdd.tsx`:

Add to the imports:

```ts
import { parseSites, isBundle, sumSiteCapacityKwp, sumSiteYear1Kwh, siteGenerationMatrix } from '../lib/pdd-sites';
```

and add `creditingStartYear` to the existing `../lib/pdd` import.

Inside the component, after `const d = pdd.section_data as Record<string, unknown>;`:

```ts
  const sites = parseSites(d.sites);
  const bundle = isBundle(d);
  const formLabel = bundle ? 'แบบควบรวม' : 'แบบเดี่ยว';
  const totalKwp = sumSiteCapacityKwp(sites) ?? project.capacity_kwp;
  const totalYear1 = sumSiteYear1Kwh(sites);
  const startYear = creditingStartYear(ctx);
```

`ctx` is already in scope — it is built a few lines below as `{ project, factors, sectionData: d }`; move that declaration above this block if needed.

`HeaderBox` and the cover are module-level components, so thread the label through as a prop. Change `HeaderBox` to accept `{ formLabel }: { formLabel: string }` and render `เอกสารข้อเสนอโครงการ (PDD) {formLabel}` at line 60; `Page` takes and forwards the same prop. Update the cover's `<p className="text-[22px]">` at line 260 to `{formLabel}`.

Replace the hardcoded checkbox pair at lines 378-379:

```ts
                  <Check on={!bundle}>แบบเดี่ยว</Check>
                  <Check on={bundle}>แบบควบรวม</Check>
```

Replace `fmt(project.capacity_kwp)` with `fmt(totalKwp)` at lines 474, 477, 742, and 853 so the aggregate capacity flows into the narrative, both boundary diagrams, and the summary table.

Add ตารางที่ 1 immediately after the section-1 narrative, rendered only in bundle mode:

```tsx
{bundle && (
  <>
    <p className="mt-3 font-bold">ตารางที่ 1 รายละเอียดโครงการเบื้องต้น กำลังผลิตติดตั้งและปริมาณไฟฟ้าที่คาดว่าจะผลิตได้</p>
    <table data-testid="sites-table" className="doc-table w-full">
      <thead>
        <tr>
          <th>ลำดับ</th><th>เจ้าของโครงการ</th><th>ผู้พัฒนาโครงการ</th>
          <th>กำลังการผลิตติดตั้ง (kWp)</th><th>ปริมาณไฟฟ้าปีที่ 1 (kWh/year)</th>
        </tr>
      </thead>
      <tbody>
        {sites.map((s, i) => (
          <tr key={`${s.owner}-${i}`}>
            <td className="text-center">{i + 1}</td>
            <td>{s.owner || '-'}</td>
            {i === 0 && <td rowSpan={sites.length} className="text-center align-middle">{str('project_owner')}</td>}
            <td className="text-right">{s.kwp === null ? '-' : fmt(s.kwp, 3)}</td>
            <td className="text-right">{s.year1_kwh === null ? '-' : fmtInt(s.year1_kwh)}</td>
          </tr>
        ))}
        <tr className="font-bold">
          <td colSpan={2} className="text-center">รวม</td><td />
          <td className="text-right">{fmt(totalKwp, 3)}</td>
          <td className="text-right">{totalYear1 === null ? '-' : fmtInt(totalYear1)}</td>
        </tr>
      </tbody>
    </table>
  </>
)}
```

Blank cells render `-`, never a zero or a guessed value.

Add ตารางที่ 4 (maintenance frequency per site) in the section-4 monitoring page, using the same bundle guard and `s.maintenance_per_year`, with `-` for null.

Add the page-31 appendix matrix — per-site kWh across every crediting year — in the appendix, bundle-only. Build it from `siteGenerationMatrix`, which you already import for the calc path, so the rendered table and the BE/ER arithmetic cannot diverge:

```tsx
{bundle && (() => {
  const m = siteGenerationMatrix(sites, startYear, years, Number(str('degradation_pct')) || 0.4);
  return (
    <>
      <p className="mt-3 font-bold">ตารางแสดงปริมาณไฟฟ้าคาดการณ์รายปี (หน่วย: kWh)</p>
      <table data-testid="sites-forecast" className="doc-table w-full">
        <thead>
          <tr><th>รายชื่อโครงการ</th>{m.years.map((y) => <th key={y}>{y}</th>)}</tr>
        </thead>
        <tbody>
          {m.rows.map((r, i) => (
            <tr key={`${r.site.owner}-${i}`}>
              <td>{r.site.owner || '-'}</td>
              {r.generation.map((g, j) => <td key={j} className="text-right">{g === 0 ? '' : fmtInt(g)}</td>)}
            </tr>
          ))}
          <tr className="font-bold">
            <td className="text-center">รวม</td>
            {m.totals.map((t, j) => <td key={j} className="text-right">{fmtInt(t)}</td>)}
          </tr>
        </tbody>
      </table>
    </>
  );
})()}
```

Years a site had not yet synchronised render blank, matching the reference document's page 31 — not `0`, which would read as a site that generated nothing.

`creditingStartYear` is currently module-private in `pdd.ts` (Task 4). Export it there and import it here rather than recomputing the Buddhist-year conversion in the template.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd carbon-ready && npm test`
Expected: PASS, including the pre-existing single-project snapshot tests — those are the regression guard proving single-mode output is unchanged.

- [ ] **Step 5: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/templates/TverSF001Pdd.tsx carbon-ready/src/templates/tver-sf001.ui.test.tsx
git commit -m "feat(pdd): render aggregated T-VER-S-F001 form"
```

---

### Task 8: Validate aggregated PDDs

**Files:**
- Modify: `carbon-ready/src/lib/pdd.ts:29-42`
- Test: `carbon-ready/src/lib/pdd.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `carbon-ready/src/lib/pdd.test.ts`:

```ts
describe('validatePdd — aggregated mode', () => {
  const METH_SITES: Methodology = {
    ...METH,
    pdd_sections: [{ key: 'cover', title: 'Cover', fields: [
      { key: 'project_form', label: 'รูปแบบ', type: 'select',
        options: ['แบบเดี่ยว', 'แบบควบรวม'], required: true },
      { key: 'sites', label: 'พื้นที่ติดตั้ง', type: 'table', required: false, columns: [] },
    ] }],
  };

  it('requires at least one site row in aggregated mode', () => {
    const r = validatePdd(METH_SITES, { project_form: 'แบบควบรวม', sites: [] });
    expect(r.ok).toBe(false);
    expect(r.missing.some((m) => m.field === 'sites')).toBe(true);
  });

  it('flags site rows missing capacity or year-1 generation', () => {
    const r = validatePdd(METH_SITES, {
      project_form: 'แบบควบรวม',
      sites: [{ owner: 'A', kwp: 100, year1_kwh: 200000 }, { owner: 'B', kwp: null }],
    });
    expect(r.ok).toBe(false);
    expect(r.missing.some((m) => m.field === 'sites' && m.label.includes('2'))).toBe(true);
  });

  it('passes with complete site rows', () => {
    const r = validatePdd(METH_SITES, {
      project_form: 'แบบควบรวม',
      sites: [{ owner: 'A', kwp: 100, year1_kwh: 200000 }],
    });
    expect(r.ok).toBe(true);
  });

  it('does not require sites in single-project mode', () => {
    expect(validatePdd(METH_SITES, { project_form: 'แบบเดี่ยว' }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd carbon-ready && npx vitest run src/lib/pdd.test.ts`
Expected: FAIL — the empty-sites case reports `ok: true`.

- [ ] **Step 3: Write the implementation**

In `carbon-ready/src/lib/pdd.ts`, inside `validatePdd`, immediately before `return { ok: missing.length === 0, missing };`:

```ts
  // Aggregated PDDs stand on their site table: without complete rows the
  // aggregate capacity and generation totals would be silently wrong.
  if (data.project_form === 'แบบควบรวม') {
    const sites = parseSites(data.sites);
    if (sites.length === 0) {
      missing.push({ section: 'cover', field: 'sites', label: 'พื้นที่ติดตั้งในโครงการ (ต้องมีอย่างน้อย 1 แห่ง)' });
    }
    sites.forEach((s, i) => {
      if (s.kwp === null || s.year1_kwh === null) {
        missing.push({
          section: 'cover', field: 'sites',
          label: `พื้นที่ติดตั้งแถวที่ ${i + 1} — ต้องกรอกกำลังการผลิตและไฟฟ้าปีที่ 1`,
        });
      }
    });
  }
```

- [ ] **Step 4: Run the full suite**

Run: `cd carbon-ready && npm test && npm run build`
Expected: all tests PASS and the TypeScript build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/oppabig/Documents/GitHub/GEM-Carbon-Credit---dMRV
git add carbon-ready/src/lib/pdd.ts carbon-ready/src/lib/pdd.test.ts
git commit -m "feat(pdd): validate aggregated PDD site rows"
```

---

## Definition of done

- [ ] `cd carbon-ready && npm test` passes with no skipped tests.
- [ ] `cd carbon-ready && npm run build` succeeds.
- [ ] A PDD with `project_form = 'แบบเดี่ยว'` renders byte-identically to before this change.
- [ ] A PDD with two site rows renders ตารางที่ 1 with a correct summed total and labels itself แบบควบรวม.
- [ ] The page-31 fixture passes within its stated ±2 / ±5 tolerance.

## Deliberately out of scope

Per the spec: per-site evidence attachment, per-site IoT meter readings, and promoting a site row to a real `Project`. The `project_id` column exists as the seam; the flow is separate work.

## Carried-forward open question

The reference PDD's §3.1 states `EG_Consumer,PJ,y` = 2,550,585.36 kWh while its own ตารางที่ 1 sums to 2,499,410 kWh. This implementation computes from the site rows. If TGO expects the §3.1 figure to derive differently, that changes `year1GenerationKwh`'s bundle branch and must be confirmed with the reference document's preparer.
