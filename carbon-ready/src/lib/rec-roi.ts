// REC (I-REC(E)) return-on-investment — pure functions, no store/API imports.
// Spec: docs/superpowers/specs/2026-10-05-rec-roi-design.md
//
// Real-data-only: the REC count comes from measured monitoring records (never
// a kWp × sun-hours estimate), fees from data/rec-fees.ts (FN-01), and prices
// are user-entered with a source. Anything missing yields an explicit status
// instead of a guessed number.
import type { MonitoringRecord } from '../types';
import { REC_FEES, registrationFeeThb, type RecIssuanceType } from '../data/rec-fees';

const DAY_MS = 86_400_000;
const dayIndex = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS;
const isoOfDay = (idx: number) => new Date(idx * DAY_MS).toISOString().slice(0, 10);

export type AnnualMwh =
  | {
      status: 'ok';
      annual_mwh: number;
      total_kwh: number;
      window_start: string;
      window_end: string;
      coverage_days: number;
      partial: boolean;
    }
  | { status: 'no_data' };

/**
 * Annual MWh (= RECs per year) from one project's measured records over the
 * 365 days ending at the latest record. Shorter coverage is annualised
 * (Σkwh ÷ days × 365) and flagged `partial`. With `driverParam`, rows are
 * filtered like calculateCarbon: no param_key (legacy) or the driver param.
 */
export function annualMwh(records: MonitoringRecord[], driverParam?: string): AnnualMwh {
  const rows = driverParam
    ? records.filter((r) => !r.param_key || r.param_key === driverParam)
    : records;
  if (rows.length === 0) return { status: 'no_data' };

  // reduce, not Math.max(...spread) — IoT projects can carry tens of thousands of rows.
  const latest = rows.reduce((m, r) => Math.max(m, dayIndex(r.record_date)), -Infinity);
  const windowStart = latest - 364;
  const inWindow = rows.filter((r) => dayIndex(r.record_date) >= windowStart);
  const earliest = inWindow.reduce((m, r) => Math.min(m, dayIndex(r.record_date)), Infinity);
  const total_kwh = inWindow.reduce((s, r) => s + r.generation_kwh, 0);
  if (!(total_kwh > 0)) return { status: 'no_data' };

  const coverage_days = latest - earliest + 1;
  const partial = coverage_days < 365;
  const annualKwh = partial ? (total_kwh / coverage_days) * 365 : total_kwh;
  return {
    status: 'ok',
    annual_mwh: annualKwh / 1000,
    total_kwh,
    window_start: isoOfDay(earliest),
    window_end: isoOfDay(latest),
    coverage_days,
    partial,
  };
}

// ---------------------------------------------------------------------------
// Standalone REC ROI — own Evident trade account (ก) vs via platform (ข)
// ---------------------------------------------------------------------------

/** Org-level assumptions (null = not entered; there are NO defaults). */
export interface RecRoiAssumptions {
  price_low_thb: number | null;
  price_mid_thb: number | null;
  price_high_thb: number | null;
  platform_fee_pct: number | null;
  eur_thb: number | null;
  horizon_years: number;
}

/** Settings as stored (assumptions + provenance). Mirrors the server shape. */
export interface RecRoiSettingsShape extends RecRoiAssumptions {
  price_source: string;
  eur_thb_source: string;
}

/** Nothing entered yet. horizon 5 = FN-01 registration validity (a rule, not a guess). */
export const EMPTY_REC_ROI_SETTINGS: RecRoiSettingsShape & { updated_by: string | null; updated_at: string | null } = {
  price_low_thb: null, price_mid_thb: null, price_high_thb: null, price_source: '',
  platform_fee_pct: null, eur_thb: null, eur_thb_source: '', horizon_years: 5,
  updated_by: null, updated_at: null,
};

export interface RecProjectInputs {
  capacity_kwp: number;
  annual_mwh: number;
  issuance_type: RecIssuanceType;
  digital_meter_exempt: boolean;
}

export type RecPath = 'own' | 'platform';
export type RecScenario = 'low' | 'mid' | 'high';

export interface RecScenarioResult {
  scenario: RecScenario;
  price_thb: number;
  revenue_thb: number;
  cost_thb: number;
  net_thb: number;
  roi_pct: number | null;
  /** First month at which cumulative cash ≥ 0; null = not within the horizon. */
  payback_months: number | null;
}

export type RecPathOk = {
  path: RecPath;
  status: 'ok';
  fixed_cost_thb: number;
  issuance_cost_thb: number;
  break_even_price_thb: number;
  scenarios: RecScenarioResult[];
};
export type RecPathResult = RecPathOk | { path: RecPath; status: 'missing_fx' | 'missing_fee' };

export type RecRoiMissing = 'price' | 'platform_fee' | 'fx';

export interface RecRoiResult {
  own: RecPathResult;
  platform: RecPathResult;
  recommended: RecPath | null;
  missing: RecRoiMissing[];
}

const hasFx = (a: RecRoiAssumptions) => a.eur_thb !== null && a.eur_thb > 0;
const feeFraction = (path: RecPath, a: RecRoiAssumptions) =>
  path === 'platform' ? (a.platform_fee_pct ?? 0) / 100 : 0;

/**
 * Lump costs falling at the start of operating year y (1-based): registration
 * in year 1, a 40% renewal at the start of every later 5-year validity
 * (years 6, 11, …), and on the own-account path the €500 opening (year 1)
 * plus the €2,000 annual account fee (every year, payable on each anniversary).
 */
