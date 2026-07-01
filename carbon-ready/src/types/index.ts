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
  | 'PDD_SUBMITTED'
  | 'VALIDATION_STARTED'
  | 'PDD_REVISION_REQUESTED'
  | 'PROJECT_REGISTERED'
  | 'PDD_REJECTED';

export type EntityType =
  | 'project' | 'monitoring' | 'factor' | 'calculation'
  | 'evidence' | 'verification' | 'methodology' | 'pdd';
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
  | 'revision_required' // sent back for revision by VVB
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
}

// ============================================================
// Registration — Methodology (Guardian Policy) & PDD
// ============================================================
export type PddFieldType =
  | 'text' | 'textarea' | 'number' | 'select' | 'date'
  | 'boolean' | 'url' | 'email' | 'image' | 'computed';

export type PddComputedSource =
  | 'capacity_kwp' | 'project_location' | 'commission_date'
  | 'grid_factor' | 'er_estimate';

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

export interface Methodology {
  id: UUID;
  code: string;                // 'T-VER-S-01'
  name: string;
  standard: 'T-VER';
  version: string;
  sectoral_scope: string;
  status: 'active' | 'deprecated';
  pdd_sections: PddSectionSchema[];
  required_evidence: EvidenceCategory[];
  monitoring_params: MonitoringParam[];
}

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
  rejection_reason?: string;
}
