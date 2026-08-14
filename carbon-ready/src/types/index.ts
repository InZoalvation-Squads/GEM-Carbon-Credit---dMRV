export type UUID = string;

export type ProjectStatus = 'draft' | 'active' | 'suspended' | 'retired';
export type UserRole = 'admin' | 'project_owner' | 'esg_manager' | 'verifier';
export type AuditAction =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'CSV_UPLOADED'
  | 'CALCULATION_EXECUTED'
  | 'EMISSION_FACTOR_ADDED'
  | 'EVIDENCE_UPLOADED'
  | 'EVIDENCE_REPLACED'
  | 'EVIDENCE_ARCHIVED'
  | 'VERIFICATION_SUBMITTED'
  | 'REVIEW_STARTED'
  | 'COMMENT_ADDED'
  | 'REVISION_REQUESTED'
  | 'VERIFICATION_APPROVED'
  | 'VERIFICATION_REJECTED'
  | 'VERIFICATION_ANCHORED'
  // Registration (Gate 1 — PDD validation)
  | 'METHODOLOGY_SELECTED'
  | 'METHODOLOGY_IMPORTED'
  | 'PDD_SUBMITTED'
  | 'VALIDATION_STARTED'
  | 'PDD_REVISION_REQUESTED'
  | 'PROJECT_REGISTERED'
  | 'PDD_REJECTED'
  // Guardian issuance
  | 'TOKEN_MINTED'
  // REC issuance (SF-04)
  | 'REC_ISSUE_CREATED'
  | 'REC_ISSUE_SUBMITTED'
  | 'REC_ISSUE_ISSUED'
  | 'REC_ISSUE_REJECTED'
  | 'REC_ISSUE_DELETED';

export type EntityType =
  | 'project' | 'monitoring' | 'factor' | 'calculation'
  | 'evidence' | 'verification' | 'methodology' | 'pdd' | 'token' | 'rec_issue';
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

export type ProjectLifecycle =
  | 'unregistered'      // no methodology chosen yet
  | 'pdd_draft'         // filling PDD
  | 'under_validation'  // submitted, awaiting VVB
  | 'registered'        // dMRV unlocked
  | 'rejected';

export interface Project {
  id: UUID;
  organization_id: UUID;
  name: string;
  location: string;
  capacity_kwp: number;
  commission_date: string;       // ISO date
  status: ProjectStatus;
  lifecycle_stage: ProjectLifecycle;   // registration gate
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
  param_key?: string;   // methodology monitoring_params key; absent = legacy default driver
  unit?: string;        // frozen at upload from the methodology definition
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
  // Sprint 2 — Advanced Audit Trail (optional; older entries may omit)
  user_role?: UserRole | null;
  ip_address?: string | null;
  previous_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  row_hash?: string | null;
  prev_row_hash?: string | null;
}

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

export type EvidenceStatus = 'active' | 'superseded' | 'archived';
export type FileKind = 'pdf' | 'image' | 'xlsx';

export interface EvidenceFile {
  id: UUID;
  project_id: UUID;
  parent_id: UUID | null;          // previous version, if any
  category: EvidenceCategory;
  file_name: string;
  kind: FileKind;
  file_size: number;               // bytes
  version_number: number;
  status: EvidenceStatus;
  description?: string;
  content_hash: string;
  uploaded_by: UUID;
  uploaded_by_name: string;
  uploaded_at: string;
}

// ============================================================
// Sprint 2 — Verification Workflow
// ============================================================
export type VerificationState =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'revision_required'
  | 'approved'
  | 'rejected';

export interface VerificationComment {
  id: UUID;
  verification_id: UUID;
  evidence_id: UUID | null;        // null = package-level
  evidence_name?: string;
  section_key?: string;        // PDD section a comment is attached to (registration)
  author_id: UUID;
  author_name: string;
  author_role: UserRole;
  body: string;
  reply_to?: UUID;
  created_at: string;
}

export interface VerificationRequest {
  id: UUID;
  project_id: UUID;
  created_by: UUID;
  owner_name: string;
  assigned_verifier_name: string;
  state: VerificationState;
  monitoring_period_start: string; // ISO date
  monitoring_period_end: string;   // ISO date
  reduction_kgco2e: number;        // carbon claim for the period
  factors_snapshot: string;
  evidence_ids: UUID[];
  required_categories: EvidenceCategory[];
  submitted_at: string | null;
  locked_at: string | null;
  sla_target_days: number;
  rejection_reason?: string;
  // Sprint 3 (Hedera Guardian) readiness — populated by the anchor worker
  hash_value: string | null;
  credential_id: string | null;
  anchored_at: string | null;
  hcs_topic_id: string | null;
  hcs_sequence_number: number | null;
}

