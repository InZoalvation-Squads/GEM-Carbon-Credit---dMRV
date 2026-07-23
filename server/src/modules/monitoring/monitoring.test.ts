import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import {
  createOrg,
  registerUser,
  expectValidChainTail,
  latestAudit,
  TEST_ORG_ID,
} from '../../test/fixtures.js';
import { buildApp } from '../../app.js';
import { uid } from '../../lib/uid.js';

const ROWS = [
  { record_date: '2026-06-01', generation_kwh: 410.2 },
  { record_date: '2026-06-02', generation_kwh: 395.8 },
];

// Minimal schema-v2 methodology document — the monitoring service only reads
// `calculation.input_param` / `calculation.input_unit` (same fields the SPA
// stamps from). code/version deliberately differ from every seeded methodology
// so this fixture can never collide with seed.test.ts on unique(code, version)
// in the shared test database.
const METHODOLOGY_DOC = {
  schema_version: 2,
  code: 'T-VER-S-99',
  name: 'Solar (test fixture)',
  standard: 'T-VER',
  version: 'v0.0-test',
  status: 'active',
  calculation: { formula: 'grid_displacement', input_param: 'EG_PJ', input_unit: 'kWh' },
};

describe('monitoring module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let verifier: { id: string; token: string };
  let plainProjectId: string; // no PDD at all
  let registeredProjectId: string; // registered PDD → stamped uploads
  let draftPddProjectId: string; // draft PDD → NOT stamped

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function createProject(name: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: auth(owner.token),
      payload: { name, location: 'Bangkok, Thailand', capacity_kwp: 100, commission_date: '2024-01-01' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().project.id;
  }

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await createOrg(prisma);
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    verifier = await registerUser(app, 'verifier');

    plainProjectId = await createProject('No PDD');
    registeredProjectId = await createProject('Registered PDD');
    draftPddProjectId = await createProject('Draft PDD');

    // Methodology + PDD fixtures inserted directly (PDD endpoints are Task 7).
    const methodology = await prisma.methodology.create({
      data: {
        id: uid('mth'),
        code: METHODOLOGY_DOC.code,
        name: METHODOLOGY_DOC.name,
        standard: METHODOLOGY_DOC.standard,
        version: METHODOLOGY_DOC.version,
        status: 'active',
        document: METHODOLOGY_DOC,
      },
    });
    await prisma.pdd.create({
      data: {
        id: uid('PDD'),
        project_id: registeredProjectId,
        methodology_id: methodology.id,
        methodology_snapshot: `${METHODOLOGY_DOC.code} ${METHODOLOGY_DOC.version}`,
        state: 'registered',
        section_data: {},
        evidence_ids: [],
        assigned_validator_name: 'Daniel Okoye',
      },
    });
    await prisma.pdd.create({
      data: {
        id: uid('PDD'),
        project_id: draftPddProjectId,
        methodology_id: methodology.id,
        methodology_snapshot: '',
        state: 'draft',
        section_data: {},
        evidence_ids: [],
        assigned_validator_name: 'Daniel Okoye',
      },
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/projects/:id/monitoring', () => {
    it('requires auth', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/projects/${plainProjectId}/monitoring`, payload: { rows: ROWS },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects verifiers', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/projects/${plainProjectId}/monitoring`,
        headers: auth(verifier.token), payload: { rows: ROWS },
      });
      expect(res.statusCode).toBe(403);
    });

    it('404s (envelope) on a missing project', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/projects/prj-nope/monitoring',
        headers: auth(owner.token), payload: { rows: ROWS },
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toEqual({ code: 'NOT_FOUND', message: 'Project not found' });
    });

    it('rejects invalid rows (negative kWh, bad date, empty array)', async () => {
      for (const rows of [
        [{ record_date: '2026-06-01', generation_kwh: -1 }],
        [{ record_date: 'June 1st', generation_kwh: 10 }],
        [],
      ]) {
        const res = await app.inject({
          method: 'POST', url: `/api/v1/projects/${plainProjectId}/monitoring`,
          headers: auth(owner.token), payload: { rows },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('bulk-inserts unstamped rows for a project without a registered PDD and audits CSV_UPLOADED', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/projects/${plainProjectId}/monitoring`,
        headers: auth(owner.token), payload: { rows: ROWS },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ accepted: 2 });

      const records = await prisma.monitoringRecord.findMany({
        where: { project_id: plainProjectId }, orderBy: { record_date: 'asc' },
      });
      expect(records).toHaveLength(2);
      for (const r of records) {
        expect(r.source).toBe('csv_upload');
        expect(r.param_key).toBeNull();
        expect(r.unit).toBeNull();
        expect(r.id).toMatch(/^mon-/);
      }

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        user_id: owner.id,
        action: 'CSV_UPLOADED',
        entity_type: 'monitoring',
        entity_id: plainProjectId,
        payload: { accepted: 2, rejected: 0 },
      });
      await expectValidChainTail(prisma);
    });

    it('stamps param_key/unit from the methodology when the PDD is registered', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/projects/${registeredProjectId}/monitoring`,
        headers: auth(owner.token), payload: { rows: ROWS },
      });
      expect(res.statusCode).toBe(201);

      const records = await prisma.monitoringRecord.findMany({ where: { project_id: registeredProjectId } });
      expect(records).toHaveLength(2);
      for (const r of records) {
        expect(r.param_key).toBe('EG_PJ');
        expect(r.unit).toBe('kWh');
      }
    });

    it('does NOT stamp when the PDD is still a draft (same rule as the SPA)', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/projects/${draftPddProjectId}/monitoring`,
        headers: auth(owner.token), payload: { rows: [ROWS[0]!] },
      });
      expect(res.statusCode).toBe(201);
      const records = await prisma.monitoringRecord.findMany({ where: { project_id: draftPddProjectId } });
      expect(records).toHaveLength(1);
      expect(records[0]!.param_key).toBeNull();
      expect(records[0]!.unit).toBeNull();
    });
  });

  describe('GET /api/v1/projects/:id/monitoring', () => {
    it('requires auth and 404s on a missing project', async () => {
      const noAuth = await app.inject({ method: 'GET', url: `/api/v1/projects/${plainProjectId}/monitoring` });
      expect(noAuth.statusCode).toBe(401);
      const missing = await app.inject({
        method: 'GET', url: '/api/v1/projects/prj-nope/monitoring', headers: auth(owner.token),
      });
      expect(missing.statusCode).toBe(404);
    });

    it('lists records; verifiers may read', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/projects/${plainProjectId}/monitoring`, headers: auth(verifier.token),
      });
      expect(res.statusCode).toBe(200);
      const records = res.json().records;
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        project_id: plainProjectId, record_date: '2026-06-01', generation_kwh: 410.2, source: 'csv_upload',
      });
    });

    it('filters by from/to (inclusive)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${plainProjectId}/monitoring?from=2026-06-02&to=2026-06-30`,
        headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().records.map((r: { record_date: string }) => r.record_date)).toEqual(['2026-06-02']);

      const none = await app.inject({
        method: 'GET',
        url: `/api/v1/projects/${plainProjectId}/monitoring?to=2026-05-31`,
        headers: auth(owner.token),
      });
      expect(none.json().records).toEqual([]);
    });
  });
});
