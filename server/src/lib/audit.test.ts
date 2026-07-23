import { createHash } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setupTestDatabase, resetDatabase } from '../test/db.js';
import { expectedRowHash } from '../test/fixtures.js';
import { auditRowHash, writeAudit, auditCoreOf, type AuditActor } from './audit.js';

const actor: AuditActor = {
  userId: 'usr-test-1',
  role: 'esg_manager',
  org: 'org-0001',
  ip: '203.0.113.10',
};

function entry(action: 'PROJECT_CREATED' | 'PROJECT_UPDATED', entityId: string) {
  return {
    userId: actor.userId,
    role: actor.role,
    ip: actor.ip,
    action,
    entityType: 'project' as const,
    entityId,
    payload: { name: 'Rooftop A' },
    newValue: { name: 'Rooftop A' },
  };
}

describe('lib/audit', () => {
  describe('auditRowHash (SPA parity)', () => {
    it('matches an independent recomputation of the SPA recipe', () => {
      // shortHash((prev ?? '∅') + '|' + canonical(fields)) with canonical
      // sorting keys — recomputed here with node:crypto, not lib/hash.
      const expected =
        'sha256-' + createHash('sha256').update('∅|{"a":1,"b":"x"}', 'utf8').digest('hex');
      expect(auditRowHash(null, { b: 'x', a: 1 })).toBe(expected);
    });

    it('chains on the previous hash', () => {
      const first = auditRowHash(null, { a: 1 });
      const expected =
        'sha256-' + createHash('sha256').update(`${first}|{"a":1}`, 'utf8').digest('hex');
      expect(auditRowHash(first, { a: 1 })).toBe(expected);
    });
  });

  describe('writeAudit', () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      const url = await setupTestDatabase();
      prisma = new PrismaClient({ datasourceUrl: url });
      await resetDatabase(prisma);
    }, 60_000);

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('writes rows that chain and recompute from persisted data', async () => {
      const first = await prisma.$transaction((tx) => writeAudit(tx, entry('PROJECT_CREATED', 'prj-1')));
      const second = await prisma.$transaction((tx) => writeAudit(tx, entry('PROJECT_UPDATED', 'prj-1')));

      expect(first.prev_row_hash).toBeNull();
      expect(second.prev_row_hash).toBe(first.row_hash);

      // Recompute from what actually landed in the database.
      const stored = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
      expect(stored).toHaveLength(2);
      for (const row of stored) {
        expect(row.row_hash).toBe(expectedRowHash(row));
        expect(row.row_hash).toBe(auditRowHash(row.prev_row_hash, auditCoreOf(row)));
      }
    });

    it('rolls back with the enclosing transaction', async () => {
      const before = await prisma.auditLog.count();
      await expect(
        prisma.$transaction(async (tx) => {
          await writeAudit(tx, entry('PROJECT_CREATED', 'prj-rollback'));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await prisma.auditLog.count()).toBe(before);
    });

    it('never forks the chain under concurrent appends', async () => {
      await resetDatabase(prisma);
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          prisma.$transaction((tx) => writeAudit(tx, entry('PROJECT_UPDATED', `prj-${i}`))),
        ),
      );
      const rows = await prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
      expect(rows).toHaveLength(5);
      // Each row links to exactly its predecessor — a fork would repeat a prev hash.
      expect(rows[0]!.prev_row_hash).toBeNull();
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.prev_row_hash).toBe(rows[i - 1]!.row_hash);
      }
    });
  });
});
