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

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  project_owner: 'Project Owner',
  esg_manager: 'ESG Manager',
  verifier: 'Verifier',
};

export const EVIDENCE_CATEGORIES = Object.keys(CATEGORY_LABEL) as EvidenceCategory[];
