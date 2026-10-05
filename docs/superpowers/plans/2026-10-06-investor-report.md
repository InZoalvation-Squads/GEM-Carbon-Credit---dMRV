# Investor Report (REC ROI + Scope 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A printable A4 investor report (portfolio + per project, 2 pages each) that explains each solar project's REC money and what REC / T-VER choices mean for Scope 2, downloadable as PDF from the web app.

**Architecture:** Pure data builders in `carbon-ready/src/lib/investor-report.ts` reuse the existing REC ROI evaluation (`evaluateProjectRecRoi`), the PDD yearly ER arithmetic (`computeYearlyTable`) and a new sourced Scope 2 factor file. A template `carbon-ready/src/templates/InvestorReport.tsx` renders A4 pages with the same print mechanics as `EvidentSF02.tsx` (`window.print()` → "Save as PDF"). Two lazy routes plus download buttons on `/rec-roi` and the project REC ROI tab.

**Tech Stack:** React 18 + TypeScript + Zustand + Tailwind + Recharts + Vitest/Testing Library (SPA only, `carbon-ready/`). No server changes.

**Spec:** `docs/superpowers/specs/2026-10-06-investor-report-design.md`

**Ground rules for the implementer**
- Real data only: no invented prices, factors, investments or names. Missing → say it is missing.
- Original look (memory `feedback-keep-original-look`): `brand-*` emerald, `ink-*` slate, Inter/Anuphan; green TEXT uses `brand-700`; lightest text `ink-500` (never `ink-400`/`300`).
- The emission-factor registry and both seeds stay untouched (spec §2).
- SPA tests: `cd carbon-ready && npx vitest run <path>`; typecheck `cd carbon-ready && npx tsc -b`.
- Someone else may have uncommitted work in this working tree: stage ONLY your files by explicit path (zsh does not split `$VAR` lists — write each path), never `git add -A`, never stage `node_modules/.vite/...results.json` or `.claude/`. Run `git diff --cached --stat` before every commit.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `carbon-ready/src/data/scope2-factors.ts` | create | Sourced Scope 2 grid factors + `scope2FactorFor(country, date)` |
| `carbon-ready/src/data/scope2-factors.test.ts` | create | lookup tests |
| `carbon-ready/src/lib/investor-report.ts` | create | `projectCountry`, `monthlyProduction`, `tverEstimate`, `recNetTotal`, `buildProjectReport`, `buildPortfolioReport` |
| `carbon-ready/src/lib/investor-report.test.ts` | create | builder tests |
| `carbon-ready/src/templates/InvestorReport.tsx` | create | A4 pages + the two route components |
| `carbon-ready/src/templates/investor-report.ui.test.tsx` | create | render tests |
| `carbon-ready/src/routeLoaders.ts` | modify | `InvestorPortfolioReport`, `InvestorProjectReport` loaders |
| `carbon-ready/src/App.tsx` | modify | two routes |
| `carbon-ready/src/components/layout/RouteMetadata.tsx` | modify | titles |
| `carbon-ready/src/pages/RecRoi.tsx` | modify | "ดาวน์โหลดรายงานนักลงทุน" (portfolio) |
| `carbon-ready/src/components/rec-roi/RecRoiDetail.tsx` | modify | same button (single project) |
| `carbon-ready/src/pages/recroi.ui.test.tsx` | modify | button tests |

---

### Task 1: Scope 2 factor as data

**Files:** Create `carbon-ready/src/data/scope2-factors.ts`, `carbon-ready/src/data/scope2-factors.test.ts`

- [ ] **Step 1: Write the failing test** — `carbon-ready/src/data/scope2-factors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SCOPE2_FACTORS, scope2FactorFor } from './scope2-factors';

describe('Scope 2 grid factors (organisation reporting, not the T-VER project EF)', () => {
  it('carries TGO 2026 for Thailand with its source', () => {
    const th = SCOPE2_FACTORS.find((f) => f.country === 'TH' && f.source === 'TGO')!;
    expect(th.value_kg_per_kwh).toBe(0.475);
    expect(th.effective_date).toBe('2026-01-01');
    expect(th.source_url).toBe('https://www.nationthailand.com/news/policy/40059019');
  });

  it('picks the newest factor in effect on the given date', () => {
    expect(scope2FactorFor('TH', '2026-06-30')?.value_kg_per_kwh).toBe(0.475);
    expect(scope2FactorFor('TH', '2026-01-01')?.value_kg_per_kwh).toBe(0.475);
  });

  it('returns null before any factor is in effect, or for another country', () => {
    expect(scope2FactorFor('TH', '2025-12-31')).toBeNull();
    expect(scope2FactorFor('IN', '2026-06-30')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd carbon-ready && npx vitest run src/data/scope2-factors.test.ts` — Expected: FAIL, cannot resolve `./scope2-factors`.

- [ ] **Step 3: Implement** — `carbon-ready/src/data/scope2-factors.ts`:

