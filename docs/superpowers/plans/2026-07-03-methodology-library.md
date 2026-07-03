# Methodology Library (8) + Calc Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the methodology library from 1 to 8 (T-VER ×6, Verra ×1, CDM ×1), make the Stage-B calculation engine dispatch per methodology formula, and seed one fully-filled sample project per methodology — all without touching Hedera.

**Architecture:** Methodologies stay plain data modules ([data/methodology-tver-solar.ts](../../../carbon-ready/src/data/methodology-tver-solar.ts) is the reference). A small `data/methodologies/` folder holds a shared section builder + one file per new methodology + a barrel. `Methodology` gains a `calculation` descriptor; [lib/calc.ts](../../../carbon-ready/src/lib/calc.ts) branches on `calculation.formula` (existing `grid_displacement` path is preserved byte-for-byte to avoid regressions). Seed and persist version are bumped so local stores re-seed.

**Tech Stack:** React 18 + TypeScript, Zustand (persist), Vitest. Pure data + pure functions — no new deps.

**Conventions carried from the spec:** methodology codes/versions are placeholders marked `⚠︎ verify` (confirm against TGO / Verra / UNFCCC before publishing). Non-electricity methodologies store their period driver value in `MonitoringRecord.generation_kwh` interpreted via `calculation.input_unit` (documented, no schema fork). Only the grid family + Solar use auto-calc; complex sectors use `direct_entry`.

---

## File Structure

**Create:**
- `carbon-ready/src/data/methodologies/shared.ts` — `stdAdditionalitySection`, `stdMonitoringSection`, `buildStandardMethodology()` factory.
- `carbon-ready/src/data/methodologies/tver-wind.ts`
- `carbon-ready/src/data/methodologies/tver-biomass.ts`
- `carbon-ready/src/data/methodologies/tver-biogas.ts`
- `carbon-ready/src/data/methodologies/tver-forestry.ts`
- `carbon-ready/src/data/methodologies/tver-waste-lfg.ts`
- `carbon-ready/src/data/methodologies/verra-vm0042.ts`
- `carbon-ready/src/data/methodologies/cdm-ar-acm0003.ts`
- `carbon-ready/src/data/methodologies/index.ts` — barrel exporting `ALL_METHODOLOGIES`.

**Modify:**
- `carbon-ready/src/types/index.ts` — add `Standard`, `CalcFormula`, `MethodologyCalculation`; widen `Methodology.standard`; add `Methodology.calculation`.
- `carbon-ready/src/data/methodology-tver-solar.ts` — add `calculation` field.
- `carbon-ready/src/lib/calc.ts` — dispatch on formula.
- `carbon-ready/src/lib/calc.test.ts` — new formula cases.
- `carbon-ready/src/lib/api.ts:60-75` — `calculate()` resolves methodology and passes `calculation`.
- `carbon-ready/src/data/seed.ts` — new methodologies, projects, PDDs, records.
- `carbon-ready/src/store/index.ts:392` — persist name `v4` → `v5`.

**Do NOT touch:** `lib/pdd.ts` (Solar keeps the only `er_estimate`/`grid_factor` computed fields; new methodologies omit computed fields, so `resolveComputed` needs no new cases).

---

## Task 1: Types — calculation descriptor + widened standard

**Files:**
- Modify: `carbon-ready/src/types/index.ts`
- Modify: `carbon-ready/src/data/methodology-tver-solar.ts`

- [ ] **Step 1: Add the new types above the `Methodology` interface**

In `types/index.ts`, immediately before `export interface Methodology {` (currently line 296), insert:

```ts
export type Standard = 'T-VER' | 'Verra' | 'CDM';

export type CalcFormula =
  | 'grid_displacement'    // ER = Σ(driver_kWh) × grid EF
  | 'biomass_stock_change' // driver already tCO2e/period → Σ driver
  | 'ch4_avoidance'        // ER = Σ(driver_t_CH4) × gwp_ch4
  | 'direct_entry';        // driver already tCO2e/period → Σ driver

export interface MethodologyCalculation {
  formula: CalcFormula;
  input_param: string;   // monitoring_params key carrying the driver value
  input_unit: string;    // 'kWh' | 'tCO2e' | 't CH4'
  gwp_ch4?: number;      // required for ch4_avoidance (e.g. 28)
}
```

- [ ] **Step 2: Widen `Methodology.standard` and add `calculation`**

In the `Methodology` interface, change:

```ts
  standard: 'T-VER';
```
to:
```ts
  standard: Standard;
```
and add, right after the `status` line:
```ts
  calculation: MethodologyCalculation;
```

- [ ] **Step 3: Add `calculation` to the Solar methodology**

In `data/methodology-tver-solar.ts`, inside the `TVER_SOLAR_METHODOLOGY` object, add after the `status: 'active',` line:

```ts
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
```

- [ ] **Step 4: Typecheck**

Run: `cd carbon-ready && npx tsc -b --noEmit`
Expected: PASS (no errors). If errors mention other methodology files, they don't exist yet — that's fine, none reference these types until later tasks.

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/types/index.ts carbon-ready/src/data/methodology-tver-solar.ts
git commit -m "feat(types): methodology calculation descriptor + widened standard"
```

---

## Task 2: Calc engine — dispatch on formula (TDD)

**Files:**
- Modify: `carbon-ready/src/lib/calc.ts`
- Test: `carbon-ready/src/lib/calc.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/calc.test.ts` (keep all existing tests untouched):

```ts
import type { MethodologyCalculation, MonitoringRecord } from '../types';

const rec = (date: string, driver: number): MonitoringRecord => ({
  id: `m-${date}`, project_id: 'p1', record_date: date,
  generation_kwh: driver, source: 'seed', uploaded_at: '2026-01-01T00:00:00Z',
});

