import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { setupTestDatabase, resetDatabase } from '../../test/db.js';
import { auth, createOrg, createAdmin, registerUser } from '../../test/fixtures.js';
import { writeAudit } from '../../lib/audit.js';
import { buildApp } from '../../app.js';

/** All fields the audit serializer may expose — and nothing else. */
const PUBLIC_AUDIT_FIELDS = [
  'id', 'seq', 'user_id', 'user_role', 'action', 'entity_type', 'entity_id',
  'payload', 'previous_value', 'new_value', 'ip_address',
  'hcs_topic_id', 'hcs_sequence_number', 'created_at', 'row_hash', 'prev_row_hash',
].sort();

/** Rows seeded directly through writeAudit (plus 2 via the factors API). */
const SEEDED_PROJECT_ROWS = 60;

describe('audit module', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let esg: { id: string; token: string };
  let owner: { id: string; token: string };
  let admin: { id: string; token: string };
  let totalRows: number;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
    await createOrg(prisma);
    app = await buildApp({ prisma });
    esg = await registerUser(app, 'esg_manager');
    owner = await registerUser(app, 'project_owner');
    admin = await createAdmin(app, prisma);

    // Two rows through the real API (end-to-end chain writes)…
    for (const factor of [
      { country: 'TH', source: 'EGAT Grid', factor_kgco2e_per_kwh: 0.4999, effective_date: '2025-01-01' },
      { country: 'VN', source: 'EVN Grid', factor_kgco2e_per_kwh: 0.6789, effective_date: '2025-01-01' },
    ]) {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/factors', headers: auth(esg.token), payload: factor,
      });
      expect(res.statusCode).toBe(201);
    }

    // …and a bulk of PROJECT_UPDATED rows via writeAudit so the list has more
    // than the default page size. Chunked transactions: each append is three
    // DB roundtrips and the test DB may be remote.
    for (let chunk = 0; chunk < SEEDED_PROJECT_ROWS; chunk += 15) {
      await prisma.$transaction(
        async (tx) => {
          for (let i = chunk; i < Math.min(chunk + 15, SEEDED_PROJECT_ROWS); i++) {
            await writeAudit(tx, {
              userId: esg.id, role: 'esg_manager', ip: null,
              action: 'PROJECT_UPDATED', entityType: 'project', entityId: `proj-${i}`,
              payload: { i },
            });
          }
        },
        { timeout: 30_000 },
      );
    }
    totalRows = await prisma.auditLog.count();
    expect(totalRows).toBe(SEEDED_PROJECT_ROWS + 2);
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /api/v1/audit', () => {
    it('requires auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/audit' });
      expect(res.statusCode).toBe(401);
    });

    it('rejects project owners (admin/esg only)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/audit', headers: auth(owner.token) });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('returns entries ordered seq DESC with the default limit of 50', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/audit', headers: auth(esg.token) });
      expect(res.statusCode).toBe(200);
      const entries = res.json().entries as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(50); // totalRows (62) > default limit
      const seqs = entries.map((e) => e.seq as number);
      expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
    });

    it('serializes seq as a JSON number and exposes exactly the allowlisted fields', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/audit?limit=1', headers: auth(admin.token) });
      expect(res.statusCode).toBe(200);
      const entry = res.json().entries[0] as Record<string, unknown>;
      expect(typeof entry.seq).toBe('number');
      expect(Number.isSafeInteger(entry.seq)).toBe(true);
      expect(Object.keys(entry).sort()).toEqual(PUBLIC_AUDIT_FIELDS);
      expect(entry.row_hash).toMatch(/^sha256-/);
      expect(typeof entry.created_at).toBe('string');
    });

    it('respects an explicit limit and rejects limits outside 1..200', async () => {
      const ok = await app.inject({ method: 'GET', url: '/api/v1/audit?limit=5', headers: auth(esg.token) });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().entries).toHaveLength(5);

      for (const bad of ['0', '201', '-1', 'lots']) {
        const res = await app.inject({
          method: 'GET', url: `/api/v1/audit?limit=${bad}`, headers: auth(esg.token),
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('paginates with the before_seq cursor: no overlap, descending continuation', async () => {
      const page1 = await app.inject({ method: 'GET', url: '/api/v1/audit?limit=10', headers: auth(esg.token) });
      const first = page1.json().entries as Array<{ seq: number }>;
      const cursor = first[first.length - 1]!.seq;

      const page2 = await app.inject({
        method: 'GET', url: `/api/v1/audit?limit=10&before_seq=${cursor}`, headers: auth(esg.token),
      });
      expect(page2.statusCode).toBe(200);
      const second = page2.json().entries as Array<{ seq: number }>;
      expect(second).toHaveLength(10);
      expect(Math.max(...second.map((e) => e.seq))).toBeLessThan(cursor);

      const ids1 = new Set(first.map((e) => e.seq));
      expect(second.some((e) => ids1.has(e.seq))).toBe(false);
    });

    it('rejects a malformed before_seq', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/audit?before_seq=abc', headers: auth(esg.token),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('filters by action and entity_type', async () => {
      const byAction = await app.inject({
        method: 'GET', url: '/api/v1/audit?action=EMISSION_FACTOR_ADDED&limit=200', headers: auth(esg.token),
      });
      const factorRows = byAction.json().entries as Array<{ action: string }>;
      expect(factorRows).toHaveLength(2);
      expect(factorRows.every((e) => e.action === 'EMISSION_FACTOR_ADDED')).toBe(true);

      const byType = await app.inject({
        method: 'GET', url: '/api/v1/audit?entity_type=project&limit=200', headers: auth(esg.token),
      });
      const projectRows = byType.json().entries as Array<{ entity_type: string }>;
      expect(projectRows).toHaveLength(SEEDED_PROJECT_ROWS);
      expect(projectRows.every((e) => e.entity_type === 'project')).toBe(true);
    });
  });

  describe('GET /api/v1/audit/verify', () => {
    it('requires auth and the admin/esg role', async () => {
      const anon = await app.inject({ method: 'GET', url: '/api/v1/audit/verify' });
      expect(anon.statusCode).toBe(401);
      const forbidden = await app.inject({
        method: 'GET', url: '/api/v1/audit/verify', headers: auth(owner.token),
      });
      expect(forbidden.statusCode).toBe(403);
    });

    it('walks the whole chain and reports it intact', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/audit/verify', headers: auth(admin.token) });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, checked: totalRows });
    });

    // The two tests below break the chain ON PURPOSE — they must run last.
    it('detects a tampered row (raw UPDATE) and reports its seq', async () => {
      const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' }, select: { seq: true } });
      const midIndex = Math.floor(rows.length / 2);
      const midSeq = rows[midIndex]!.seq;

      // Bypass the service layer entirely — simulate an attacker editing history.
      await prisma.$executeRaw`UPDATE audit_log SET new_value = '{"hacked":true}'::jsonb WHERE seq = ${midSeq}`;

      const res = await app.inject({ method: 'GET', url: '/api/v1/audit/verify', headers: auth(esg.token) });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        ok: false,
        checked: midIndex, // rows confirmed intact before the break
        broken_at_seq: Number(midSeq),
      });
    });

    it('detects a deleted row via the prev_row_hash link of its successor', async () => {
      const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' }, select: { seq: true } });
      const victimIndex = 5; // well before the row tampered above
      await prisma.auditLog.delete({ where: { seq: rows[victimIndex]!.seq } });

      const res = await app.inject({ method: 'GET', url: '/api/v1/audit/verify', headers: auth(esg.token) });
      expect(res.json()).toEqual({
        ok: false,
        checked: victimIndex, // the successor no longer links to its predecessor
        broken_at_seq: Number(rows[victimIndex + 1]!.seq),
      });
    });
  });
});
