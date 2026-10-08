import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import {
  auth,
  createAdmin,
  registerUser,
  expectValidChainTail,
  latestAudit,
} from '../../test/fixtures.js';
import { seed } from '../../../prisma/seed.js';
import { buildApp } from '../../app.js';

const SUMMARY_KEYS = ['id', 'code', 'name', 'standard', 'version', 'sectoral_scope', 'status'];

/** Export the seeded solar methodology and return its parsed document. */
async function exportSolarDoc(
  app: FastifyInstance,
  token: string,
): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/methodologies/meth-tver-solar/export',
    headers: auth(token),
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body) as Record<string, unknown>;
}

describe('methodologies module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let owner: { id: string; token: string };
  let admin: { id: string; token: string };

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    // Real seed: org-0001 + the 3 methodology documents (no demo users).
    await seed(prisma, {});
    app = await buildApp({ prisma });
    owner = await registerUser(app, 'project_owner');
    admin = await createAdmin(app, prisma);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/methodologies', () => {
    it('requires auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/methodologies' });
      expect(res.statusCode).toBe(401);
    });

    it('lists the 3 seeded methodologies as summaries (never the full document)', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/methodologies', headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(200);
      const list = res.json().methodologies as Array<Record<string, unknown>>;
      expect(list).toHaveLength(3);
      for (const m of list) {
        expect(Object.keys(m).sort()).toEqual([...SUMMARY_KEYS].sort());
      }
      const solar = list.find((m) => m.id === 'meth-tver-solar');
      expect(solar).toMatchObject({
        code: 'T-VER-S-METH-01-01',
        standard: 'T-VER',
        version: '03',
        sectoral_scope: '01 – Energy Industries',
        status: 'active',
      });
      // The document internals must never leak into the list.
      expect(solar).not.toHaveProperty('document');
      expect(solar).not.toHaveProperty('pdd_sections');
      expect(solar).not.toHaveProperty('monitoring_params');
    });
  });

  describe('GET /api/v1/methodologies/:id/export', () => {
    it('requires auth', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/methodologies/meth-tver-solar/export',
      });
      expect(res.statusCode).toBe(401);
    });

    it('404s on an unknown id', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/methodologies/meth-nope/export', headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    });

    it('returns the stored document verbatim as a JSON attachment', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/methodologies/meth-tver-solar/export',
        headers: auth(owner.token),
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      // SPA filename convention: leading "v" stripped from the version.
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="T-VER-S-METH-01-01-v03.json"',
      );
      const row = await prisma.methodology.findUniqueOrThrow({
        where: { id: 'meth-tver-solar' },
      });
      expect(JSON.parse(res.body)).toEqual(row.document);
      const doc = JSON.parse(res.body) as Record<string, unknown>;
      expect(doc.schema_version).toBe(2);
      expect(doc).not.toHaveProperty('id'); // id is never part of the document
    });
  });

  describe('POST /api/v1/methodologies/import', () => {
    it('requires auth', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import', payload: { schema_version: 2 },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects non-admins (Standard Registry only)', async () => {
      const doc = await exportSolarDoc(app, owner.token);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: auth(owner.token), payload: { ...doc, code: 'T-VER-S-42' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('roundtrips an export: changed code imports as a new methodology + audit row', async () => {
      const countBefore = await prisma.methodology.count();
      const { source_path: _src, ...doc } = await exportSolarDoc(app, admin.token);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: auth(admin.token), payload: { ...doc, code: 'T-VER-S-99' },
      });
      expect(res.statusCode).toBe(201);
      const m = res.json().methodology as Record<string, unknown>;
      expect(m.id).toMatch(/^mth-/);
      expect(m).toMatchObject({ code: 'T-VER-S-99', version: '03', standard: 'T-VER' });
      expect(Object.keys(m).sort()).toEqual([...SUMMARY_KEYS].sort());

      // Stored document is the methodologyToJson shape: schema_version + doc, no id.
      const row = await prisma.methodology.findUniqueOrThrow({ where: { id: m.id as string } });
      expect(row.document).toEqual({ ...doc, code: 'T-VER-S-99' });
      expect(await prisma.methodology.count()).toBe(countBefore + 1);

      const audit = await latestAudit(prisma);
      expect(audit).toMatchObject({
        user_id: admin.id,
        action: 'METHODOLOGY_IMPORTED',
        entity_type: 'methodology',
        entity_id: m.id,
        payload: { code: 'T-VER-S-99', version: '03' },
        new_value: { code: 'T-VER-S-99', version: '03' },
      });
      await expectValidChainTail(prisma);
    });

    it('strips source_path on import but keeps the usage note', async () => {
      const doc = await exportSolarDoc(app, admin.token);
      expect(doc).toMatchObject({
        usage: expect.any(String),
        source_path: 'carbon-ready/src/data/methodology-tver-solar.ts',
      });
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: auth(admin.token), payload: { ...doc, code: 'T-VER-S-96' },
      });
      expect(res.statusCode).toBe(201);
      const row = await prisma.methodology.findUniqueOrThrow({
        where: { id: res.json().methodology.id as string },
      });
      const stored = row.document as Record<string, unknown>;
      expect(stored).not.toHaveProperty('source_path');
      expect(stored.usage).toBe(doc.usage);
    });

    it('accepts the document as a JSON-encoded string body too', async () => {
      const doc = await exportSolarDoc(app, admin.token);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: { ...auth(admin.token), 'content-type': 'application/json' },
        // Body is the JSON encoding of a STRING whose content is the document.
        payload: JSON.stringify(JSON.stringify({ ...doc, code: 'T-VER-S-98' })),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().methodology.code).toBe('T-VER-S-98');
    });

    it('409s on a duplicate code+version', async () => {
      const doc = await exportSolarDoc(app, admin.token);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: auth(admin.token), payload: doc,
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toEqual({
        code: 'CONFLICT',
        message: 'Methodology T-VER-S-METH-01-01 03 is already in the library.',
      });
    });

    it('422s on an invalid document with the issue list capped at 3', async () => {
      // schema_version passes the gate; everything else is missing → 10 issues.
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: auth(admin.token), payload: { schema_version: 2 },
      });
      expect(res.statusCode).toBe(422);
      const { code, message } = res.json().error;
      expect(code).toBe('UNPROCESSABLE');
      expect(message).toMatch(/… and \d+ more issue\(s\)$/);
      // Capped: exactly 3 shown issues ("a; b; c … and N more issue(s)").
      expect(message.split('; ')).toHaveLength(3);
    });

    it('422s without the "more issues" suffix when there are 3 or fewer', async () => {
      const doc = await exportSolarDoc(app, admin.token);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: auth(admin.token), payload: { ...doc, code: 'T-VER-S-97', status: 'bogus' },
      });
      expect(res.statusCode).toBe(422);
      const { message } = res.json().error;
      expect(message).toMatch(/^status: /);
      expect(message).not.toMatch(/more issue/);
    });

    it('422s with a friendly message on the wrong schema_version', async () => {
      const doc = await exportSolarDoc(app, admin.token);
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: auth(admin.token), payload: { ...doc, schema_version: 1 },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toBe(
        'This file uses methodology format version 1; this app requires version 2.',
      );
    });

    it('rejects an invalid import without touching the library', async () => {
      // Capture-before / assert-unchanged: no dependence on how many docs
      // earlier tests happened to import.
      const countBefore = await prisma.methodology.count();
      const res = await app.inject({
        method: 'POST', url: '/api/v1/methodologies/import',
        headers: auth(admin.token), payload: { schema_version: 2 },
      });
      expect(res.statusCode).toBe(422);
      expect(await prisma.methodology.count()).toBe(countBefore);
    });
  });
});