```ts
// Grid emission factors for an ORGANISATION's location-based Scope 2 (purchased
// electricity). Deliberately separate from the emission-factor registry, which
// feeds T-VER project calculations and registered PDDs — a different factor
// with different rules. Add a row when the authority publishes a new value;
// never estimate. Spec: docs/superpowers/specs/2026-10-06-investor-report-design.md §2.

export interface Scope2Factor {
  country: string;            // ISO code as locationToCountryCode returns it
  source: string;             // publishing authority
  value_kg_per_kwh: number;   // kgCO2e/kWh (= tCO2e/MWh)
  effective_date: string;     // ISO date the factor applies from
  source_url: string;
  note: string;
}

export const SCOPE2_FACTORS: Scope2Factor[] = [
  {
    country: 'TH', source: 'TGO', value_kg_per_kwh: 0.475, effective_date: '2026-01-01',
    source_url: 'https://www.nationthailand.com/news/policy/40059019',
    note: 'TGO Scope 2 factor for purchased electricity incl. T&D losses; previous factors allowed until 2026-03-31.',
  },
];

/** Newest factor for the country with effective_date <= isoDate, else null. */
export function scope2FactorFor(country: string, isoDate: string): Scope2Factor | null {
  return SCOPE2_FACTORS
    .filter((f) => f.country === country && f.effective_date <= isoDate)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0] ?? null;
}
```

- [ ] **Step 4: Run tests** — Expected: PASS (3 tests).
- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/data/scope2-factors.ts carbon-ready/src/data/scope2-factors.test.ts
git commit -m "feat(report): sourced Scope 2 grid factor (TGO 2026) as its own data file

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Report data builders

**Files:** Create `carbon-ready/src/lib/investor-report.ts`, `carbon-ready/src/lib/investor-report.test.ts`

Context you need:
- `evaluateProjectRecRoi(args)` and `governingPdd(projectId, pdds)` and `projectEnergyBasis(project, pdds, methodologies)` live in `carbon-ready/src/lib/rec-roi-project.ts`. `ProjectRecRoi` has `eligible`, `annual` (`AnnualMwh`: `status`, `annual_mwh`, `total_kwh`, `window_start`, `window_end`, `coverage_days`, `partial`), `roi` (`RecRoiResult | null`), `uplift`, `setting`, `financial_basis`, `investment_mthb`, `investment_source`.
- `computeYearlyTable(ctx)` in `carbon-ready/src/lib/pdd.ts` returns `{ avg: { er } … } | null`; it honours `sectionData.year1_generation_kwh` and uses the registry's current factor for the project's country.
- `isBundle(sectionData)` in `carbon-ready/src/lib/pdd-sites.ts`.
- `locationToCountryCode` in `carbon-ready/src/lib/geo.ts`; existing code derives the country from the LAST comma segment of `project.location` (see `gridFactor` in `pdd.ts`).
- `RecRoiResult.recommended` + `RecPathOk.scenarios` (`scenario: 'mid'`, `net_thb`) in `carbon-ready/src/lib/rec-roi.ts`.

