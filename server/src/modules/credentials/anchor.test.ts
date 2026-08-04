import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import { anchorCredentialOnChain, ensureProjectTopic, anchorKindFor, ensureProjectToken, mintRealToken, anchorProjectListing } from './anchor.js';

vi.mock('../../lib/hedera.js', () => ({
  hederaEnabled: vi.fn(() => true),
  createProjectTopic: vi.fn(async () => '0.0.777001'),
  createProjectFungibleToken: vi.fn(async (_id: string, name: string) => { void name; return '0.0.888001'; }),
  mintVcuBatch: vi.fn(async (_t: string, units: number) => ({ serial_start: 101, serial_end: 100 + units, units })),
  anchorToTopic: vi.fn(async (topicId: string) => ({
    topic_id: topicId,
    sequence_number: 42,
    consensus_timestamp: '2026-08-04T00:00:00.000Z',
    explorer_url: `https://hashscan.io/testnet/topic/${topicId}/message/42`,
  })),
}));

import { createProjectTopic, createProjectFungibleToken, mintVcuBatch, anchorToTopic } from '../../lib/hedera.js';

let prisma: PrismaClient;

beforeAll(async () => {
  const url = await setupTestDatabase();
  prisma = new PrismaClient({ datasourceUrl: url });
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedProjectAndCredential() {
  await prisma.organization.create({ data: { id: 'org-1', name: 'Org', country: 'TH' } });
  await prisma.project.create({
    data: {
      id: 'prj-1', organization_id: 'org-1', name: 'P', location: 'TH',
      capacity_kwp: 100, commission_date: '2026-01-01',
      status: 'active', lifecycle_stage: 'registered',
    },
  });
  await prisma.credential.create({
    data: {
      id: 'urn:vc:test1', schema_id: 'pdd-registration-v1', project_id: 'prj-1',
      payload: {
        id: 'urn:vc:test1', schema_id: 'pdd-registration-v1',
        package_hash: `sha256-${'a'.repeat(64)}`,
        subject: { pdd_id: 'PDD-1', project_id: 'prj-1', ipfs_cid: 'bafkreitest' },
      },
    },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  vi.mocked(createProjectTopic).mockClear();
  vi.mocked(anchorToTopic).mockClear();
});

describe('anchorKindFor', () => {
  it('maps schema ids to anchor kinds', () => {
    expect(anchorKindFor('pdd-registration-v1')).toBe('pdd_registration');
    expect(anchorKindFor('mrv-approval-v1')).toBe('verification_approval');
  });
});

describe('ensureProjectTopic', () => {
  it('creates a topic once and reuses it afterwards', async () => {
    await seedProjectAndCredential();
    const first = await ensureProjectTopic(prisma, 'prj-1');
    const second = await ensureProjectTopic(prisma, 'prj-1');
    expect(first).toBe('0.0.777001');
    expect(second).toBe('0.0.777001');
    expect(createProjectTopic).toHaveBeenCalledTimes(1);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: 'prj-1' } });
    expect(project.hcs_topic_id).toBe('0.0.777001');
  });
});

describe('anchorProjectListing', () => {
  it('creates the project topic at submit time and anchors a project_listed message', async () => {
    await seedProjectAndCredential();
    const receipt = await anchorProjectListing(prisma, 'prj-1', 'PDD-1');
    expect(receipt).toMatchObject({ topic_id: '0.0.777001', sequence_number: 42 });
    expect(vi.mocked(anchorToTopic).mock.calls[0][1]).toEqual({
      v: 1, kind: 'project_listed', project_id: 'prj-1', pdd_id: 'PDD-1',
    });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: 'prj-1' } });
    expect(project.hcs_topic_id).toBe('0.0.777001');
    // resubmission after revision does NOT list again
    const again = await anchorProjectListing(prisma, 'prj-1', 'PDD-1');
    expect(again).toBeNull();
    expect(anchorToTopic).toHaveBeenCalledTimes(1);
  });
});

