import type { Methodology } from '../types';

export interface CalculationDescription {
  /** Formula as written in the methodology, e.g. "ER (tCO₂e) = Σ(EG_PJ [kWh] × EF_grid [kgCO₂e/kWh]) ÷ 1000". */
  formula: string;
  /** The same formula in plain words for a project owner. */
  explanation: string;
}

/** Monitoring-parameter label for a key, e.g. "net electricity supplied to the
 *  grid (EG_PJ)". Mid-sentence it lower-cases a leading capital but leaves
 *  acronyms ("GHG …") alone; at the start of a sentence the label is kept as is. */
function paramPhrase(m: Methodology, key: string, atSentenceStart = false): string {
  const label = m.monitoring_params.find((p) => p.key === key)?.label;
  if (!label) return key;
  const text = !atSentenceStart && /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
  return `${text} (${key})`;
}

/** Describe how a methodology's calculation turns monitoring data into tCO₂e.
 *  Mirrors the logic in lib/calc.ts so what the panel shows matches what runs. */
export function describeCalculation(m: Methodology): CalculationDescription {
  const calc = m.calculation;
  const driver = calc.input_param;
  const reading = paramPhrase(m, driver);
  switch (calc.formula) {
    case 'grid_displacement':
      return {
        formula: `ER (tCO₂e) = Σ(${driver} [${calc.input_unit}] × EF_grid [kgCO₂e/kWh]) ÷ 1000`,
        explanation: `Each reading of ${reading}, in ${calc.input_unit}, is multiplied by the grid emission factor in effect on that date. The results are added up for the reporting period and divided by 1,000 to turn kilograms into tonnes of CO₂e.`,
      };
    case 'biomass_stock_change':
    case 'direct_entry':
      return {
        formula: `ER (tCO₂e) = Σ ${driver} [${calc.input_unit}]`,
        explanation: `${paramPhrase(m, driver, true)} is already reported in ${calc.input_unit} for each reporting period, so the emission reduction is the total of those values.`,
      };
    case 'ch4_avoidance': {
      const gwp = calc.gwp_ch4 ?? 28;
      return {
        formula: `ER (tCO₂e) = Σ(${driver} [${calc.input_unit}] × GWP_CH4=${gwp})`,
        explanation: `Each reading of ${reading}, in ${calc.input_unit}, is multiplied by ${gwp} (how much stronger methane is than CO₂ as a greenhouse gas) to give tonnes of CO₂e. The results are added up for the reporting period.`,
      };
    }
  }
}

/** For a given monitoring param, say in plain words how it is used in the
 *  calculation. Returns null when it is recorded but not part of the formula
 *  (e.g. A_planted). */
export function paramRoleInCalculation(paramKey: string, m: Methodology): string | null {
  const calc = m.calculation;
  if (paramKey === calc.input_param) {
    return 'Used to calculate the emission reduction';
  }
  if (paramKey === 'EF_grid' && calc.formula === 'grid_displacement') {
    return 'Applied to each reading to convert electricity into CO₂e';
  }
  return null;
}