describe('calculateCarbon — formula dispatch', () => {
  it('biomass_stock_change sums the driver as tCO2e', () => {
    const calc: MethodologyCalculation = { formula: 'biomass_stock_change', input_param: 'dC', input_unit: 'tCO2e' };
    const out = calculateCarbon([rec('2026-01-01', 10), rec('2026-02-01', 20)], [], undefined, calc);
    expect(out.emission_factor_id).toBeNull();
    expect(out.totals.reduction_tco2e).toBe(30);
    expect(out.totals.reduction_kgco2e).toBe(30000);
  });

  it('direct_entry sums the driver as tCO2e', () => {
    const calc: MethodologyCalculation = { formula: 'direct_entry', input_param: 'ER', input_unit: 'tCO2e' };
    const out = calculateCarbon([rec('2026-01-01', 5), rec('2026-02-01', 5)], [], undefined, calc);
    expect(out.totals.reduction_tco2e).toBe(10);
  });

  it('ch4_avoidance multiplies the driver by GWP', () => {
    const calc: MethodologyCalculation = { formula: 'ch4_avoidance', input_param: 'CH4', input_unit: 't CH4', gwp_ch4: 28 };
    const out = calculateCarbon([rec('2026-01-01', 1), rec('2026-02-01', 2)], [], undefined, calc);
    expect(out.totals.reduction_tco2e).toBe(84);
  });

  it('grid_displacement (default, no calc arg) is unchanged', () => {
    const factors = [{ id: 'ef1', country: 'TH', source: 'EGAT', factor_kgco2e_per_kwh: 0.5, effective_date: '2025-01-01', version: 1, is_current: true, created_at: '2025-01-01T00:00:00Z' }];
    const out = calculateCarbon([rec('2026-01-01', 1000)], factors, undefined);
    expect(out.emission_factor_id).toBe('ef1');
    expect(out.totals.reduction_kgco2e).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd carbon-ready && npx vitest run src/lib/calc.test.ts`
Expected: the three new formula cases FAIL (extra 4th arg ignored → non-grid records get treated as grid and skipped for lack of factors, so totals are 0). The `grid_displacement` case passes.

- [ ] **Step 3: Refactor `calculateCarbon` to dispatch**

In `lib/calc.ts`, change the import line to add the type:

```ts
import type { EmissionFactor, MonitoringRecord, MethodologyCalculation } from '../types';
```

Rename the existing `export function calculateCarbon(...) {...}` body to a private `calculateGrid`, and add a dispatcher + a direct aggregator. Replace lines 23-72 (the whole current `calculateCarbon`) with:

```ts
export function calculateCarbon(
  records: MonitoringRecord[],
  factors: EmissionFactor[],
  range?: { from?: string; to?: string },
  calculation?: MethodologyCalculation
): CalculationOutput {
  const formula = calculation?.formula ?? 'grid_displacement';
  if (formula === 'grid_displacement') return calculateGrid(records, factors, range);
  return calculateDirect(records, range, formula, calculation);
}

function calculateGrid(
  records: MonitoringRecord[],
  factors: EmissionFactor[],
  range?: { from?: string; to?: string }
): CalculationOutput {
  const daily: CalculationOutput['daily'] = [];

  for (const r of records) {
    if (range?.from && r.record_date < range.from) continue;
    if (range?.to   && r.record_date > range.to)   continue;
    const factor = pickFactorForDate(factors, r.record_date);
    if (!factor) continue;
    daily.push({
      date: r.record_date,
      generation_kwh: r.generation_kwh,
      reduction_kgco2e: round3(r.generation_kwh * factor.factor_kgco2e_per_kwh),
      emission_factor_id: factor.id,
    });
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));
  const emission_factor_id = daily.length > 0 ? daily[daily.length - 1].emission_factor_id : null;
  return assemble(daily, emission_factor_id);
}

function calculateDirect(
  records: MonitoringRecord[],
  range: { from?: string; to?: string } | undefined,
  formula: MethodologyCalculation['formula'],
  calculation?: MethodologyCalculation
): CalculationOutput {
  const gwp = calculation?.gwp_ch4 ?? 28;
  const toKg = (driver: number) =>
    formula === 'ch4_avoidance' ? driver * gwp * 1000 : driver * 1000;

  const daily: CalculationOutput['daily'] = [];
  for (const r of records) {
    if (range?.from && r.record_date < range.from) continue;
    if (range?.to   && r.record_date > range.to)   continue;
    daily.push({
      date: r.record_date,
      generation_kwh: r.generation_kwh,
      reduction_kgco2e: round3(toKg(r.generation_kwh)),
      emission_factor_id: '',
    });
  }
  daily.sort((a, b) => a.date.localeCompare(b.date));
  return assemble(daily, null);
}

function assemble(
  daily: CalculationOutput['daily'],
  emission_factor_id: string | null
): CalculationOutput {
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
    emission_factor_id,
    totals: {
      generation_kwh: round3(totalGen),
      reduction_kgco2e: round3(totalRed),
      reduction_tco2e: round3(totalRed / 1000),
    },
    daily,
    monthly,
  };
}
```

Leave `pickFactorForDate`, `round3`, `round3Obj`, and the `CalculationOutput` interface exactly as they are.

- [ ] **Step 4: Run the full calc suite**

Run: `cd carbon-ready && npx vitest run src/lib/calc.test.ts`
Expected: PASS (all old + 4 new cases).

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/lib/calc.ts carbon-ready/src/lib/calc.test.ts
git commit -m "feat(calc): dispatch reduction formula per methodology"
```

---

## Task 3: API — calculate() passes the methodology's calculation

**Files:**
- Modify: `carbon-ready/src/lib/api.ts:60-75`

- [ ] **Step 1: Resolve methodology and pass calculation**

Replace the body of `async calculate(project_id, range?)` (lines 60-75) with:

```ts
  async calculate(project_id: UUID, range?: { from?: string; to?: string }) {
    const state = useStore.getState();
    const project = state.projects.find((p) => p.id === project_id);
    if (!project) throw new Error('Project not found');
    const pdd = state.pddByProject(project_id);
    const methodology = state.methodologies.find((m) => m.id === pdd?.methodology_id);
    const calculation = methodology?.calculation;
    const country = locationToCountryCode(project.location.split(',').pop()?.trim() ?? '');
    const factors = state.factors.filter((f) => f.country === country);
    const records = state.records.filter((r) => r.project_id === project_id);
    const result = calculateCarbon(records, factors, range, calculation);
    state.audit_write('CALCULATION_EXECUTED', 'calculation', project_id, {
      emission_factor_id: result.emission_factor_id,
      generation_kwh: result.totals.generation_kwh,
      reduction_kgco2e: result.totals.reduction_kgco2e,
    });
    toast.success('Calculation complete', `${formatNumber(result.totals.reduction_tco2e, 2)} tCO₂e reduction`);
    return tick(result);
  },
```

(`pddByProject` is already exposed on the store state — see `store/index.ts:275`.)

- [ ] **Step 2: Typecheck**

Run: `cd carbon-ready && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add carbon-ready/src/lib/api.ts
git commit -m "feat(api): calculate() dispatches via project methodology"
```

---

## Task 4: Shared methodology builder

**Files:**
- Create: `carbon-ready/src/data/methodologies/shared.ts`

- [ ] **Step 1: Write the builder**

```ts
import type {
  Methodology, PddSectionSchema, PddFieldSchema, MethodologyCalculation,
  EvidenceCategory, MonitoringParam, Standard,
} from '../../types';

// Additionality (section C) is near-identical across methodologies — share it.
export const stdAdditionalitySection: PddSectionSchema = {
  key: 'additionality',
  title: 'C. Additionality / ความเพิ่มเติม',
  fields: [
    { key: 'barrier_type', label: 'Primary barrier', type: 'select', options: ['Investment', 'Technological', 'Institutional'], required: true },
    { key: 'investment_metric', label: 'Investment metric used', type: 'select', options: ['IRR', 'NPV', 'LCOE'], required: true, showIf: { field: 'barrier_type', equals: 'Investment' } },
    { key: 'barrier_explanation', label: 'Barrier analysis', type: 'textarea', required: true, help: 'Explain why the project is not the baseline / business-as-usual.' },
    { key: 'common_practice', label: 'Not common practice in the region', type: 'boolean', required: true },
  ],
};

// Monitoring plan (section E) — parametrised by the monitored parameter label.
export function stdMonitoringSection(monitoredParamHelp: string): PddSectionSchema {
  return {
    key: 'monitoring_plan',
    title: 'E. Monitoring plan / แผนการติดตาม',
    fields: [
      { key: 'monitored_parameter', label: 'Monitored parameter', type: 'text', required: true, help: monitoredParamHelp },
      { key: 'measurement_method', label: 'Measurement method', type: 'text', required: true },
      { key: 'monitoring_frequency', label: 'Frequency', type: 'select', options: ['Continuous', 'Monthly', 'Quarterly', 'Annually'], required: true },
      { key: 'qaqc_procedure', label: 'QA/QC procedure', type: 'textarea', required: true },
    ],
  };
}

export interface MethodologyConfig {
  id: string;
  code: string;                 // ⚠︎ verify against the registry
  name: string;
  standard: Standard;
  version: string;
  sectoral_scope: string;
  calculation: MethodologyCalculation;
  required_evidence: EvidenceCategory[];
  monitoring_params: MonitoringParam[];
  /** Section A fields AFTER the two shared computed fields (location, commission_date). */
  projectFields: PddFieldSchema[];
  /** Section B baseline scenario options. */
  baselineOptions: string[];
  /** Section D fields (ex-ante estimate as plain inputs — no computed). */
  ghgFields: PddFieldSchema[];
  monitoredParamHelp: string;
}

// Assembles the standard A–E PDD for a non-Solar methodology.
export function buildStandardMethodology(c: MethodologyConfig): Methodology {
  const projectInfo: PddSectionSchema = {
    key: 'project_info',
    title: 'A. Project description / ข้อมูลโครงการ',
    help: 'Core project identity. Location and commissioning date are pulled from the project record.',
    fields: [
      { key: 'project_location', label: 'Location', type: 'computed', source: 'project_location', required: false },
      { key: 'commission_date', label: 'Commissioning date', type: 'computed', source: 'commission_date', required: false },
      ...c.projectFields,
    ],
  };
  const baseline: PddSectionSchema = {
    key: 'baseline',
    title: 'B. Baseline & methodology / เส้นฐาน',
    fields: [
      { key: 'baseline_scenario', label: 'Baseline scenario', type: 'select', options: c.baselineOptions, required: true },
    ],
  };
  const ghg: PddSectionSchema = {
    key: 'ghg_reduction',
    title: 'D. GHG emission reduction (ex-ante) / การลดก๊าซเรือนกระจก',
    help: 'Ex-ante estimate entered by the proponent and checked by the validator.',
    fields: c.ghgFields,
  };
  return {
    id: c.id, code: c.code, name: c.name, standard: c.standard, version: c.version,
    sectoral_scope: c.sectoral_scope, status: 'active', calculation: c.calculation,
    required_evidence: c.required_evidence, monitoring_params: c.monitoring_params,
    pdd_sections: [projectInfo, baseline, stdAdditionalitySection, ghg, stdMonitoringSection(c.monitoredParamHelp)],
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd carbon-ready && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add carbon-ready/src/data/methodologies/shared.ts
git commit -m "feat(data): shared PDD section builder for methodologies"
```

---

## Task 5: T-VER grid family (wind, biomass, biogas)

**Files:**
- Create: `carbon-ready/src/data/methodologies/tver-wind.ts`
- Create: `carbon-ready/src/data/methodologies/tver-biomass.ts`
- Create: `carbon-ready/src/data/methodologies/tver-biogas.ts`

All three reuse `grid_displacement`. `input_param` is the kWh-to-grid meter.

- [ ] **Step 1: Wind — `tver-wind.ts`**

```ts
import { buildStandardMethodology } from './shared';

export const TVER_WIND_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-wind',
  code: 'T-VER-S-02', // ⚠︎ verify against TGO registry
  name: 'การผลิตพลังงานไฟฟ้าจากพลังงานลม (Grid-connected Wind)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Energy industries (renewable/non-renewable sources)',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['commissioning_report', 'site_photo', 'supporting_evidence'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity supplied to the grid', unit: 'kWh', method: 'Revenue-grade bi-directional meter', frequency: 'Monthly' },
    { key: 'EF_grid', label: 'Grid emission factor', unit: 'kgCO₂e/kWh', method: 'Official EGAT/TGO published factor', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'turbine_count', label: 'Number of turbines', type: 'number', required: true },
    { key: 'rated_capacity_mw', label: 'Rated capacity', type: 'number', unit: 'MW', required: true },
    { key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true },
  ],
  baselineOptions: ['Grid electricity displaced by wind generation'],
  ghgFields: [
    { key: 'capacity_factor', label: 'Expected capacity factor', type: 'number', required: true, help: 'Typical onshore wind ≈ 0.25–0.40.' },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'EG_PJ — net electricity to grid.',
});
```

- [ ] **Step 2: Biomass — `tver-biomass.ts`**

```ts
import { buildStandardMethodology } from './shared';

export const TVER_BIOMASS_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-biomass',
  code: 'T-VER-S-03', // ⚠︎ verify
  name: 'การผลิตไฟฟ้าจากชีวมวล (Grid-connected Biomass Power)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Energy industries (renewable/non-renewable sources)',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['commissioning_report', 'supporting_evidence', 'maintenance_report'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity supplied to the grid', unit: 'kWh', method: 'Revenue-grade bi-directional meter', frequency: 'Monthly' },
    { key: 'M_biomass', label: 'Biomass consumed', unit: 'tonnes', method: 'Weighbridge log', frequency: 'Monthly' },
  ],
  projectFields: [
    { key: 'feedstock_type', label: 'Biomass feedstock', type: 'select', options: ['Rice husk', 'Bagasse', 'Wood chips', 'Palm residue'], required: true },
    { key: 'sustainable_sourcing', label: 'Feedstock is sustainably sourced', type: 'boolean', required: true },
    { key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true },
  ],
  baselineOptions: ['Grid electricity displaced by biomass generation'],
  ghgFields: [
    { key: 'plant_load_factor', label: 'Plant load factor', type: 'number', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'EG_PJ — net electricity to grid.',
});
```

- [ ] **Step 3: Biogas-to-power — `tver-biogas.ts`**

```ts
import { buildStandardMethodology } from './shared';

export const TVER_BIOGAS_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-biogas',
  code: 'T-VER-S-04', // ⚠︎ verify
  name: 'การผลิตไฟฟ้าจากก๊าซชีวภาพ (Biogas-to-power)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Energy industries (renewable/non-renewable sources)',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
  required_evidence: ['commissioning_report', 'supporting_evidence', 'maintenance_report'],
  monitoring_params: [
    { key: 'EG_PJ', label: 'Net electricity supplied to the grid', unit: 'kWh', method: 'Revenue-grade bi-directional meter', frequency: 'Monthly' },
    { key: 'V_biogas', label: 'Biogas captured', unit: 'm³', method: 'Gas flow meter', frequency: 'Continuous' },
  ],
  projectFields: [
    { key: 'substrate', label: 'Substrate source', type: 'select', options: ['Livestock manure', 'Wastewater', 'Food waste'], required: true },
    { key: 'digester_type', label: 'Digester type', type: 'select', options: ['Covered lagoon', 'CSTR', 'UASB'], required: true },
    { key: 'grid_connection', label: 'Grid connection', type: 'select', options: ['Grid-connected', 'Off-grid'], required: true },
  ],
  baselineOptions: ['Grid electricity displaced by biogas generation', 'Fossil fuel displaced by biogas'],
  ghgFields: [
    { key: 'capture_efficiency', label: 'Methane capture efficiency', type: 'number', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'EG_PJ — net electricity to grid.',
});
```

- [ ] **Step 4: Typecheck**

Run: `cd carbon-ready && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add carbon-ready/src/data/methodologies/tver-wind.ts carbon-ready/src/data/methodologies/tver-biomass.ts carbon-ready/src/data/methodologies/tver-biogas.ts
git commit -m "feat(data): T-VER wind, biomass, biogas methodologies"
```

---

## Task 6: T-VER cross-sector (forestry, waste/LFG)

**Files:**
- Create: `carbon-ready/src/data/methodologies/tver-forestry.ts`
- Create: `carbon-ready/src/data/methodologies/tver-waste-lfg.ts`

- [ ] **Step 1: Forestry (A/R) — `tver-forestry.ts`** (`biomass_stock_change`)

```ts
import { buildStandardMethodology } from './shared';

export const TVER_FORESTRY_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-forestry',
  code: 'T-VER-F-01', // ⚠︎ verify
  name: 'การปลูกป่าและฟื้นฟูป่า (Afforestation / Reforestation)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Agriculture, Forestry and Other Land Use (AFOLU)',
  calculation: { formula: 'biomass_stock_change', input_param: 'dC_tree', input_unit: 'tCO2e' },
  required_evidence: ['site_photo', 'supporting_evidence', 'commissioning_report'],
  monitoring_params: [
    { key: 'dC_tree', label: 'Change in tree carbon stock', unit: 'tCO₂e', method: 'Sample plot biomass survey + allometric equations', frequency: 'Annually' },
    { key: 'A_planted', label: 'Planted area', unit: 'hectares', method: 'GPS boundary survey', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'area_hectares', label: 'Project area', type: 'number', unit: 'ha', required: true },
    { key: 'species', label: 'Dominant species', type: 'text', required: true },
    { key: 'land_eligibility', label: 'Land was non-forest at project start', type: 'boolean', required: true },
  ],
  baselineOptions: ['Degraded / non-forest land with no regeneration'],
  ghgFields: [
    { key: 'growth_rate', label: 'Expected annual carbon accumulation', type: 'number', unit: 'tCO₂e/ha/yr', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'dC_tree — annual change in tree carbon stock (already in tCO₂e).',
});
```

- [ ] **Step 2: Waste / landfill gas — `tver-waste-lfg.ts`** (`ch4_avoidance`)

```ts
import { buildStandardMethodology } from './shared';

export const TVER_WASTE_LFG_METHODOLOGY = buildStandardMethodology({
  id: 'meth-tver-waste-lfg',
  code: 'T-VER-W-01', // ⚠︎ verify
  name: 'การจัดการของเสียและการดักจับก๊าซจากหลุมฝังกลบ (Landfill Gas Capture)',
  standard: 'T-VER',
  version: 'v1.0', // ⚠︎ verify
  sectoral_scope: 'Waste handling and disposal',
  calculation: { formula: 'ch4_avoidance', input_param: 'M_CH4', input_unit: 't CH4', gwp_ch4: 28 },
  required_evidence: ['commissioning_report', 'supporting_evidence', 'maintenance_report'],
  monitoring_params: [
    { key: 'M_CH4', label: 'Methane captured & destroyed', unit: 't CH4', method: 'Flow meter × CH₄ fraction × density', frequency: 'Continuous' },
    { key: 'flare_uptime', label: 'Flare/engine uptime', unit: '%', method: 'SCADA log', frequency: 'Monthly' },
  ],
  projectFields: [
    { key: 'destruction_device', label: 'Destruction device', type: 'select', options: ['Enclosed flare', 'Open flare', 'Gas engine'], required: true },
    { key: 'site_type', label: 'Site type', type: 'select', options: ['Municipal landfill', 'Industrial wastewater', 'Composting'], required: true },
    { key: 'baseline_flaring', label: 'No methane capture in baseline', type: 'boolean', required: true },
  ],
  baselineOptions: ['Uncontrolled methane emission to atmosphere'],
  ghgFields: [
    { key: 'collection_efficiency', label: 'Gas collection efficiency', type: 'number', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'M_CH4 — tonnes of methane captured and destroyed.',
});
```

- [ ] **Step 3: Typecheck**

Run: `cd carbon-ready && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add carbon-ready/src/data/methodologies/tver-forestry.ts carbon-ready/src/data/methodologies/tver-waste-lfg.ts
git commit -m "feat(data): T-VER forestry (A/R) and landfill-gas methodologies"
```

---

## Task 7: Guardian library — Verra VM0042, CDM AR-ACM0003

**Files:**
- Create: `carbon-ready/src/data/methodologies/verra-vm0042.ts`
- Create: `carbon-ready/src/data/methodologies/cdm-ar-acm0003.ts`

- [ ] **Step 1: Verra VM0042 — `verra-vm0042.ts`** (`direct_entry`)

```ts
import { buildStandardMethodology } from './shared';

export const VERRA_VM0042_METHODOLOGY = buildStandardMethodology({
  id: 'meth-verra-vm0042',
  code: 'VM0042', // ⚠︎ verify version against Verra Project Hub
  name: 'VM0042 Improved Agricultural Land Management',
  standard: 'Verra',
  version: 'v2.1', // ⚠︎ verify
  sectoral_scope: 'Agriculture, Forestry and Other Land Use (AFOLU)',
  calculation: { formula: 'direct_entry', input_param: 'ER_soc', input_unit: 'tCO2e' },
  required_evidence: ['supporting_evidence', 'site_photo', 'commissioning_report'],
  monitoring_params: [
    { key: 'ER_soc', label: 'Net emission reduction (SOC + N₂O + CH₄)', unit: 'tCO₂e', method: 'Soil sampling + model per VM0042', frequency: 'Annually' },
    { key: 'A_project', label: 'Project area under practice', unit: 'hectares', method: 'GIS boundary', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'practice_change', label: 'ALM practice adopted', type: 'select', options: ['Reduced tillage', 'Cover cropping', 'Nutrient management', 'Improved grazing'], required: true },
    { key: 'crop_type', label: 'Primary crop', type: 'text', required: true },
    { key: 'quantification_approach', label: 'Quantification approach', type: 'select', options: ['Measurement (soil sampling)', 'Modeling', 'Hybrid'], required: true },
  ],
  baselineOptions: ['Conventional land management (business-as-usual practice)'],
  ghgFields: [
    { key: 'soc_uncertainty', label: 'SOC uncertainty deduction', type: 'number', unit: '%', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual reduction', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'ER_soc — net reduction in tCO₂e, entered per verification period.',
});
```

- [ ] **Step 2: CDM AR-ACM0003 — `cdm-ar-acm0003.ts`** (`biomass_stock_change`)

```ts
import { buildStandardMethodology } from './shared';

export const CDM_ARACM0003_METHODOLOGY = buildStandardMethodology({
  id: 'meth-cdm-aracm0003',
  code: 'AR-ACM0003', // ⚠︎ verify version against UNFCCC CDM
  name: 'AR-ACM0003 Afforestation & Reforestation of Lands',
  standard: 'CDM',
  version: 'v2.0', // ⚠︎ verify
  sectoral_scope: 'Afforestation and reforestation',
  calculation: { formula: 'biomass_stock_change', input_param: 'dC_actual', input_unit: 'tCO2e' },
  required_evidence: ['site_photo', 'supporting_evidence', 'commissioning_report'],
  monitoring_params: [
    { key: 'dC_actual', label: 'Actual net GHG removals by sinks', unit: 'tCO₂e', method: 'Permanent sample plots + allometric models', frequency: 'Annually' },
    { key: 'A_planted', label: 'Afforested area', unit: 'hectares', method: 'Stratified boundary survey', frequency: 'Annually' },
  ],
  projectFields: [
    { key: 'area_hectares', label: 'Project area', type: 'number', unit: 'ha', required: true },
    { key: 'strata_count', label: 'Number of strata', type: 'number', required: true },
    { key: 'land_eligibility', label: 'Land eligible (non-forest since 31 Dec 1989)', type: 'boolean', required: true },
  ],
  baselineOptions: ['Pre-project degraded land with negligible woody biomass'],
  ghgFields: [
    { key: 'leakage_estimate', label: 'Estimated leakage', type: 'number', unit: 'tCO₂e/yr', required: true },
    { key: 'annual_er_estimate', label: 'Estimated annual net removal', type: 'number', unit: 'tCO₂e/yr', required: true },
  ],
  monitoredParamHelp: 'dC_actual — annual net GHG removals (already in tCO₂e).',
});
```

- [ ] **Step 3: Typecheck**

Run: `cd carbon-ready && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add carbon-ready/src/data/methodologies/verra-vm0042.ts carbon-ready/src/data/methodologies/cdm-ar-acm0003.ts
git commit -m "feat(data): Verra VM0042 and CDM AR-ACM0003 methodologies"
```

---

## Task 8: Barrel + wire into seed

**Files:**
- Create: `carbon-ready/src/data/methodologies/index.ts`
- Modify: `carbon-ready/src/data/seed.ts:8,38`

- [ ] **Step 1: Barrel**

Create `carbon-ready/src/data/methodologies/index.ts`:

```ts
import type { Methodology } from '../../types';
import { TVER_SOLAR_METHODOLOGY } from '../methodology-tver-solar';
import { TVER_WIND_METHODOLOGY } from './tver-wind';
import { TVER_BIOMASS_METHODOLOGY } from './tver-biomass';
import { TVER_BIOGAS_METHODOLOGY } from './tver-biogas';
import { TVER_FORESTRY_METHODOLOGY } from './tver-forestry';
import { TVER_WASTE_LFG_METHODOLOGY } from './tver-waste-lfg';
import { VERRA_VM0042_METHODOLOGY } from './verra-vm0042';
import { CDM_ARACM0003_METHODOLOGY } from './cdm-ar-acm0003';

export const ALL_METHODOLOGIES: Methodology[] = [
  TVER_SOLAR_METHODOLOGY,
  TVER_WIND_METHODOLOGY,
  TVER_BIOMASS_METHODOLOGY,
  TVER_BIOGAS_METHODOLOGY,
  TVER_FORESTRY_METHODOLOGY,
  TVER_WASTE_LFG_METHODOLOGY,
  VERRA_VM0042_METHODOLOGY,
  CDM_ARACM0003_METHODOLOGY,
];
```

- [ ] **Step 2: Point seed at the barrel**

In `data/seed.ts`, change the import on line 8:

```ts
import { TVER_SOLAR_METHODOLOGY } from './methodology-tver-solar';
```
to:
```ts
import { TVER_SOLAR_METHODOLOGY } from './methodology-tver-solar';
import { ALL_METHODOLOGIES } from './methodologies';
```

and change line 38:

```ts
export const seedMethodologies: Methodology[] = [TVER_SOLAR_METHODOLOGY];
```
to:
```ts
export const seedMethodologies: Methodology[] = ALL_METHODOLOGIES;
```

(`TVER_SOLAR_METHODOLOGY` is still imported — it is referenced by the existing seed PDDs below.)

- [ ] **Step 3: Typecheck + existing tests**

Run: `cd carbon-ready && npx tsc -b --noEmit && npx vitest run`
Expected: PASS. All 8 methodologies now load in the store.

- [ ] **Step 4: Commit**

```bash
git add carbon-ready/src/data/methodologies/index.ts carbon-ready/src/data/seed.ts
git commit -m "feat(data): register all 8 methodologies in seed"
```

---

## Task 9: Seed one filled sample project per new methodology

**Files:**
- Modify: `carbon-ready/src/data/seed.ts`

Seven new registered projects (`prj-1001`..`prj-1007`), one PDD each with every required field filled, and a handful of monitoring records so Stage-B calc returns non-zero. Records carry the driver value in `generation_kwh` per the spec's repurpose rule.

- [ ] **Step 1: Append new projects to `seedProjects`**

Add these entries inside the `seedProjects` array (after `prj-0004`, before the closing `]`):

```ts
  { id: 'prj-1001', organization_id: seedOrg.id, name: 'Korat Wind Farm',          location: 'Nakhon Ratchasima, Thailand', capacity_kwp: 45000, commission_date: '2025-06-01', status: 'active', lifecycle_stage: 'registered', created_at: '2025-06-01T00:00:00Z', updated_at: '2025-06-01T00:00:00Z' },
  { id: 'prj-1002', organization_id: seedOrg.id, name: 'Surin Rice-Husk Power',     location: 'Surin, Thailand',             capacity_kwp: 9900,  commission_date: '2025-02-01', status: 'active', lifecycle_stage: 'registered', created_at: '2025-02-01T00:00:00Z', updated_at: '2025-02-01T00:00:00Z' },
  { id: 'prj-1003', organization_id: seedOrg.id, name: 'Chonburi Pig-Farm Biogas',  location: 'Chonburi, Thailand',          capacity_kwp: 1200,  commission_date: '2025-04-01', status: 'active', lifecycle_stage: 'registered', created_at: '2025-04-01T00:00:00Z', updated_at: '2025-04-01T00:00:00Z' },
  { id: 'prj-1004', organization_id: seedOrg.id, name: 'Nan Watershed Reforestation', location: 'Nan, Thailand',             capacity_kwp: 0,     commission_date: '2024-07-01', status: 'active', lifecycle_stage: 'registered', created_at: '2024-07-01T00:00:00Z', updated_at: '2024-07-01T00:00:00Z' },
  { id: 'prj-1005', organization_id: seedOrg.id, name: 'Rayong Landfill Gas',       location: 'Rayong, Thailand',            capacity_kwp: 0,     commission_date: '2025-01-15', status: 'active', lifecycle_stage: 'registered', created_at: '2025-01-15T00:00:00Z', updated_at: '2025-01-15T00:00:00Z' },
  { id: 'prj-1006', organization_id: seedOrg.id, name: 'Ubon Regenerative Rice',    location: 'Ubon Ratchathani, Thailand',  capacity_kwp: 0,     commission_date: '2025-05-01', status: 'active', lifecycle_stage: 'registered', created_at: '2025-05-01T00:00:00Z', updated_at: '2025-05-01T00:00:00Z' },
  { id: 'prj-1007', organization_id: seedOrg.id, name: 'Loei Reforestation (CDM)',  location: 'Loei, Thailand',              capacity_kwp: 0,     commission_date: '2024-03-01', status: 'active', lifecycle_stage: 'registered', created_at: '2024-03-01T00:00:00Z', updated_at: '2024-03-01T00:00:00Z' },
```

- [ ] **Step 2: Add the imports for the new methodology IDs**

At the top of `seed.ts`, below the existing `ALL_METHODOLOGIES` import (added in Task 8), add:

```ts
import {
  TVER_WIND_METHODOLOGY, TVER_BIOMASS_METHODOLOGY, TVER_BIOGAS_METHODOLOGY,
  TVER_FORESTRY_METHODOLOGY, TVER_WASTE_LFG_METHODOLOGY,
  VERRA_VM0042_METHODOLOGY, CDM_ARACM0003_METHODOLOGY,
} from './methodologies';
```

- [ ] **Step 3: Append filled PDDs to `seedPdds`**

Add inside the `seedPdds` array (after `PDD-2003`, before the closing `]`). Every field marked `required` in each methodology is present:

```ts
  {
    id: 'PDD-2100', project_id: 'prj-1001', methodology_id: TVER_WIND_METHODOLOGY.id,
    methodology_snapshot: `${TVER_WIND_METHODOLOGY.code} ${TVER_WIND_METHODOLOGY.version}`, state: 'registered',
    section_data: { turbine_count: 15, rated_capacity_mw: 45, grid_connection: 'Grid-connected', baseline_scenario: 'Grid electricity displaced by wind generation', barrier_type: 'Investment', investment_metric: 'IRR', barrier_explanation: 'Wind IRR without carbon revenue below hurdle rate.', common_practice: true, capacity_factor: 0.32, annual_er_estimate: 64000, monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter', monitoring_frequency: 'Monthly', qaqc_procedure: 'Monthly meter reads cross-checked with grid operator settlement.' },
    evidence_ids: [], assigned_validator_name: VALIDATOR, submitted_at: '2025-06-02T00:00:00Z', validated_at: '2025-06-08T00:00:00Z', content_hash: shortHash('PDD-2100-registered'),
  },
  {
    id: 'PDD-2101', project_id: 'prj-1002', methodology_id: TVER_BIOMASS_METHODOLOGY.id,
    methodology_snapshot: `${TVER_BIOMASS_METHODOLOGY.code} ${TVER_BIOMASS_METHODOLOGY.version}`, state: 'registered',
    section_data: { feedstock_type: 'Rice husk', sustainable_sourcing: true, grid_connection: 'Grid-connected', baseline_scenario: 'Grid electricity displaced by biomass generation', barrier_type: 'Investment', investment_metric: 'NPV', barrier_explanation: 'Fuel logistics raise costs above grid parity.', common_practice: false, plant_load_factor: 0.75, annual_er_estimate: 38000, monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter', monitoring_frequency: 'Monthly', qaqc_procedure: 'Meter reads reconciled with weighbridge fuel logs.' },
    evidence_ids: [], assigned_validator_name: VALIDATOR, submitted_at: '2025-02-03T00:00:00Z', validated_at: '2025-02-10T00:00:00Z', content_hash: shortHash('PDD-2101-registered'),
  },
  {
    id: 'PDD-2102', project_id: 'prj-1003', methodology_id: TVER_BIOGAS_METHODOLOGY.id,
    methodology_snapshot: `${TVER_BIOGAS_METHODOLOGY.code} ${TVER_BIOGAS_METHODOLOGY.version}`, state: 'registered',
    section_data: { substrate: 'Livestock manure', digester_type: 'Covered lagoon', grid_connection: 'Grid-connected', baseline_scenario: 'Fossil fuel displaced by biogas', barrier_type: 'Technological', barrier_explanation: 'Digester tech uncommon among regional farms.', common_practice: false, capture_efficiency: 0.85, annual_er_estimate: 9000, monitored_parameter: 'EG_PJ', measurement_method: 'Revenue-grade bi-directional meter', monitoring_frequency: 'Monthly', qaqc_procedure: 'Gas flow cross-checked with generator output.' },
    evidence_ids: [], assigned_validator_name: VALIDATOR, submitted_at: '2025-04-02T00:00:00Z', validated_at: '2025-04-09T00:00:00Z', content_hash: shortHash('PDD-2102-registered'),
  },
  {
    id: 'PDD-2103', project_id: 'prj-1004', methodology_id: TVER_FORESTRY_METHODOLOGY.id,
    methodology_snapshot: `${TVER_FORESTRY_METHODOLOGY.code} ${TVER_FORESTRY_METHODOLOGY.version}`, state: 'registered',
    section_data: { area_hectares: 1200, species: 'Dipterocarpus alatus', land_eligibility: true, baseline_scenario: 'Degraded / non-forest land with no regeneration', barrier_type: 'Institutional', barrier_explanation: 'No funding pathway absent carbon finance.', common_practice: false, growth_rate: 8, annual_er_estimate: 9600, monitored_parameter: 'dC_tree', measurement_method: 'Sample plot survey + allometric equations', monitoring_frequency: 'Annually', qaqc_procedure: 'Independent re-measurement of 10% of plots.' },
    evidence_ids: [], assigned_validator_name: VALIDATOR, submitted_at: '2024-07-02T00:00:00Z', validated_at: '2024-07-20T00:00:00Z', content_hash: shortHash('PDD-2103-registered'),
  },
  {
    id: 'PDD-2104', project_id: 'prj-1005', methodology_id: TVER_WASTE_LFG_METHODOLOGY.id,
    methodology_snapshot: `${TVER_WASTE_LFG_METHODOLOGY.code} ${TVER_WASTE_LFG_METHODOLOGY.version}`, state: 'registered',
    section_data: { destruction_device: 'Enclosed flare', site_type: 'Municipal landfill', baseline_flaring: true, baseline_scenario: 'Uncontrolled methane emission to atmosphere', barrier_type: 'Investment', investment_metric: 'IRR', barrier_explanation: 'Capture infrastructure not viable on tipping fees alone.', common_practice: false, collection_efficiency: 0.75, annual_er_estimate: 42000, monitored_parameter: 'M_CH4', measurement_method: 'Flow meter × CH₄ fraction × density', monitoring_frequency: 'Continuous', qaqc_procedure: 'Analyzer calibrated monthly; flare uptime logged.' },
    evidence_ids: [], assigned_validator_name: VALIDATOR, submitted_at: '2025-01-16T00:00:00Z', validated_at: '2025-01-25T00:00:00Z', content_hash: shortHash('PDD-2104-registered'),
  },
  {
    id: 'PDD-2105', project_id: 'prj-1006', methodology_id: VERRA_VM0042_METHODOLOGY.id,
    methodology_snapshot: `${VERRA_VM0042_METHODOLOGY.code} ${VERRA_VM0042_METHODOLOGY.version}`, state: 'registered',
    section_data: { practice_change: 'Cover cropping', crop_type: 'Rice', quantification_approach: 'Hybrid', baseline_scenario: 'Conventional land management (business-as-usual practice)', barrier_type: 'Institutional', barrier_explanation: 'Smallholder coordination barrier to practice change.', common_practice: false, soc_uncertainty: 15, annual_er_estimate: 5200, monitored_parameter: 'ER_soc', measurement_method: 'Soil sampling + model per VM0042', monitoring_frequency: 'Annually', qaqc_procedure: 'Lab duplicates on 10% of soil cores.' },
    evidence_ids: [], assigned_validator_name: VALIDATOR, submitted_at: '2025-05-02T00:00:00Z', validated_at: '2025-05-15T00:00:00Z', content_hash: shortHash('PDD-2105-registered'),
  },
  {
    id: 'PDD-2106', project_id: 'prj-1007', methodology_id: CDM_ARACM0003_METHODOLOGY.id,
    methodology_snapshot: `${CDM_ARACM0003_METHODOLOGY.code} ${CDM_ARACM0003_METHODOLOGY.version}`, state: 'registered',
    section_data: { area_hectares: 800, strata_count: 4, land_eligibility: true, baseline_scenario: 'Pre-project degraded land with negligible woody biomass', barrier_type: 'Investment', investment_metric: 'NPV', barrier_explanation: 'Long rotation makes NPV negative without credits.', common_practice: false, leakage_estimate: 300, annual_er_estimate: 7200, monitored_parameter: 'dC_actual', measurement_method: 'Permanent sample plots + allometric models', monitoring_frequency: 'Annually', qaqc_procedure: 'Strata re-survey audited by third party.' },
    evidence_ids: [], assigned_validator_name: VALIDATOR, submitted_at: '2024-03-02T00:00:00Z', validated_at: '2024-03-20T00:00:00Z', content_hash: shortHash('PDD-2106-registered'),
  },
```

- [ ] **Step 4: Add monitoring records for the new projects**

The existing `buildRecords()` (line 105) only generates solar-style daily kWh for active projects using `generationFor`. That would produce meaningless daily driver values for the new methodologies. Instead, add explicit monthly records after the `seedRecords` declaration. Insert immediately after line 125 (`export const seedRecords ...`):

```ts
// Explicit monthly driver records for the non-solar sample projects.
// generation_kwh holds the period driver value in the methodology's input_unit.
const EXTRA_RECORDS: Array<{ project_id: string; unit_hint: string; monthly: number; count: number; start: string }> = [
  { project_id: 'prj-1001', unit_hint: 'kWh',    monthly: 5_400_000, count: 6, start: '2026-01-01' }, // wind → grid_displacement
  { project_id: 'prj-1002', unit_hint: 'kWh',    monthly: 3_200_000, count: 6, start: '2026-01-01' }, // biomass
  { project_id: 'prj-1003', unit_hint: 'kWh',    monthly: 720_000,   count: 6, start: '2026-01-01' }, // biogas
  { project_id: 'prj-1004', unit_hint: 'tCO2e',  monthly: 800,       count: 4, start: '2025-01-01' }, // forestry → biomass_stock_change
  { project_id: 'prj-1005', unit_hint: 't CH4',  monthly: 125,       count: 6, start: '2026-01-01' }, // LFG → ch4_avoidance
  { project_id: 'prj-1006', unit_hint: 'tCO2e',  monthly: 430,       count: 4, start: '2025-01-01' }, // VM0042 → direct_entry
  { project_id: 'prj-1007', unit_hint: 'tCO2e',  monthly: 600,       count: 4, start: '2025-01-01' }, // CDM A/R → biomass_stock_change
];

function buildExtraRecords(): MonitoringRecord[] {
  const out: MonitoringRecord[] = [];
  let counter = 100000;
  for (const spec of EXTRA_RECORDS) {
    const start = new Date(spec.start);
    for (let i = 0; i < spec.count; i++) {
      counter++;
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      out.push({
        id: uid('mon', counter),
        project_id: spec.project_id,
        record_date: d.toISOString().slice(0, 10),
        generation_kwh: spec.monthly,
        source: 'seed_direct',
        uploaded_at: '2026-06-30T00:00:00Z',
      });
    }
  }
  return out;
}
```

(Do NOT export `buildExtraRecords`'s result separately — it is folded into `seedRecords` in the next change.)

Then change line 125 from:
```ts
export const seedRecords: MonitoringRecord[] = buildRecords();
```
to:
```ts
export const seedRecords: MonitoringRecord[] = [...buildRecords(), ...buildExtraRecords()];
```

Final state: `EXTRA_RECORDS` const + `buildExtraRecords()` function + the single combined `seedRecords` export. No separate `seedExtraRecords` symbol anywhere.

- [ ] **Step 5: Typecheck + tests**

Run: `cd carbon-ready && npx tsc -b --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add carbon-ready/src/data/seed.ts
git commit -m "feat(seed): filled sample project + monitoring per new methodology"
```

---

## Task 10: Bump persist version so local stores re-seed

**Files:**
- Modify: `carbon-ready/src/store/index.ts:392`

- [ ] **Step 1: Bump the persist key**

Change line 392 from:
```ts
    { name: 'carbon-ready-store-v4' }
```
to:
```ts
    { name: 'carbon-ready-store-v5' }
```

- [ ] **Step 2: Commit**

```bash
git add carbon-ready/src/store/index.ts
git commit -m "chore(store): bump persist to v5 to re-seed methodology library"
```

---

## Task 11: Registration UI test — parametrize across methodologies

**Files:**
- Modify: `carbon-ready/src/pages/registration.ui.test.tsx`

Prove the PDD form renders and validates per-schema for a non-Solar methodology (not only Solar).

- [ ] **Step 1: Read the existing test to match its harness**

Run: `cd carbon-ready && sed -n '1,60p' src/pages/registration.ui.test.tsx`
Expected: shows how the test renders the registration page / selects a methodology and asserts fields. Note the render helper and query style used.

- [ ] **Step 2: Add a case asserting a cross-sector methodology renders its own fields**

Using the SAME render/query helpers the file already uses, add one test that selects the forestry methodology (`meth-tver-forestry`) and asserts a forestry-specific field label renders and a Solar-only label does not. Adapt the harness calls to match Step 1; the assertions are:

```ts
// after rendering the PDD form for a project whose PDD.methodology_id === 'meth-tver-forestry':
expect(screen.getByText(/Project area/i)).toBeInTheDocument();       // forestry projectField
expect(screen.getByText(/Dominant species/i)).toBeInTheDocument();   // forestry projectField
expect(screen.queryByText(/Installed capacity/i)).not.toBeInTheDocument(); // Solar-only field absent
```

If the existing harness drives everything through the store + `api`, seed a `pdd_draft` project pointed at `meth-tver-forestry` (mirror how the current test sets up its Solar project) rather than hand-constructing component props.

- [ ] **Step 3: Run the UI test**

Run: `cd carbon-ready && npx vitest run src/pages/registration.ui.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add carbon-ready/src/pages/registration.ui.test.tsx
git commit -m "test(registration): PDD form renders per-methodology schema"
```

---

## Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + build**

Run: `cd carbon-ready && npm run build`
Expected: `tsc -b` clean, Vite build succeeds.

- [ ] **Step 2: Full test suite**

Run: `cd carbon-ready && npm test`
Expected: all suites PASS (calc, registration, guardian, anchor, csv, pdd, ui).

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `cd carbon-ready && npm run dev`, open the app, hard-reload to clear the old `v4` store, and confirm:
- Methodologies page lists 8 entries across T-VER / Verra / CDM.
- Opening a wind/forestry/LFG sample project shows a registered PDD with that methodology's fields filled.
- Running Calculate on a forestry project yields a non-zero tCO₂e using stock-change (not grid) math.

- [ ] **Step 4: No commit** (verification only). If anything fails, fix under the relevant task and re-run.

---

## Self-Review

**Spec coverage:**
- §3 library of 8 → Tasks 1,3–8 (Solar updated, 7 new). ✓
- §4 data model (`Standard`, `CalcFormula`, `MethodologyCalculation`, widened `standard`, `calculation`) → Task 1. ✓
- §4 repurposed `generation_kwh` driver column → Task 9 records + Task 2 direct path. ✓
- §5 engine dispatch (4 formulas, grid path unchanged, no-regression) → Task 2 + Task 3. ✓
- §5 `er_estimate` handling — resolved by design: Solar keeps computed `er_estimate`; new methodologies use a plain `annual_er_estimate` number field, so `lib/pdd.ts` is untouched. ✓ (documented in File Structure "Do NOT touch")
- §6 seed one filled project per methodology + records → Task 9; persist bump → Task 10. ✓
- §9 testing (regression + one case per new formula; parametrized registration test) → Task 2, Task 11. ✓
- §7 Guardian seam / §8 non-goals → no Hedera work in any task. ✓

**Placeholder scan:** methodology codes/versions carry intentional `⚠︎ verify` markers (a data-accuracy TODO, not a plan gap); no `TBD`/"implement later"/"add error handling" steps. Every code step shows full code.

**Type consistency:** `calculateCarbon(records, factors, range?, calculation?)` signature consistent across Task 2 (def), Task 2 tests, Task 3 (call). `MethodologyCalculation` fields (`formula`, `input_param`, `input_unit`, `gwp_ch4?`) consistent Task 1 → 4 → 5–7. `buildStandardMethodology` config shape consistent Task 4 (def) → 5–7 (calls). Methodology `id`s (`meth-tver-forestry`, etc.) consistent Task 6/7 (def) → Task 9 (PDD refs) → Task 11 (test). Seed re-seed relies on persist name change only (Task 10), matching the existing v4 convention.