// ============================================================
// REC Issuance — SF-04 Issue Request (see docs/reference/rec/)
// ============================================================
export type RecIssueState = 'draft' | 'submitted' | 'issued' | 'rejected';

/** Org/facility/fuel data copied from the REC registration at request creation. */
export interface RecFacilitySnapshot {
  evident_org_id: string;
  organisation_name: string;
  facility_name: string;
  fuel_code: string;
  fuel_description: string;
  technology_code: string;
  technology_description: string;
}

export interface RecIssueRequest {
  id: UUID;
  project_id: UUID;
  created_by: string;
  owner_name: string;
  assigned_reviewer_name: string;
  state: RecIssueState;
  request_type: 'Normal' | 'Self consumption';
  period_start: string; // ISO date
  period_end: string;   // ISO date
  total_production_mwh: number; // server-computed; frozen at submit
  applied_mwh: number | null;   // SF-04 "I-REC(E) applied for"; null = total
  facility_snapshot: RecFacilitySnapshot;
  receiving_org_name: string;
  receiving_account_id: string;
  evidence_ids: UUID[];
  submitted_at: string | null;
  issued_at: string | null;
  rejection_reason?: string | null;
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

// ============================================================
// Sprint 3 — Hedera Guardian (simulated)
// ============================================================
export interface GuardianConfig {
  issuer_did: string;
  topic_id: string;
  network: 'testnet';
}

export interface CredentialSchemaProperty {
  key: string;
  type: string;
  description: string;
}

export interface CredentialSchema {
  id: string;
  name: string;
  version: string;
  type: string;
  properties: CredentialSchemaProperty[];
}

export interface VerifiableCredential {
  id: string;                 // also stored as VerificationRequest.credential_id
  schema_id: string;
  issuer_did: string;
  issued_at: string;
  subject: Record<string, unknown>;
  package_hash: string;
  hcs: {
    topic_id: string;
    sequence_number: number;
    consensus_timestamp: string;
    explorer_url: string;
  };
  // W3C VC shape + Ed25519 proof. Optional: seed-era credentials predate signing.
  context?: string[];         // ['https://www.w3.org/ns/credentials/v2']
  vc_type?: string[];         // ['VerifiableCredential', schema.type]
  proof?: {
    type: 'Ed25519Signature2020';
    created: string;
    verificationMethod: string;   // issuer did:key
    proofValue: string;           // hex signature over sha256(canonical(vc sans proof))
  };
  // Real Hedera consensus coordinates, attached by the SERVER after signing
  // (outside the signed envelope, like `proof`). Absent until anchored.
  anchor?: {
    topic_id: string;
    sequence_number: number;
    consensus_timestamp: string;
    explorer_url: string;
  } | null;
}

// A minted VCU token. In Guardian this is a separate step after the VC is issued:
// the Standard Registry mints one token per anchored credential.
export interface GuardianToken {
  id: string;
  token_id: string;             // Hedera token id, e.g. '0.0.480200'
  serial_number: number;
  project_id: UUID;
  credential_id: string;        // the VerifiableCredential this token certifies
  amount_tco2e: number;
  monitoring_period_start: string;
  monitoring_period_end: string;
  minted_at: string;
  minted_by_role: UserRole;     // 'admin' = Standard Registry
  hcs: {
    topic_id: string;
    sequence_number: number;
    explorer_url: string;
  };
  /** Server-minted dual-standard detail: HTS serial range + ERC-1155 batch. Absent in local mode. */
  batch?: Record<string, unknown> | null;
}

// ============================================================
// Registration — Methodology (Guardian Policy) & PDD
// ============================================================
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
  code: string;                // 'T-VER-S-01'
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

export type PddState =
  | 'draft' | 'submitted' | 'under_validation'
  | 'revision_required' | 'registered' | 'rejected';

export interface ProjectDesignDocument {
  id: UUID;                    // 'PDD-xxxx'
  project_id: UUID;
  methodology_id: UUID;
  methodology_snapshot: string;   // code + version, frozen at submit
  state: PddState;
  section_data: Record<string, unknown>;   // keyed by field.key
  evidence_ids: UUID[];
  assigned_validator_name: string;
  submitted_at: string | null;
  validated_at: string | null;    // = registered timestamp
  content_hash: string | null;    // frozen at register
  ipfs_cid: string | null;        // simulated IPFS CID of the published PDD, frozen at register
  credential_id: string | null;   // PDD Registration VC id
  disclosure_salts?: Record<string, string>; // hex salt per sensitive field, private side of selective disclosure
  rejection_reason?: string;
}