- [ ] **Step 1: Write the failing tests** — `carbon-ready/src/lib/investor-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Methodology, MonitoringRecord, Project, ProjectDesignDocument } from '../types';
import { TVER_SOLAR_METHODOLOGY } from '../data/methodology-tver-solar';
import { seedFactors } from '../data/seed';
import { EMPTY_REC_ROI_SETTINGS } from './rec-roi';
import {
  buildPortfolioReport, buildProjectReport, monthlyProduction, projectCountry, recNetTotal, tverEstimate,
} from './investor-report';
import { evaluateProjectRecRoi } from './rec-roi-project';

// Synthetic arithmetic inputs, not market data — never copy into fixtures or seeds.
const TH: Project = {
  id: 'prj-th', organization_id: 'org', name: 'Thai Solar', location: 'Uthai Thani, Thailand',
  capacity_kwp: 99, commission_date: '2025-11-07', status: 'active', lifecycle_stage: 'registered',
  created_at: '2025-11-07T00:00:00Z', updated_at: '2025-11-07T00:00:00Z',
};
const IN: Project = { ...TH, id: 'prj-in', name: 'Indian Solar', location: 'Pune, India' };
const FOREST: Project = { ...TH, id: 'prj-f', name: 'Forest', capacity_kwp: 0 };

function daily(projectId: string, from: string, days: number, kwh: number): MonitoringRecord[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    id: `${projectId}-${i}`, project_id: projectId,
    record_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    generation_kwh: kwh, source: 'csv', uploaded_at: '2026-01-01T00:00:00Z',
  }));
}

const pdd = (projectId: string, over: Partial<ProjectDesignDocument> = {}): ProjectDesignDocument => ({
  id: `PDD-${projectId}`, project_id: projectId, methodology_id: TVER_SOLAR_METHODOLOGY.id,
  methodology_snapshot: 'x', state: 'registered', section_data: {}, evidence_ids: [],
  assigned_validator_name: 'v', submitted_at: null, validated_at: '2026-01-01T00:00:00Z',
  content_hash: null, ipfs_cid: null, credential_id: null, ...over,
} as ProjectDesignDocument);

const METHODS = [TVER_SOLAR_METHODOLOGY] as Methodology[];
const RECORDS = [...daily('prj-th', '2026-01-01', 90, 100), ...daily('prj-in', '2026-01-01', 90, 100)];
const ASSUME = { ...EMPTY_REC_ROI_SETTINGS, price_mid_thb: 25, price_source: 'quote', platform_fee_pct: 10, eur_thb: 40 };
const base = {
  projects: [TH, IN, FOREST], records: RECORDS, pdds: [pdd('prj-th')], methodologies: METHODS,
  factors: seedFactors, recIssues: [], projectSettings: [], assumptions: ASSUME, now: '2026-10-06T08:00:00Z',
};

describe('projectCountry', () => {
  it('reads the last comma segment like gridFactor', () => {
    expect(projectCountry(TH)).toBe('TH');
    expect(projectCountry(IN)).toBe('IN');
  });
});

describe('monthlyProduction', () => {
  it('groups the measured window by month', () => {
    const r = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: ASSUME });
    expect(monthlyProduction(TH, RECORDS, r, undefined)).toEqual([
      { month: '2026-01', kwh: 3_100 }, { month: '2026-02', kwh: 2_800 }, { month: '2026-03', kwh: 3_100 },
    ]);
  });
});

describe('tverEstimate', () => {
  it('uses the registered T-VER PDD arithmetic with the measured annual kWh', () => {
    const t = tverEstimate(TH, [pdd('prj-th')], METHODS, seedFactors, 36.5)!;
    expect(t.methodology_code).toBe(TVER_SOLAR_METHODOLOGY.code);
    expect(t.tco2e_year).toBeGreaterThan(0);
  });
  it('null without a T-VER PDD, or for a bundle PDD', () => {
    expect(tverEstimate(TH, [], METHODS, seedFactors, 36.5)).toBeNull();
    expect(tverEstimate(TH, [pdd('prj-th', { section_data: { sites: [{ name: 'a', kwp: 1 }] } })], METHODS, seedFactors, 36.5)).toBeNull();
  });
});

describe('buildProjectReport', () => {
  it('Thai project: Scope 2 = annual MWh × TGO 0.475 (tCO2e)', () => {
    const r = buildProjectReport({ ...base, projectId: 'prj-th' })!;
    expect(r.generated_at).toBe('2026-10-06T08:00:00Z');
    expect(r.roi.annual.status).toBe('ok');
    const mwh = r.roi.annual.status === 'ok' ? r.roi.annual.annual_mwh : 0;
    expect(r.scope2.factor?.value_kg_per_kwh).toBe(0.475);
    expect(r.scope2.tco2e_location_year).toBeCloseTo(mwh * 0.475, 9);
    expect(r.scope2.recs_year).toBeCloseTo(mwh, 9);
    expect(r.scope2.tver).not.toBeNull();
  });
  it('Indian project: no Scope 2 factor → null tCO2e, no T-VER PDD → null', () => {
    const r = buildProjectReport({ ...base, projectId: 'prj-in' })!;
    expect(r.scope2.factor).toBeNull();
    expect(r.scope2.tco2e_location_year).toBeNull();
    expect(r.scope2.tver).toBeNull();
  });
  it('null for an ineligible project or one without data', () => {
    expect(buildProjectReport({ ...base, projectId: 'prj-f' })).toBeNull();
    expect(buildProjectReport({ ...base, records: [], projectId: 'prj-th' })).toBeNull();
  });
});

describe('recNetTotal', () => {
  it('= the recommended path’s mid-price net, null without a price', () => {
    const r = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: ASSUME });
    expect(recNetTotal(r)).not.toBeNull();
    const noPrice = evaluateProjectRecRoi({ project: TH, records: RECORDS, pdds: [], methodologies: METHODS, factors: [], assumptions: { ...ASSUME, price_mid_thb: null } });
    expect(recNetTotal(noPrice)).toBeNull();
  });
});

describe('buildPortfolioReport', () => {
  it('eligible projects with data only, sorted by name, with totals', () => {
    const p = buildPortfolioReport(base);
    expect(p.projects.map((x) => x.project.id)).toEqual(['prj-in', 'prj-th']); // Indian < Thai
    const sum = p.projects.reduce((s, x) => s + (x.roi.annual.status === 'ok' ? x.roi.annual.annual_mwh : 0), 0);
    expect(p.totals.mwh_year).toBeCloseTo(sum, 9);
    expect(p.totals.tco2e_location_year).toBeCloseTo(p.projects[1].scope2.tco2e_location_year!, 9); // only TH has a factor
    expect(p.totals.rec_net_total).not.toBeNull();
  });
  it('no price anywhere → rec_net_total null', () => {
    expect(buildPortfolioReport({ ...base, assumptions: { ...ASSUME, price_mid_thb: null } }).totals.rec_net_total).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd carbon-ready && npx vitest run src/lib/investor-report.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `carbon-ready/src/lib/investor-report.ts`:

```ts
// Investor report data — pure builders over the same evaluation the REC ROI
// pages use, plus Scope 2 (location-based) and the T-VER alternative.
// Spec: docs/superpowers/specs/2026-10-06-investor-report-design.md
import type {
  EmissionFactor, Methodology, MonitoringRecord, Project, ProjectDesignDocument,
  RecIssueRequest, RecRoiProjectSetting, UUID,
} from '../types';
import { computeYearlyTable } from './pdd';
import { isBundle } from './pdd-sites';
import { locationToCountryCode } from './geo';
import { evaluateProjectRecRoi, governingPdd, projectEnergyBasis, type ProjectRecRoi } from './rec-roi-project';
import type { RecPathOk, RecRoiAssumptions } from './rec-roi';
import { scope2FactorFor, type Scope2Factor } from '../data/scope2-factors';

export interface Scope2Block {
  factor: Scope2Factor | null;
  annual_mwh: number;
  /** annual MWh × kgCO2e/kWh = tCO2e, assuming all production is self-consumed; null without a factor. */
  tco2e_location_year: number | null;
  /** T-VER alternative for the same MWh (registered T-VER PDD arithmetic); null without one. */
  tver: { tco2e_year: number; methodology_code: string } | null;
  recs_year: number;
}

