import type { EvidenceCategory, UserRole, VerificationState } from '../types';

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
