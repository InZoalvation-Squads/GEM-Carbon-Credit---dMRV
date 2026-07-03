import type { EmissionFactor, MonitoringRecord, MethodologyCalculation } from '../types';

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

function round3(n: number) { return Math.round(n * 1000) / 1000; }
function round3Obj(o: { generation_kwh: number; reduction_kgco2e: number }) {
  return { generation_kwh: round3(o.generation_kwh), reduction_kgco2e: round3(o.reduction_kgco2e) };
}