export interface ProjectReportData {
  project: Project;
  generated_at: string;
  roi: ProjectRecRoi;                               // eligible, annual.status === 'ok', roi !== null
  monthly: Array<{ month: string; kwh: number }>;
  scope2: Scope2Block;
}

export interface PortfolioReportData {
  generated_at: string;
  projects: ProjectReportData[];
  totals: { mwh_year: number; recs_year: number; rec_net_total: number | null; tco2e_location_year: number | null };
}

export interface ReportSources {
  projects: Project[];
  records: MonitoringRecord[];
  pdds: ProjectDesignDocument[];
  methodologies: Methodology[];
  factors: EmissionFactor[];
  recIssues: RecIssueRequest[];
  projectSettings: RecRoiProjectSetting[];
  assumptions: RecRoiAssumptions;
  now: string;
}

/** Country code from the last comma segment, as gridFactor in pdd.ts reads it. */
export function projectCountry(project: Project): string {
  return locationToCountryCode(project.location.split(',').pop()?.trim() ?? '');
}

/** Measured kWh per month inside the REC ROI window (same driver filter as annualMwh). */
export function monthlyProduction(
  project: Project, records: MonitoringRecord[], r: ProjectRecRoi, driverParam: string | undefined,
): Array<{ month: string; kwh: number }> {
  if (r.annual.status !== 'ok') return [];
  const { window_start, window_end } = r.annual;
  const byMonth = new Map<string, number>();
  for (const rec of records) {
    if (rec.project_id !== project.id) continue;
    if (driverParam && rec.param_key && rec.param_key !== driverParam) continue;
    const d = rec.record_date.slice(0, 10);
    if (d < window_start || d > window_end) continue;
    byMonth.set(d.slice(0, 7), (byMonth.get(d.slice(0, 7)) ?? 0) + rec.generation_kwh);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, kwh]) => ({ month, kwh }));
}

/** Average yearly ER of the registered T-VER PDD, re-run with the measured annual generation. */
export function tverEstimate(
  project: Project, pdds: ProjectDesignDocument[], methodologies: Methodology[],
  factors: EmissionFactor[], annualMwh: number,
): { tco2e_year: number; methodology_code: string } | null {
  const pdd = governingPdd(project.id, pdds);
  const m = pdd && methodologies.find((x) => x.id === pdd.methodology_id);
  // A bundle PDD sums its sites' generation and ignores a year-1 override — not this project's MWh.
  if (!pdd || !m || m.standard !== 'T-VER' || isBundle(pdd.section_data ?? {})) return null;
  const table = computeYearlyTable({
    project, factors, sectionData: { ...pdd.section_data, year1_generation_kwh: annualMwh * 1000 },
  });
  return table ? { tco2e_year: table.avg.er, methodology_code: m.code } : null;
}

/** Net REC baht over the horizon on the recommended path at the mid price; null without one. */
export function recNetTotal(r: ProjectRecRoi): number | null {
  const roi = r.roi;
  if (!roi?.recommended) return null;
  const path = [roi.own, roi.platform].find((p): p is RecPathOk => p.status === 'ok' && p.path === roi.recommended);
  return path?.scenarios.find((s) => s.scenario === 'mid')?.net_thb ?? null;
}

export function buildProjectReport(args: ReportSources & { projectId: UUID }): ProjectReportData | null {
  const project = args.projects.find((p) => p.id === args.projectId);
  if (!project) return null;
  const roi = evaluateProjectRecRoi({
    project, records: args.records, pdds: args.pdds, methodologies: args.methodologies,
    factors: args.factors, assumptions: args.assumptions,
    setting: args.projectSettings.find((s) => s.project_id === project.id),
    latestRequestType: args.recIssues.find((x) => x.project_id === project.id)?.request_type,
  });
  if (!roi.eligible || roi.annual.status !== 'ok' || !roi.roi) return null;
  const mwh = roi.annual.annual_mwh;
  const factor = scope2FactorFor(projectCountry(project), roi.annual.window_end);
  const { driverParam } = projectEnergyBasis(project, args.pdds, args.methodologies);
  return {
    project, generated_at: args.now, roi,
    monthly: monthlyProduction(project, args.records, roi, driverParam),
    scope2: {
      factor, annual_mwh: mwh, recs_year: mwh,
      tco2e_location_year: factor ? mwh * factor.value_kg_per_kwh : null,
      tver: tverEstimate(project, args.pdds, args.methodologies, args.factors, mwh),
    },
  };
}

