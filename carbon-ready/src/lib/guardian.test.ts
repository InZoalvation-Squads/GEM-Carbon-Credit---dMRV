import { describe, it, expect } from 'vitest';
import { buildApprovalSubject, buildPddSubject, issueCredential, projectTopicId, toIpfsCid, DEFAULT_GUARDIAN_CONFIG } from './guardian';
import { MRV_APPROVAL_SCHEMA_V1 } from './guardian-schema';
import type { EvidenceFile, ProjectDesignDocument, VerificationRequest } from '../types';

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

describe('toIpfsCid', () => {
  it('is deterministic and CIDv1-shaped', () => {
    const a = toIpfsCid('sha256-0a1b2c3d4e5f…');
    expect(a).toBe(toIpfsCid('sha256-0a1b2c3d4e5f…'));
    expect(a).toMatch(/^bafkrei[0-9a-z]{20}$/);
  });

  it('differs for different hashes', () => {
    expect(toIpfsCid('sha256-aaaaaaaaaaaa…')).not.toBe(toIpfsCid('sha256-bbbbbbbbbbbb…'));
  });
});

describe('buildPddSubject', () => {
  const pdd = {
    id: 'PDD-X1', project_id: 'prj-1', methodology_id: 'meth-1',
    methodology_snapshot: 'T-VER-S 1.0', state: 'registered',
    section_data: {}, evidence_ids: ['ev-b', 'ev-a'],
    assigned_validator_name: 'V', submitted_at: null,
    validated_at: '2026-07-20T00:00:00Z', content_hash: 'sha256-cafe00000000…',
    ipfs_cid: null, credential_id: null,
  } as ProjectDesignDocument;

  it('includes only linked evidence sorted by id, plus hash + cid + snapshot + disclosure', () => {
    const s = buildPddSubject(pdd, ev, 'bafkreicafe', {
      disclosed: { technology: 'Solar PV' },
      redacted: [{ key: 'barrier_explanation', value_hash: 'sha256-xyz' }],
    });
    expect(s.disclosed).toEqual({ technology: 'Solar PV' });
    expect(s.redacted).toEqual([{ key: 'barrier_explanation', value_hash: 'sha256-xyz' }]);
    expect(s.pdd_id).toBe('PDD-X1');
    expect(s.project_id).toBe('prj-1');
    expect(s.methodology).toBe('T-VER-S 1.0');
    expect(s.content_hash).toBe('sha256-cafe00000000…');
    expect(s.ipfs_cid).toBe('bafkreicafe');
    expect(s.registered_at).toBe('2026-07-20T00:00:00Z');
    expect(s.evidence).toEqual([
      { id: 'ev-a', content_hash: 'sha256-aaa' },
      { id: 'ev-b', content_hash: 'sha256-bbb' },
    ]);
  });
});

describe('projectTopicId', () => {
  it('is deterministic and shaped like a Hedera topic id', () => {
    expect(projectTopicId('prj-0001')).toBe(projectTopicId('prj-0001'));
    expect(projectTopicId('prj-0001')).toMatch(/^0\.0\.481\d{3}$/);
  });

  it('differs across projects', () => {
    expect(projectTopicId('prj-0001')).not.toBe(projectTopicId('prj-0002'));
  });
});
