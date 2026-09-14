// Copied from carbon-ready/src/types/index.ts — source of truth until
// workspaces (Phase 1b). Minimal subset only: the types the methodology
// document schema (lib/methodology-schema.ts) validates against, copied
// note-for-note from the SPA type file.

export type UUID = string;

// ============================================================
// Sprint 2 — Evidence Management
// ============================================================
export type EvidenceCategory =
  | 'meter_reading'
  | 'utility_bill'
  | 'commissioning_report'
  | 'site_photo'
  | 'maintenance_report'
  | 'supporting_evidence'
  | 'verification_report';

// ============================================================
// Registration — Methodology (Guardian Policy) & PDD
// ============================================================
export type PddFieldType =
  | 'text' | 'textarea' | 'number' | 'select' | 'date'
  | 'boolean' | 'url' | 'email' | 'image' | 'computed' | 'table';

export type PddComputedSource =
  | 'capacity_kwp' | 'project_location' | 'commission_date'
  | 'grid_factor' | 'er_estimate'
  | 'annual_generation' | 'ec_pj' | 'be_annual' | 'pe_annual' | 'er_annual'
  | 'bundle_capacity' | 'site_count';

export interface PddTableColumn {
  key: string;
  label: string;
  type: 'text' | 'number';
  unit?: string;
}

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

export interface PddSectionSchema {
  key: string;
  title: string;
  help?: string;
  fields: PddFieldSchema[];
}

export interface MonitoringParam {
  key: string;
  label: string;
  unit: string;
  method: string;
  frequency: string;
}

export type Standard = 'T-VER' | 'Verra' | 'CDM' | 'REC';

export type CalcFormula =
  | 'grid_displacement'    // ER = Σ(driver_kWh) × grid EF
  | 'biomass_stock_change' // driver already tCO2e/period → Σ driver
  | 'ch4_avoidance'        // ER = Σ(driver_t_CH4) × gwp_ch4
  | 'direct_entry';        // driver already tCO2e/period → Σ driver

export interface MethodologyCalculation {
  formula: CalcFormula;
  input_param: string;   // monitoring_params key carrying the driver value
  input_unit: string;    // must equal the driver param's unit: 'kWh' | 'tCO₂e' | 't CH4'
  gwp_ch4?: number;      // required for ch4_avoidance (e.g. 28)
}

export interface Methodology {
  id: UUID;
  code: string;                // registry code, e.g. 'T-VER-S-METH-01-01'
  name: string;
  standard: Standard;
  version: string;
  sectoral_scope: string;
  status: 'active' | 'deprecated';
  calculation: MethodologyCalculation;
  pdd_sections: PddSectionSchema[];
  required_evidence: EvidenceCategory[];
  monitoring_params: MonitoringParam[];
  /** Official-form renderer registered for this methodology (template-per-form). */
  document_template?: DocumentTemplate;
}

/** Official-form renderers registered per methodology (template-per-form). */
export type DocumentTemplate = 'T-VER-S-F001-PDD' | 'EVIDENT-SF-02';