export function buildPortfolioReport(args: ReportSources): PortfolioReportData {
  const projects = args.projects
    .map((p) => buildProjectReport({ ...args, projectId: p.id }))
    .filter((r): r is ProjectReportData => r !== null)
    .sort((a, b) => a.project.name.localeCompare(b.project.name));
  const nets = projects.map((p) => recNetTotal(p.roi)).filter((n): n is number => n !== null);
  const tco2 = projects.map((p) => p.scope2.tco2e_location_year).filter((n): n is number => n !== null);
  const mwh = projects.reduce((s, p) => s + p.scope2.annual_mwh, 0);
  return {
    generated_at: args.now, projects,
    totals: {
      mwh_year: mwh, recs_year: mwh,
      rec_net_total: nets.length ? nets.reduce((s, n) => s + n, 0) : null,
      tco2e_location_year: tco2.length ? tco2.reduce((s, n) => s + n, 0) : null,
    },
  };
}
```

If `governingPdd` or `projectEnergyBasis` are not exported from `rec-roi-project.ts`, export them (no logic change). If `Methodology` has no `code`, use the field that holds the official code (check `types/index.ts`) and say so in the report.

- [ ] **Step 4: Run** `cd carbon-ready && npx vitest run src/lib/investor-report.test.ts && npx tsc -b` → PASS. If the monthly test's day counts are off, recount (90 days from 2026-01-01 = Jan 31 + Feb 28 + Mar 31) rather than editing the builder.
- [ ] **Step 5: Commit** `carbon-ready/src/lib/investor-report.ts` + test (+ `rec-roi-project.ts` only if you added exports): `feat(report): investor report data — REC money, monthly production, Scope 2 and T-VER alternative`.

---

### Task 3: A4 report template + routes

**Files:** Create `carbon-ready/src/templates/InvestorReport.tsx`, `carbon-ready/src/templates/investor-report.ui.test.tsx`; modify `carbon-ready/src/routeLoaders.ts`, `carbon-ready/src/App.tsx`, `carbon-ready/src/components/layout/RouteMetadata.tsx`.

Reuse: `buildRecRoiSummary(r, assumptions)` (`components/rec-roi/summary.ts`, gives `tone/label/headline/points/money`); `PATH_LABEL`, `PATH_SHORT`, `thb`, `signedThb`, `pct`, `pricePerMwh`, `paybackText`, `breakEvenText`, `recommendationBadge` (`components/rec-roi/format.ts`); `REC_FEES` (`data/rec-fees.ts`); `formatNumber` (`lib/format.ts`); `Button`, `LinkButton` (`components/ui/Button.tsx`). Print mechanics: copy the approach of `templates/EvidentSF02.tsx` (toolbar `print:hidden` with `window.print()`, a scoped `<style>` with `@media print { @page { size: A4; margin: 12mm } … break-after: page }`, `print-color-adjust: exact`).

- [ ] **Step 1: Write the failing UI tests** — `carbon-ready/src/templates/investor-report.ui.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useStore } from '../store';
import { seedDemo } from '../test/demoFixtures';
import { InvestorPortfolioReport, InvestorProjectReport } from './InvestorReport';
import type { MonitoringRecord } from '../types';

function daily(projectId: string, days: number, kwh: number): MonitoringRecord[] {
  const start = Date.parse('2026-01-01T00:00:00Z');
  return Array.from({ length: days }, (_, i) => ({
    id: `rep-${projectId}-${i}`, project_id: projectId,
    record_date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    generation_kwh: kwh, source: 'csv', uploaded_at: '2026-01-01T00:00:00Z',
  }));
}

beforeEach(() => {
  localStorage.clear();
  seedDemo();
  // prj-0001 becomes a Thai site with 92 days of 2026 data so the TGO factor applies.
  useStore.setState((s) => ({
    currentUser: { ...s.currentUser, role: 'esg_manager' },
    projects: s.projects.map((p) => (p.id === 'prj-0001' ? { ...p, location: 'Bangkok, Thailand' } : p)),
    records: [...s.records.filter((r) => r.project_id !== 'prj-0001'), ...daily('prj-0001', 92, 100)],
    recRoiSettings: { ...s.recRoiSettings, price_mid_thb: 25, price_source: 'quote', platform_fee_pct: 10, eur_thb: 40 },
  }));
});

const renderAt = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/reports/investor" element={<InvestorPortfolioReport />} />
      <Route path="/reports/investor/:projectId" element={<InvestorProjectReport />} />
    </Routes>
  </MemoryRouter>,
);
const pages = (c: HTMLElement) => c.querySelectorAll('.inv-page');

describe('single-project investor report', () => {
  it('two A4 pages: REC money, then Scope 2', () => {
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(pages(container)).toHaveLength(2);
    const [money, scope2] = [...pages(container)] as HTMLElement[];
    expect(within(money).getByText(/^ขาย REC ผ่านแพลตฟอร์มที่ราคา 25\.00 ฿\/MWh/)).toBeInTheDocument();
    expect(within(money).getByText('ไม่มี REC')).toBeInTheDocument();
    // 36.5 MWh/yr × 0.475 = 17.34 tCO2e/yr
    expect(within(scope2).getByText('17.34')).toBeInTheDocument();
    expect(within(scope2).getByText(/TGO 0\.475 kgCO₂e\/kWh/)).toBeInTheDocument();
    expect(within(scope2).getByText(/ออก T-VER/)).toBeInTheDocument();
    expect(within(scope2).getByText(/ออก REC แล้วขาย/)).toBeInTheDocument();
    expect(within(scope2).getByText(/ออก REC แล้วเก็บไว้ redeem/)).toBeInTheDocument();
    expect(within(scope2).getByText(/has not and will not be submitted for any other energy attribute tracking methodology/)).toBeInTheDocument();
  });

  it('names no person as preparer', () => {
    renderAt('/reports/investor/prj-0001');
    expect(screen.getByText(/จัดทำจากข้อมูลวัดจริงในระบบ ณ วันที่/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(useStore.getState().currentUser.name))).toBeNull();
  });

  it('without a REC price the hero shows the break-even price', () => {
    useStore.setState((s) => ({ recRoiSettings: { ...s.recRoiSettings, price_mid_thb: null, price_source: '' } }));
    const { container } = renderAt('/reports/investor/prj-0001');
    const money = pages(container)[0] as HTMLElement;
    // 250 kWp, 36.5 MWh/yr, fee 10% → platform break-even 24.19 ฿/MWh: hero + KPI strip.
    expect(within(money).getAllByText('24.19').length).toBeGreaterThanOrEqual(2);
    expect(within(money).getAllByText('รอราคา REC').length).toBeGreaterThan(0);
  });

  it('a project outside Thailand shows no Scope 2 number', () => {
    useStore.setState((s) => ({ projects: s.projects.map((p) => (p.id === 'prj-0001' ? { ...p, location: 'Pune, India' } : p)) }));
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(within(pages(container)[1] as HTMLElement).getByText(/ไม่มีค่า EF Scope 2 สำหรับช่วงข้อมูลนี้/)).toBeInTheDocument();
  });

  it('non-electricity project explains REC does not apply', () => {
    const { container } = renderAt('/reports/investor/prj-0006'); // forestry
    expect(pages(container)).toHaveLength(0);
    expect(screen.getByText(/REC ใช้กับโปรเจกต์ผลิตไฟฟ้าเท่านั้น/)).toBeInTheDocument();
  });

  it('verifier gets no access', () => {
    useStore.setState((s) => ({ currentUser: { ...s.currentUser, role: 'verifier' } }));
    const { container } = renderAt('/reports/investor/prj-0001');
    expect(pages(container)).toHaveLength(0);
    expect(screen.getByText(/ผู้ตรวจสอบไม่มีสิทธิ์ดูข้อมูลราคา REC/)).toBeInTheDocument();
  });
});

