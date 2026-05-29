import { describe, it, expect } from 'vitest';
import { buildApprovalSubject, issueCredential, DEFAULT_GUARDIAN_CONFIG } from './guardian';
import { MRV_APPROVAL_SCHEMA_V1 } from './guardian-schema';
import type { EvidenceFile, VerificationRequest } from '../types';

const v: VerificationRequest = {
  id: 'VR-T1', project_id: 'prj-x', created_by: 'u1', owner_name: 'O', assigned_verifier_name: 'V',
  state: 'approved', monitoring_period_start: '2026-04-01', monitoring_period_end: '2026-04-30',
  reduction_kgco2e: 23700, factors_snapshot: 'CEA 2025-v2', evidence_ids: ['ev-b', 'ev-a'],
  required_categories: ['meter_reading'], submitted_at: '2026-05-01T00:00:00Z',
  locked_at: '2026-05-10T00:00:00Z', sla_target_days: 7,
  hash_value: 'sha256-deadbeef', credential_id: null, anchored_at: null,
  hcs_topic_id: null, hcs_sequence_number: null,
};
const ev: EvidenceFile[] = [
  { id: 'ev-a', project_id: 'prj-x', parent_id: null, category: 'meter_reading', file_name: 'a.pdf', kind: 'pdf', file_size: 1, version_number: 1, status: 'active', content_hash: 'sha256-aaa', uploaded_by: 'u1', uploaded_by_name: 'O', uploaded_at: '2026-04-02T00:00:00Z' },
  { id: 'ev-b', project_id: 'prj-x', parent_id: null, category: 'utility_bill', file_name: 'b.pdf', kind: 'pdf', file_size: 1, version_number: 1, status: 'active', content_hash: 'sha256-bbb', uploaded_by: 'u1', uploaded_by_name: 'O', uploaded_at: '2026-04-02T00:00:00Z' },
];

describe('buildApprovalSubject', () => {
  it('maps verification + evidence into the schema subject, evidence sorted by id', () => {
    const s = buildApprovalSubject(v, ev);
    expect(s.verification_id).toBe('VR-T1');
    expect(s.reduction_tco2e).toBe(23.7);
    expect(s.package_hash).toBe('sha256-deadbeef');
    expect(s.evidence).toEqual([
      { id: 'ev-a', content_hash: 'sha256-aaa' },
      { id: 'ev-b', content_hash: 'sha256-bbb' },
    ]);
  });
});

describe('issueCredential', () => {
  it('is deterministic for the same inputs and embeds mock HCS coordinates', () => {
    const subject = buildApprovalSubject(v, ev);
    const a = issueCredential(subject, v.hash_value!, 7, DEFAULT_GUARDIAN_CONFIG, MRV_APPROVAL_SCHEMA_V1, '2026-05-10T00:00:00Z');
    const b = issueCredential(subject, v.hash_value!, 7, DEFAULT_GUARDIAN_CONFIG, MRV_APPROVAL_SCHEMA_V1, '2026-05-10T00:00:00Z');
    expect(a.id).toBe(b.id);
    expect(a.id.startsWith('urn:vc:')).toBe(true);
    expect(a.schema_id).toBe('mrv-approval-v1');
    expect(a.hcs.topic_id).toBe(DEFAULT_GUARDIAN_CONFIG.topic_id);
    expect(a.hcs.sequence_number).toBe(7);
    expect(a.hcs.explorer_url).toContain('/topic/' + DEFAULT_GUARDIAN_CONFIG.topic_id + '/message/7');
  });
});
