import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import {
  auth,
  createOrg,
  createAdmin,
  registerUser,
  expectValidChainTail,
  latestAudit,
} from '../../test/fixtures.js';
import { buildApp } from '../../app.js';

const VALID_BODY = {
  country: 'TH',
  source: 'EGAT Grid',
  factor_kgco2e_per_kwh: 0.4999,
  effective_date: '2025-01-01',
};

describe('factors module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let esg: { id: string; token: string };
  let owner: { id: string; token: string };
  let admin: { id: string; token: string };

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await createOrg(prisma);
    app = await buildApp({ prisma });
    esg = await registerUser(app, 'esg_manager');
    owner = await registerUser(app, 'project_owner');
    admin = await createAdmin(app, prisma);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/factors', () => {
    it('requires auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/factors' });
      expect(res.statusCode).toBe(401);
    });

    it('returns the factor list', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/factors', headers: auth(owner.token) });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().factors)).toBe(true);
    });
  });

  describe('POST /api/v1/factors', () => {
    it('requires auth', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/factors', payload: VALID_BODY });
      expect(res.statusCode).toBe(401);
    });

    it('rejects project owners (admin/esg only)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/factors', headers: auth(owner.token), payload: VALID_BODY,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('rejects an invalid body', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/factors', headers: auth(esg.token),
        payload: { ...VALID_BODY, factor_kgco2e_per_kwh: -0.1, effective_date: 'yesterday' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('creates v1 as current and audits EMISSION_FACTOR_ADDED', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/factors', headers: auth(esg.token), payload: VALID_BODY,
      });
      expect(res.statusCode).toBe(201);
      const factor = res.json().factor;
      expect(factor).toMatchObject({ ...VALID_BODY, version: 1, is_current: true });
      expect(factor.id).toMatch(/^ef-/);

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        user_id: esg.id,
        action: 'EMISSION_FACTOR_ADDED',
        entity_type: 'factor',
        entity_id: factor.id,
        payload: { country: 'TH', source: 'EGAT Grid', version: 1 },
        new_value: { factor_kgco2e_per_kwh: 0.4999, version: 1 },
      });
      await expectValidChainTail(prisma);
    });

    it('bumps version and flips is_current for the same country+source (admin allowed)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/factors', headers: auth(admin.token),
        payload: { ...VALID_BODY, factor_kgco2e_per_kwh: 0.4712, effective_date: '2026-01-01' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().factor).toMatchObject({ version: 2, is_current: true });

      const all = await prisma.emissionFactor.findMany({
        where: { country: 'TH', source: 'EGAT Grid' },
        orderBy: { version: 'asc' },
      });
      expect(all.map((f) => [f.version, f.is_current])).toEqual([[1, false], [2, true]]);
      await expectValidChainTail(prisma);
    });

    it('serializes two parallel creates for the same pair: versions 2 and 3, exactly one current', async () => {
      const pair = { country: 'MY', source: 'TNB Grid' };
      const base = { ...pair, factor_kgco2e_per_kwh: 0.5, effective_date: '2025-01-01' };
      const first = await app.inject({
        method: 'POST', url: '/api/v1/factors', headers: auth(esg.token), payload: base,
      });
      expect(first.statusCode).toBe(201);

      const [a, b] = await Promise.all([
        app.inject({
          method: 'POST', url: '/api/v1/factors', headers: auth(esg.token),
          payload: { ...base, factor_kgco2e_per_kwh: 0.51 },
        }),
        app.inject({
          method: 'POST', url: '/api/v1/factors', headers: auth(admin.token),
          payload: { ...base, factor_kgco2e_per_kwh: 0.52 },
        }),
      ]);
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);

      const rows = await prisma.emissionFactor.findMany({
        where: pair, orderBy: { version: 'asc' },
      });
      expect(rows.map((f) => f.version)).toEqual([1, 2, 3]); // no duplicate versions
      expect(rows.filter((f) => f.is_current)).toHaveLength(1);
      expect(rows.find((f) => f.is_current)!.version).toBe(3); // last committed wins
    });

    it('versions independently per country+source pair', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/factors', headers: auth(esg.token),
        payload: { ...VALID_BODY, country: 'VN', source: 'EVN Grid' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().factor).toMatchObject({ version: 1, is_current: true });

      // TH v2 must still be current — the VN insert may not touch it.
      const th = await prisma.emissionFactor.findFirst({
        where: { country: 'TH', source: 'EGAT Grid', is_current: true },
      });
      expect(th!.version).toBe(2);
    });
  });
});