describe('portfolio investor report', () => {
  it('overview page + two pages per reported project', () => {
    const { container } = renderAt('/reports/investor');
    const all = pages(container);
    expect(all[0]).toHaveTextContent('ภาพรวมพอร์ต');
    expect((all.length - 1) % 2).toBe(0);
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all[0]).toHaveTextContent(/Pune Rooftop Phase 1/);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL (module missing).

- [ ] **Step 3: Implement** `carbon-ready/src/templates/InvestorReport.tsx`. Required structure (write it fully; keep each page component small):

```tsx
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { useStore } from '../store';
import { Button, LinkButton } from '../components/ui/Button';
import { buildPortfolioReport, buildProjectReport, recNetTotal, type ProjectReportData, type ReportSources } from '../lib/investor-report';
import { buildRecRoiSummary } from '../components/rec-roi/summary';
import { PATH_LABEL, PATH_SHORT, breakEvenText, paybackText, pct, pricePerMwh, signedThb, thb } from '../components/rec-roi/format';
import { REC_FEES } from '../data/rec-fees';
import { formatNumber } from '../lib/format';
import { evaluateProjectRecRoi } from '../lib/rec-roi-project';
import type { RecPathOk, RecRoiAssumptions } from '../lib/rec-roi';

const SF04_QUOTE = 'warrants that the energy for which I-REC(E) certificates are being sought has not and will not be submitted for any other energy attribute tracking methodology, emissions reduction certificate, or carbon offset.';
const NO_ACCESS = 'หน้านี้สำหรับผู้พัฒนาโครงการและผู้ดูแลองค์กร — ผู้ตรวจสอบไม่มีสิทธิ์ดูข้อมูลราคา REC';
```

- `useReportSources(): ReportSources` — reads `projects, records, pdds, methodologies, factors, recIssues, recRoiProjectSettings, recRoiSettings` from the store; `now` = `new Date().toISOString()` captured once with `useMemo([])`.
- `ReportShell({ backTo, children })` — the toolbar (`print:hidden`, back `LinkButton`, `Button onClick={() => window.print()}` "Print / PDF") + `<div className="inv-doc">` + the scoped `<style>`:
  - `.inv-doc { font-family: 'Inter','Anuphan',sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; counter-reset: invpage; }`
  - `.inv-page { counter-increment: invpage; background: white; width: 210mm; min-height: 297mm; padding: 14mm 14mm 12mm; margin: 0 auto 1.5rem; box-shadow: 0 1px 3px rgb(15 23 42 / .12); position: relative; }`
  - `.inv-pageno::after { content: counter(invpage); }`
  - `@media print { @page { size: A4; margin: 0 } body { background: white } .inv-page { margin: 0; box-shadow: none; break-after: page; } .inv-page:last-child { break-after: auto } }`
- `PageHeader({ title, subtitle, generatedAt })` — GEM wordmark text in `text-brand-700 font-extrabold` ("GEM CARBON CREDIT"), title, subtitle, "สร้างเมื่อ {date}" (`generatedAt.slice(0,10)`), a 2px `border-brand-600` rule under it.
- `PageFooter()` — "จัดทำจากข้อมูลวัดจริงในระบบ ณ วันที่ {date} · ค่าธรรมเนียม I-REC(E) Fee Structure {REC_FEES.version}" left, page number `<span className="inv-pageno" />` right. No person's name anywhere.
- `Kpi({ label, value, unit })` — label `text-[11px] uppercase text-ink-500`, value `text-2xl font-semibold tnum text-ink`, unit `text-xs text-ink-500`.
- `MoneyPage({ data, assumptions })` (page 1, `<section className="inv-page">`):
  - header title "การเงิน REC · {project.name}", subtitle "{location} · {kWp} kWp · ข้อมูล {window_start} – {window_end}{partial ? ` (ข้อมูล ${coverage_days} วัน ประมาณเป็นรายปี)` : ''}".
  - hero: `summary = buildRecRoiSummary(data.roi, assumptions)!`; left = big number — when `summary.money.rec_year !== null`: `signedThb(summary.money.rec_year)` + "บาท/ปี จาก REC"; else the cheapest ok break-even `pricePerMwh(...)` + "฿/MWh ราคาคุ้มทุน" (label text "ราคาคุ้มทุน"); right = `summary.headline` + `summary.label` badge text.
  - KPI strip: MWh/ปี, REC/ปี, ราคาคุ้มทุน ข (`breakEvenText(roi.platform)`), ROI @ราคากลาง (`pct(mid.roi_pct)` of the recommended path or "—").
  - "ผลิตไฟรายเดือน (kWh)": `<BarChart width={680} height={170} data={data.monthly}>` with `CartesianGrid vertical={false}`, `XAxis dataKey="month"`, `YAxis`, `Bar dataKey="kwh" fill="#059669"` (brand-600). One sentence under it: "ข้อมูลวัดจริงจากมิเตอร์ (รายวัน รวมเป็นรายเดือน)".
  - "ตัวเงิน: มี REC กับไม่มี REC": a plain `<table>` with the same rows/columns as `MoneyTable` in `RecRoiDetail.tsx` (ต่อปี / รวม {years} ปี × ไม่มี REC / มี REC / ส่วนต่าง), "รอราคา REC" when null, and the same footnote (tariff value + source, net after fees, no discounting/degradation).
  - "เทียบเส้นทาง": two columns `PATH_LABEL.own` / `PATH_LABEL.platform` — break-even (`breakEvenText`), net @mid (`thb`) and payback (`paybackText`), or the missing reason (`missing_fx` → "ยังไม่มีอัตรา EUR→THB", `missing_fee` → "ยังไม่มีค่าบริการแพลตฟอร์ม").
  - "IRR โครงการโซลาร์": `roi.uplift?.status === 'ok'` → without/with IRR + payback years; else "ขาดข้อมูลเงินลงทุน — ยังประเมิน IRR ไม่ได้".
  - footer.
- `Scope2Page({ data })` (page 2):
  - header title "Scope 2 ช่วยอะไร · {project.name}".
  - lead block: factor present → big `formatNumber(tco2e_location_year, 2)` + "tCO₂e/ปี" and line "ลด Scope 2 แบบ location-based (สมมติใช้ไฟที่ผลิตเองทั้งหมด) · {annual_mwh 1dp} MWh × {factor.source} {factor.value_kg_per_kwh} kgCO₂e/kWh (มีผล {effective_date})" with the source URL printed as text; no factor → "ไม่มีค่า EF Scope 2 สำหรับช่วงข้อมูลนี้".
  - three-way table (header: ทาง · ได้อะไร · Scope 2 market-based / RE100):
    - "ออก T-VER": `tver ? `${formatNumber(tver.tco2e_year, 0)} tCO₂e/ปี (คาร์บอนเครดิต ตาม ${tver.methodology_code})` : 'ไม่มี PDD T-VER'` · "ไม่ได้สิทธิ์ claim ว่าใช้ไฟสะอาด"
    - "ออก REC แล้วขาย": REC net from `recNetTotal(data.roi)` → `thb(n)` + " ใน {years} ปี" or "รอราคา REC" · "สิทธิ์ claim ไฟสะอาดไปอยู่กับผู้ซื้อ"
    - "ออก REC แล้วเก็บไว้ redeem": "ไม่มีรายได้ — จ่ายค่าธรรมเนียม EGAT/Evident" · `claim ไฟสะอาดได้ ${formatNumber(recs_year,1)} MWh/ปี · นับใน RE100`
  - warning box (amber, `border-amber-600/30 bg-amber-50 text-amber-800`): "ไฟ MWh เดียวกันเลือกได้ทางเดียว: SF-04 ข้อรับรองของผู้ยื่น" + the English `SF04_QUOTE` in quotes + "(Evident SF-04 Issue Request v1.2.1)".
  - "ช่วยอะไรคุณ" bullets: "ใช้ตัวเลขลด Scope 2 ในรายงาน ESG / CDP / SET (location-based)", "เก็บ REC ไว้ redeem เพื่อ claim ไฟสะอาดแบบ market-based และนับในเป้า RE100", "เลือก T-VER เมื่อเป้าหมายคือคาร์บอนเครดิต ไม่ใช่การ claim ไฟสะอาด".
  - residual-mix note: "ไทยยังไม่มีค่า residual mix ทางการ — กรณีขาย REC จึงยังคำนวณ Scope 2 แบบ market-based เป็นตัวเลขไม่ได้".
  - sources list (plain text): FN-01 2026 v2.1; Evident SF-04 v1.2.1; TGO factor URL; GHG Protocol Scope 2 Guidance (market-based method).
  - footer.
- `PortfolioOverviewPage({ data, assumptions })`: header "ภาพรวมพอร์ต · รายงานนักลงทุน REC และ Scope 2"; KPI strip: MWh/ปี, REC/ปี, REC สุทธิ (`totals.rec_net_total` → `signedThb` + " ใน {horizon} ปี" or "รอราคา REC"), tCO₂e/ปี (location-based, or "—"); ranking `<table>`: project name, MWh/ปี, คุ้มทุน ข, ROI @กลาง, ผล (`buildRecRoiSummary(...).label`); horizontal `BarChart layout="vertical" width={680} height={Math.max(160, 22 * n + 40)}` of platform break-even per project (`XAxis type="number"`, `YAxis type="category" dataKey="name" width={200}`) with `<ReferenceLine x={assumptions.price_mid_thb} stroke="#b45309" label="ราคากลาง" />` only when a mid price exists; footer.
- `InvestorProjectReport()` (route `/reports/investor/:projectId`): verifier → `NO_ACCESS` card (no `.inv-page`); `data = buildProjectReport({...sources, projectId})`; null → message: when the project is not eligible "REC ใช้กับโปรเจกต์ผลิตไฟฟ้าเท่านั้น (methodology ที่วัดเป็น kWh)", otherwise "ยังไม่มีข้อมูลการผลิต"; else `ReportShell backTo={`/projects/${id}?tab=rec-roi`}` with `MoneyPage` + `Scope2Page`. (Use `evaluateProjectRecRoi(...).eligible` only to choose the message.)
- `InvestorPortfolioReport()` (route `/reports/investor`): verifier → `NO_ACCESS`; else `ReportShell backTo="/rec-roi"` with `PortfolioOverviewPage` then, for each project, `MoneyPage` + `Scope2Page`; zero projects → overview page only with "ยังไม่มีโครงการที่มีข้อมูลการผลิต".

All hooks above any early return. Text colours: `text-ink`, `text-ink-700`, `text-ink-500` (lightest); green text `text-brand-700`; negatives `text-red-700`.

- [ ] **Step 4: Routes**
  - `carbon-ready/src/routeLoaders.ts`: add
    `InvestorPortfolioReport: once(() => import('./templates/InvestorReport').then((module) => ({ default: module.InvestorPortfolioReport }))),` and
    `InvestorProjectReport: once(() => import('./templates/InvestorReport').then((module) => ({ default: module.InvestorProjectReport }))),`
  - `carbon-ready/src/App.tsx`: `const InvestorPortfolioReport = lazy(routeLoaders.InvestorPortfolioReport);` `const InvestorProjectReport = lazy(routeLoaders.InvestorProjectReport);` and after the `/rec-roi` route:
    `<Route path="/reports/investor" element={<InvestorPortfolioReport />} />`
    `<Route path="/reports/investor/:projectId" element={<InvestorProjectReport />} />`
  - `carbon-ready/src/components/layout/RouteMetadata.tsx` `pageTitle`: before the titles map add
    `if (path === '/reports/investor') return 'Investor Report';`
    `if (/^\/reports\/investor\/[^/]+$/.test(path)) return 'Investor Report';`
- [ ] **Step 5: Run** `cd carbon-ready && npx vitest run src/templates/investor-report.ui.test.tsx src/layouts && npx tsc -b` → PASS. Recharts with explicit `width`/`height` renders in jsdom; if it warns about size, that is fine — do not assert on chart internals.
- [ ] **Step 6: Commit** the template, its test, `routeLoaders.ts`, `App.tsx`, `RouteMetadata.tsx`: `feat(report): printable investor report — portfolio + 2 pages per project`.

---

### Task 4: Download buttons

**Files:** Modify `carbon-ready/src/pages/RecRoi.tsx`, `carbon-ready/src/components/rec-roi/RecRoiDetail.tsx`, `carbon-ready/src/pages/recroi.ui.test.tsx`

- [ ] **Step 1: Failing tests** — append to `carbon-ready/src/pages/recroi.ui.test.tsx`:
  - in the `/rec-roi portfolio page` describe:
    ```tsx
    it('links to the portfolio investor report', () => {
      renderPage();
      expect(screen.getByRole('link', { name: /ดาวน์โหลดรายงานนักลงทุน/ })).toHaveAttribute('href', '/reports/investor');
    });
    ```
  - in the `ProjectDetail — REC ROI tab` describe:
    ```tsx
    it('links to the single-project investor report', () => {
      renderProject('prj-0001', '?tab=rec-roi');
      expect(screen.getByRole('link', { name: /ดาวน์โหลดรายงานนักลงทุน/ })).toHaveAttribute('href', '/reports/investor/prj-0001');
    });
    ```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**
  - `RecRoi.tsx`: import `LinkButton` from `../components/ui/Button` and `FileDown` from `lucide-react`; on the non-verifier `PageHeader` add `action={<LinkButton to="/reports/investor" variant="secondary"><FileDown size={16} /> ดาวน์โหลดรายงานนักลงทุน</LinkButton>}`.
  - `RecRoiDetail.tsx`: in the main return (after the early returns, so only eligible projects with data get it) put a right-aligned row above the summary section: `<div className="flex justify-end"><LinkButton to={`/reports/investor/${projectId}`} variant="secondary" size="sm"><FileDown size={14} /> ดาวน์โหลดรายงานนักลงทุน</LinkButton></div>`.
- [ ] **Step 4: Run** `cd carbon-ready && npx vitest run src/pages/recroi.ui.test.tsx && npx tsc -b` → PASS.
- [ ] **Step 5: Commit** the three files: `feat(report): download buttons on REC ROI pages`.

---

### Task 5: Verification

- [ ] `cd carbon-ready && npm test && npx tsc -b && npx vite build` — all green.
- [ ] Browser (demo mode): sign in as ESG Manager → `/rec-roi` → "ดาวน์โหลดรายงานนักลงทุน" → check the overview + project pages render, A4 width, no overflow; open a project's REC ROI tab → its button → 2 pages; use the browser's print preview to confirm one project page per A4 sheet and colours kept. Enter test assumptions only in demo mode and clear them afterwards.
- [ ] Update memory `project-rec-roi.md` with the investor report (routes, Scope 2 factor file, no registry change).
