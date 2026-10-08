import type { Methodology, MethodologyCalculation } from '../types';
import { OFFICIAL_FORMS } from '../templates/registry';

// Single source of truth for the "jump into the repo" links the methodology
// detail panel surfaces to onboarding developers.
export const GITHUB_DEFAULT_BRANCH = 'feat/sprint-1-mvp';
export const GITHUB_REPO_BASE =
  `https://github.com/InZoalvation-Squads/GEM-Carbon-Credit---dMRV/blob/${GITHUB_DEFAULT_BRANCH}/`;

export function codeUrl(repoRelPath: string): string {
  // Leading './' or '/' would double-up the base and 404; strip them here.
  return GITHUB_REPO_BASE + repoRelPath.replace(/^\.?\//, '');
}

/** A code reference row rendered on the methodology detail panel. */
export interface CodeReference {
  /** Short label — "Methodology definition", "Official form". */
  kind: string;
  /** Repo-relative path shown inline so the user can copy without clicking. */
  path: string;
  /** Full browser URL to the file on the default branch. */
  url: string;
  /** Extra context (e.g. the DocumentTemplate code). */
  note?: string;
}

/** Collect code references for a methodology, in display order.
 *
 *  Only returns entries whose source actually exists in the repo — we don't
 *  manufacture links for methodologies that lack a source_path (such as a
 *  user-imported JSON methodology) or that have no official-form renderer.
 *  There is no Guardian policy file in this repo, so none is linked. */
export function codeReferencesFor(m: Methodology): CodeReference[] {
  const refs: CodeReference[] = [];
  if (m.source_path) {
    refs.push({
      kind: 'Methodology definition',
      path: m.source_path,
      url: codeUrl(m.source_path),
      note: 'PDD sections, fields, monitoring parameters and calculation config',
    });
  }
  const form = officialFormRef(m);
  if (form) refs.push(form);
  refs.push(
    {
      kind: 'Guardian schema',
      path: GUARDIAN_SCHEMA_PATH,
      url: codeUrl(GUARDIAN_SCHEMA_PATH),
      note: 'PDD_REGISTRATION_SCHEMA_V1 — the credential schema the PDD is issued against',
    },
    {
      kind: 'Guardian issuance',
      path: GUARDIAN_ISSUANCE_PATH,
      url: codeUrl(GUARDIAN_ISSUANCE_PATH),
      note: 'buildPddSubject / issueCredential',
    },
  );
  return refs;
}

function officialFormRef(m: Methodology): CodeReference | null {
  const form = m.document_template ? OFFICIAL_FORMS[m.document_template] : undefined;
  if (!form) return null;
  return {
    kind: 'Official form',
    path: form.componentPath,
    url: codeUrl(form.componentPath),
    note: m.document_template,
  };
}

/** The code that implements every PDD section of a methodology: where the
 *  user fills its fields and what renders it as a document. Sections have no
 *  per-section components of their own, so `renderer` is the official-form
 *  template when one is bound, else null (the generic editor renders it). */
export function sectionImplementationFor(m: Methodology): {
  entry: CodeReference;
  renderer: CodeReference | null;
} {
  return {
    entry: {
      kind: 'Filled in',
      path: PDD_ENTRY_EDITOR_PATH,
      url: codeUrl(PDD_ENTRY_EDITOR_PATH),
    },
    renderer: officialFormRef(m),
  };
}

/** True when there's no document_template bound — the generic PDD editor renders. */
export function usesGenericPddEditor(m: Methodology): boolean {
  return !m.document_template;
}

export const GENERIC_PDD_EDITOR_PATH = 'carbon-ready/src/pages/PddDocument.tsx';
export const PDD_ENTRY_EDITOR_PATH = 'carbon-ready/src/pages/Registration.tsx';
export const GUARDIAN_SCHEMA_PATH = 'carbon-ready/src/lib/guardian-schema.ts';
export const GUARDIAN_ISSUANCE_PATH = 'carbon-ready/src/lib/guardian.ts';

export interface CalculationDescription {
  /** Human-readable formula, e.g. "ER (tCO₂e) = Σ(EG_PJ_kWh × EF_grid) ÷ 1000". */
  formula: string;
  /** Explanation line below the formula. */
  rationale: string;
  /** Driver monitoring-param key — the one that feeds the calculation. */
  driverParam: string;
  /** Driver unit the calculation expects. */
  driverUnit: string;
}

/** Describe how a methodology's calculation turns monitoring data into tCO₂e.
 *  Mirrors the logic in lib/calc.ts so what the panel shows matches what runs. */
export function describeCalculation(calc: MethodologyCalculation): CalculationDescription {
  const driver = calc.input_param;
  switch (calc.formula) {
    case 'grid_displacement':
      return {
        formula: `ER (tCO₂e) = Σ(${driver} [${calc.input_unit}] × EF_grid [kgCO₂e/kWh]) ÷ 1000`,
        rationale: 'Each monitoring record multiplies the driver reading by the emission factor effective on that date; results are summed per period.',
        driverParam: driver,
        driverUnit: calc.input_unit,
      };
    case 'biomass_stock_change':
    case 'direct_entry':
      return {
        formula: `ER (tCO₂e) = Σ ${driver} [${calc.input_unit}]`,
        rationale: 'The driver is already reported in tCO₂e per period, so the pipeline sums it directly.',
        driverParam: driver,
        driverUnit: calc.input_unit,
      };
    case 'ch4_avoidance': {
      const gwp = calc.gwp_ch4 ?? 28;
      return {
        formula: `ER (tCO₂e) = Σ(${driver} [${calc.input_unit}] × GWP_CH4=${gwp})`,
        rationale: 'Methane captured and destroyed is converted to tCO₂e-equivalent via the configured GWP.',
        driverParam: driver,
        driverUnit: calc.input_unit,
      };
    }
  }
}

/** For a given monitoring param, say how it participates in the calculation.
 *  Returns null when it's an observational parameter that is logged but not fed
 *  into the ER formula directly (e.g. EF_grid, A_project). */
export function paramRoleInCalculation(
  paramKey: string,
  calc: MethodologyCalculation,
): string | null {
  if (paramKey === calc.input_param) {
    return `Driver — feeds the ${calc.formula.replace(/_/g, ' ')} formula`;
  }
  if (paramKey === 'EF_grid' && calc.formula === 'grid_displacement') {
    return 'Multiplier — applied per record via the emission-factor registry';
  }
  return null;
}