export function yearFixedCostThb(path: RecPath, y: number, inputs: RecProjectInputs, a: RecRoiAssumptions): number {
  const reg = registrationFeeThb(inputs.capacity_kwp, inputs.digital_meter_exempt);
  const cycle = REC_FEES.registration_validity_years;
  let cost = y === 1 ? reg : (y - 1) % cycle === 0 ? reg * (REC_FEES.renewal_pct_of_registration / 100) : 0;
  if (path === 'own') {
    const fx = a.eur_thb ?? 0;
    cost += REC_FEES.account_annual_eur * fx + (y === 1 ? REC_FEES.account_opening_eur * fx : 0);
  }
  return cost;
}

/** Month-by-month: lumps at the start of each year, the yearly margin spread evenly. */
function paybackMonths(path: RecPath, inputs: RecProjectInputs, a: RecRoiAssumptions, price: number): number | null {
  const fee = feeFraction(path, a);
  const issuance = REC_FEES.issuance_thb_per_mwh[inputs.issuance_type];
  const monthly = (inputs.annual_mwh * (price * (1 - fee) - issuance)) / 12;
  if (!(monthly > 0)) return null;
  let cum = 0;
  for (let y = 1; y <= a.horizon_years; y++) {
    cum -= yearFixedCostThb(path, y, inputs, a);
    if (y === 1 && cum >= 0) return 0;
    for (let m = 1; m <= 12; m++) {
      cum += monthly;
      if (cum >= 0) return (y - 1) * 12 + m;
    }
  }
  return null;
}

function evaluatePath(path: RecPath, inputs: RecProjectInputs, a: RecRoiAssumptions): RecPathResult {
  if (path === 'own' && !hasFx(a)) return { path, status: 'missing_fx' };
  if (path === 'platform' && a.platform_fee_pct === null) return { path, status: 'missing_fee' };

  const H = a.horizon_years;
  const M = inputs.annual_mwh;
  const fee = feeFraction(path, a);
  const issuance = REC_FEES.issuance_thb_per_mwh[inputs.issuance_type];
  let fixed = 0;
  for (let y = 1; y <= H; y++) fixed += yearFixedCostThb(path, y, inputs, a);
  const issuanceCost = H * M * issuance;

  const prices: Array<[RecScenario, number | null]> = [
    ['low', a.price_low_thb], ['mid', a.price_mid_thb], ['high', a.price_high_thb],
  ];
  const scenarios = prices
    .filter((p): p is [RecScenario, number] => p[1] !== null)
    .map(([scenario, price]): RecScenarioResult => {
      const revenue = H * M * price;
      const cost = fixed + issuanceCost + fee * revenue;
      const net = revenue - cost;
      return {
        scenario, price_thb: price, revenue_thb: revenue, cost_thb: cost, net_thb: net,
        roi_pct: cost > 0 ? (net / cost) * 100 : null,
        payback_months: paybackMonths(path, inputs, a, price),
      };
    });

  return {
    path, status: 'ok', fixed_cost_thb: fixed, issuance_cost_thb: issuanceCost,
    break_even_price_thb: (fixed + issuanceCost) / (H * M * (1 - fee)),
    scenarios,
  };
}

function recommend(own: RecPathResult, platform: RecPathResult): RecPath | null {
  const ok = [own, platform].filter((p): p is RecPathOk => p.status === 'ok');
  if (ok.length === 0) return null;
  if (ok.length === 1) return ok[0].path;
  const [x, y] = ok;
  const mx = x.scenarios.find((s) => s.scenario === 'mid');
  const my = y.scenarios.find((s) => s.scenario === 'mid');
  if (mx && my) return mx.net_thb >= my.net_thb ? x.path : y.path;
  return x.break_even_price_thb <= y.break_even_price_thb ? x.path : y.path;
}

/** Standalone REC ROI for one project. `inputs.annual_mwh` must be > 0 (see annualMwh). */
export function computeRecRoi(inputs: RecProjectInputs, a: RecRoiAssumptions): RecRoiResult {
  const own = evaluatePath('own', inputs, a);
  const platform = evaluatePath('platform', inputs, a);
  const missing: RecRoiMissing[] = [];
  if (a.price_mid_thb === null) missing.push('price');
  if (a.platform_fee_pct === null) missing.push('platform_fee');
  if (!hasFx(a)) missing.push('fx');
  return { own, platform, recommended: recommend(own, platform), missing };
}

/**
 * Client-side mirror of the server's zod SettingsBody — returns a Thai
 * message for the first problem, or null when valid.
 */
export function validateRecRoiSettings(s: RecRoiSettingsShape): string | null {
  const prices = [s.price_low_thb, s.price_mid_thb, s.price_high_thb];
  if (prices.some((p) => p !== null && !(p > 0))) return 'ราคา REC ต้องมากกว่า 0';
  const entered = prices.filter((p): p is number => p !== null);
  for (let i = 1; i < entered.length; i++) {
    if (entered[i] < entered[i - 1]) return 'ราคาต้องเรียง ต่ำ ≤ กลาง ≤ สูง';
  }
  if (entered.length > 0 && s.price_source.trim() === '') return 'กรุณาระบุที่มาของราคา (เช่น ใบเสนอซื้อจริง)';
  if (s.platform_fee_pct !== null && !(s.platform_fee_pct >= 0 && s.platform_fee_pct < 100)) {
    return 'ค่าบริการแพลตฟอร์มต้องอยู่ระหว่าง 0 ถึงน้อยกว่า 100%';
  }
  if (s.eur_thb !== null && !(s.eur_thb > 0)) return 'อัตราแลกเปลี่ยนต้องมากกว่า 0';
  if (!Number.isInteger(s.horizon_years) || s.horizon_years < 1 || s.horizon_years > 25) {
    return 'ระยะประเมินต้องเป็นจำนวนเต็ม 1–25 ปี';
  }
  return null;
}
