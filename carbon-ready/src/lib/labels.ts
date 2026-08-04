import type { AuditAction, EntityType, EvidenceCategory, ProjectStatus, UserRole, VerificationState } from '../types';

export const CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  meter_reading: 'Meter Reading',
  utility_bill: 'Utility Bill',
  commissioning_report: 'Commissioning Report',
  site_photo: 'Site Photo',
  maintenance_report: 'Maintenance Report',
  supporting_evidence: 'Supporting Evidence',
  verification_report: 'Verification Report',
};

export const STATE_LABEL: Record<VerificationState, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  revision_required: 'Revision Required',
  approved: 'Approved',
  rejected: 'Rejected',
};

// Display labels follow the Hedera Guardian VM0047 actor triad
// (Project Proponent / Standard Registry / VVB). Enum values are unchanged.
export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Standard Registry',
  project_owner: 'Project Proponent',
  esg_manager: 'ESG Manager',
  verifier: 'VVB (Validation & Verification Body)',
};

export const EVIDENCE_CATEGORIES = Object.keys(CATEGORY_LABEL) as EvidenceCategory[];

// Audit actions as short title-case labels for badges, filters and feeds.
// (ReviewDetail keeps its own narrative fragments — "opened review" — which
// read as sentences inside the timeline, a different register than these.)
export const ACTION_LABEL: Record<AuditAction, string> = {
  PROJECT_CREATED: 'Project Created',
  PROJECT_UPDATED: 'Project Updated',
  CSV_UPLOADED: 'CSV Uploaded',
  CALCULATION_EXECUTED: 'Calculation Executed',
  EMISSION_FACTOR_ADDED: 'Emission Factor Added',
  EVIDENCE_UPLOADED: 'Evidence Uploaded',
  EVIDENCE_REPLACED: 'Evidence Replaced',
  EVIDENCE_ARCHIVED: 'Evidence Archived',
  VERIFICATION_SUBMITTED: 'Verification Submitted',
  REVIEW_STARTED: 'Review Started',
  COMMENT_ADDED: 'Comment Added',
  REVISION_REQUESTED: 'Revision Requested',
  VERIFICATION_APPROVED: 'Verification Approved',
  VERIFICATION_REJECTED: 'Verification Rejected',
  VERIFICATION_ANCHORED: 'Anchored to Guardian',
  METHODOLOGY_SELECTED: 'Methodology Selected',
  METHODOLOGY_IMPORTED: 'Methodology Imported',
  PDD_SUBMITTED: 'PDD Submitted',
  VALIDATION_STARTED: 'Validation Started',
  PDD_REVISION_REQUESTED: 'PDD Revision Requested',
  PROJECT_REGISTERED: 'Project Registered',
  PDD_REJECTED: 'PDD Rejected',
  TOKEN_MINTED: 'VCU Token Minted',
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  project: 'Project',
  monitoring: 'Monitoring Record',
  factor: 'Emission Factor',
  calculation: 'Calculation',
  evidence: 'Evidence',
  verification: 'Verification',
  methodology: 'Methodology',
  pdd: 'PDD',
  token: 'VCU Token',
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  suspended: 'Suspended',
  retired: 'Retired',
};

const SOURCE_LABEL: Record<string, string> = {
  iot_sync: 'IoT Sync',
  csv_upload: 'CSV Upload',
  manual: 'Manual Entry',
};

/** Monitoring-record source → label; unknown sources fall back to Title Case. */
export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source]
    ?? source.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
