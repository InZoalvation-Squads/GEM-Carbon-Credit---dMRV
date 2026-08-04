import { describe, it, expect } from 'vitest';
import { ROLE_LABEL, ACTION_LABEL, ENTITY_LABEL, PROJECT_STATUS_LABEL, sourceLabel } from './labels';
import type { AuditAction, EntityType, ProjectStatus } from '../types';

// The app maps its internal roles onto the Hedera Guardian VM0047 actor triad
// (Project Proponent / Standard Registry / VVB). Enum values stay the same;
// only the display labels follow Guardian terminology.
describe('ROLE_LABEL — Guardian VM0047 actor terminology', () => {
  it('labels project_owner as the Project Proponent', () => {
    expect(ROLE_LABEL.project_owner).toBe('Project Proponent');
  });

  it('labels admin as the Standard Registry', () => {
    expect(ROLE_LABEL.admin).toBe('Standard Registry');
  });

  it('labels verifier as the VVB', () => {
    expect(ROLE_LABEL.verifier).toBe('VVB (Validation & Verification Body)');
  });

  it('keeps ESG Manager, which is outside the Guardian triad', () => {
    expect(ROLE_LABEL.esg_manager).toBe('ESG Manager');
  });
});

// Raw SCREAMING_SNAKE enums must never reach the user — every AuditAction,
// EntityType, ProjectStatus and monitoring source has a readable label.
describe('ACTION_LABEL — audit actions are human-readable', () => {
  it('covers every AuditAction with no raw snake_case leaking', () => {
    const actions: AuditAction[] = [
      'PROJECT_CREATED', 'PROJECT_UPDATED', 'CSV_UPLOADED', 'CALCULATION_EXECUTED',
      'EMISSION_FACTOR_ADDED', 'EVIDENCE_UPLOADED', 'EVIDENCE_REPLACED', 'EVIDENCE_ARCHIVED',
      'VERIFICATION_SUBMITTED', 'REVIEW_STARTED', 'COMMENT_ADDED', 'REVISION_REQUESTED',
      'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'VERIFICATION_ANCHORED',
      'METHODOLOGY_SELECTED', 'METHODOLOGY_IMPORTED', 'PDD_SUBMITTED', 'VALIDATION_STARTED',
      'PDD_REVISION_REQUESTED', 'PROJECT_REGISTERED', 'PDD_REJECTED', 'TOKEN_MINTED',
    ];
    for (const a of actions) {
      expect(ACTION_LABEL[a], a).toBeTruthy();
      expect(ACTION_LABEL[a]).not.toMatch(/_/);
    }
  });

  it('keeps acronyms upper-case (PDD, CSV)', () => {
    expect(ACTION_LABEL.PDD_SUBMITTED).toBe('PDD Submitted');
    expect(ACTION_LABEL.CSV_UPLOADED).toBe('CSV Uploaded');
  });
});

describe('ENTITY_LABEL / PROJECT_STATUS_LABEL / sourceLabel', () => {
  it('labels every entity type', () => {
    const entities: EntityType[] = ['project', 'monitoring', 'factor', 'calculation', 'evidence', 'verification', 'methodology', 'pdd', 'token'];
    for (const e of entities) expect(ENTITY_LABEL[e], e).toBeTruthy();
    expect(ENTITY_LABEL.pdd).toBe('PDD');
    expect(ENTITY_LABEL.factor).toBe('Emission Factor');
  });

  it('labels every project status', () => {
    const statuses: ProjectStatus[] = ['draft', 'active', 'suspended', 'retired'];
    for (const s of statuses) expect(PROJECT_STATUS_LABEL[s], s).toBeTruthy();
    expect(PROJECT_STATUS_LABEL.active).toBe('Active');
  });

  it('labels monitoring sources and prettifies unknown ones', () => {
    expect(sourceLabel('iot_sync')).toBe('IoT Sync');
    expect(sourceLabel('csv_upload')).toBe('CSV Upload');
    expect(sourceLabel('some_new_source')).toBe('Some New Source');
  });
});