describe('anchorCredentialOnChain', () => {
  it('submits the anchor, stores the receipt, and is idempotent', async () => {
    await seedProjectAndCredential();
    const receipt = await anchorCredentialOnChain(prisma, 'urn:vc:test1');
    expect(receipt).toMatchObject({ topic_id: '0.0.777001', sequence_number: 42 });
    expect(vi.mocked(anchorToTopic).mock.calls[0][1]).toMatchObject({
      kind: 'pdd_registration',
      credential_id: 'urn:vc:test1',
      package_hash: `sha256-${'a'.repeat(64)}`,
      project_id: 'prj-1',
      ipfs_cid: 'bafkreitest',
    });
    const row = await prisma.credential.findUniqueOrThrow({ where: { id: 'urn:vc:test1' } });
    expect(row.anchor).toMatchObject({ topic_id: '0.0.777001', sequence_number: 42 });

    // second call returns the stored receipt without another HCS submit
    const again = await anchorCredentialOnChain(prisma, 'urn:vc:test1');
    expect(again).toMatchObject({ sequence_number: 42 });
    expect(anchorToTopic).toHaveBeenCalledTimes(1);
  });

  it('mintRealToken creates the PROJECT token (name = project name) and mints an HTS batch', async () => {
    await seedProjectAndCredential();
    await prisma.guardianToken.create({
      data: {
        id: 'token:sim:1', token_id: '0.0.480200', serial_number: 1,
        project_id: 'prj-1', credential_id: 'urn:vc:test1', amount_tco2e: 443,
        monitoring_period_start: '2026-01-01', monitoring_period_end: '2026-06-30',
        minted_by_role: 'admin',
        hcs: { topic_id: '0.0.480100', sequence_number: 1, explorer_url: 'sim' },
      },
    });
    const first = await ensureProjectToken(prisma, 'prj-1');
    const second = await ensureProjectToken(prisma, 'prj-1');
    expect(first).toBe('0.0.888001');
    expect(second).toBe('0.0.888001');
    expect(createProjectFungibleToken).toHaveBeenCalledTimes(1);
    // token name comes from the project row
    expect(vi.mocked(createProjectFungibleToken).mock.calls[0]).toEqual(['prj-1', 'P']);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: 'prj-1' } });
    expect(project.hts_token_id).toBe('0.0.888001');

    const minted = await mintRealToken(prisma, 'token:sim:1');
    // 443 tCO2e → 44300 units; first batch of this project
    expect(minted).toEqual({ token_id: '0.0.888001', serial_number: 1 });
    expect(vi.mocked(mintVcuBatch).mock.calls[0]).toEqual(['0.0.888001', 44300]);
    const row = await prisma.guardianToken.findUniqueOrThrow({ where: { id: 'token:sim:1' } });
    expect(row.token_id).toBe('0.0.888001');
    expect(row.serial_number).toBe(1);
    expect(row.batch).toMatchObject({ serial_start: 101, serial_end: 44400, units: 44300 });
  });

  it('propagates real coordinates onto an anchored verification row', async () => {
    await seedProjectAndCredential();
    await prisma.credential.update({
      where: { id: 'urn:vc:test1' },
      data: { schema_id: 'mrv-approval-v1' },
    });
    await prisma.verificationRequest.create({
      data: {
        id: 'ver-1', project_id: 'prj-1', state: 'approved',
        created_by: 'usr-1', owner_name: 'Owner', assigned_verifier_name: 'VVB',
        monitoring_period_start: '2026-01-01', monitoring_period_end: '2026-06-30',
        reduction_kgco2e: 100_000, factors_snapshot: 'EF', evidence_ids: [],
        required_categories: [], sla_target_days: 14,
        credential_id: 'urn:vc:test1',
        hcs_topic_id: '0.0.480100', hcs_sequence_number: 1, // simulated values
      },
    });
    await anchorCredentialOnChain(prisma, 'urn:vc:test1');
    const v = await prisma.verificationRequest.findUniqueOrThrow({ where: { id: 'ver-1' } });
    expect(v.hcs_topic_id).toBe('0.0.777001');
    expect(v.hcs_sequence_number).toBe(42);
  });
});
