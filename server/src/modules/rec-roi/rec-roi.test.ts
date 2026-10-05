import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import { auth, createAdmin, createOrg, registerUser, expectValidChainTail, latestAudit } from '../../test/fixtures.js';
import { seed } from '../../../prisma/seed.js';
import { buildApp } from '../../app.js';

const VALID = {
  price_low_thb: 20, price_mid_thb: 25, price_high_thb: 30,
  price_source: 'ใบเสนอซื้อ บริษัททดสอบ 2026-09',
  platform_fee_pct: 10, eur_thb: 38.12, eur_thb_source: 'manual', horizon_years: 5,
};

describe('rec-roi module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let esg: { id: string; token: string };
  let verifier: { id: string; token: string };
  let admin: { id: string; token: string };
  let projectId: string;
  const otherOrgProjectId = 'prj-other-org-roi';

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await seed(prisma, {});
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    esg = await registerUser(app, 'esg_manager');
    verifier = await registerUser(app, 'verifier');
    admin = await createAdmin(app, prisma);

    const res = await app.inject({
      method: 'POST', url: '/api/v1/projects', headers: auth(owner.token),
      payload: { name: 'ROI Rooftop', location: 'Bangkok, Thailand', capacity_kwp: 500, commission_date: '2024-06-01' },
    });
    projectId = res.json().project.id as string;

    await createOrg(prisma, 'org-0002', 'Other Org');
    await prisma.project.create({
      data: {
        id: otherOrgProjectId, organization_id: 'org-0002', name: 'Foreign', location: 'Chiang Mai, Thailand',
        capacity_kwp: 100, commission_date: '2024-01-01', status: 'active', lifecycle_stage: 'registered',
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET settings returns all-null defaults before anything is saved', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/rec-roi/settings', headers: auth(esg.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toEqual({
      price_low_thb: null, price_mid_thb: null, price_high_thb: null, price_source: '',
      platform_fee_pct: null, eur_thb: null, eur_thb_source: '', horizon_years: 5,
      updated_by: null, updated_at: null,
    });
  });

  it('esg_manager saves settings; audit row written and chain valid', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/rec-roi/settings', headers: auth(esg.token), payload: VALID });
    expect(res.statusCode).toBe(200);
    const s = res.json().settings;
    expect(s).toMatchObject(VALID);
    expect(s.updated_by).toBe('Test esg_manager');
    expect(typeof s.updated_at).toBe('string');

    const row = await latestAudit(prisma);
    expect(row.action).toBe('REC_ROI_SETTINGS_UPDATED');
    expect(row.entity_type).toBe('rec_roi');
    await expectValidChainTail(prisma);

    const again = await app.inject({ method: 'GET', url: '/api/v1/rec-roi/settings', headers: auth(owner.token) });
    expect(again.json().settings).toMatchObject(VALID); // project_owner can read
  });

  it('admin may also save settings (upsert updates the same row)', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/rec-roi/settings', headers: auth(admin.token),
      payload: { ...VALID, price_mid_thb: 26 },
    });
    expect(res.statusCode).toBe(200);
    expect(await prisma.recRoiSettings.count()).toBe(1);
  });

  it('rejects mis-ordered prices', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/rec-roi/settings', headers: auth(esg.token),
      payload: { ...VALID, price_low_thb: 30, price_high_thb: 20 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a price without a source', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/rec-roi/settings', headers: auth(esg.token),
      payload: { ...VALID, price_source: '  ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('project_owner cannot write org settings', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/rec-roi/settings', headers: auth(owner.token), payload: VALID });
    expect(res.statusCode).toBe(403);
  });

  it('verifier is forbidden on every rec-roi route', async () => {
    const calls = [
      { method: 'GET' as const, url: '/api/v1/rec-roi/settings' },
      { method: 'GET' as const, url: '/api/v1/rec-roi/project-settings' },
      { method: 'PUT' as const, url: `/api/v1/projects/${projectId}/rec-roi-setting`, payload: { issuance_type: 'Normal', digital_meter_exempt: false, investment_mthb: null } },
      { method: 'GET' as const, url: '/api/v1/fx/eur-thb' },
    ];
    for (const c of calls) {
      const res = await app.inject({ ...c, headers: auth(verifier.token) });
      expect(res.statusCode, `${c.method} ${c.url}`).toBe(403);
    }
  });

  it('project_owner upserts a project setting; it is listed for the org', async () => {
    const put = await app.inject({
      method: 'PUT', url: `/api/v1/projects/${projectId}/rec-roi-setting`, headers: auth(owner.token),
      payload: { issuance_type: 'Self consumption', digital_meter_exempt: false, investment_mthb: 12.5 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().project_setting).toMatchObject({
      project_id: projectId, issuance_type: 'Self consumption', digital_meter_exempt: false, investment_mthb: 12.5,
    });
    expect((await latestAudit(prisma)).action).toBe('REC_ROI_PROJECT_UPDATED');

    const list = await app.inject({ method: 'GET', url: '/api/v1/rec-roi/project-settings', headers: auth(esg.token) });
    expect(list.json().project_settings.map((p: { project_id: string }) => p.project_id)).toEqual([projectId]);
  });

  it("another org's project is indistinguishable from a missing one", async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/projects/${otherOrgProjectId}/rec-roi-setting`, headers: auth(owner.token),
      payload: { issuance_type: 'Normal', digital_meter_exempt: false, investment_mthb: null },
    });
    expect(res.statusCode).toBe(404);
  });

  it('rejects an unknown issuance type', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/projects/${projectId}/rec-roi-setting`, headers: auth(owner.token),
      payload: { issuance_type: 'Bulk', digital_meter_exempt: false, investment_mthb: null },
    });
    expect(res.statusCode).toBe(400);
  });

  it('FX endpoint is dormant without BOT_API_TOKEN', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/fx/eur-thb', headers: auth(esg.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ available: false });
  });
});
