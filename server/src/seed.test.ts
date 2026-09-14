import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { setupTestDatabase, resetDatabase } from './test/db.js';
import { seed } from '../prisma/seed.js';

const TEST_PASSWORD = 'test-demo-password';

async function tableCounts(prisma: PrismaClient) {
  return {
    organizations: await prisma.organization.count(),
    users: await prisma.user.count(),
    emission_factors: await prisma.emissionFactor.count(),
    methodologies: await prisma.methodology.count(),
  };
}

describe('prisma seed', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const url = await setupTestDatabase();
    prisma = new PrismaClient({ datasourceUrl: url });
    await resetDatabase(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds org, 4 demo users, 4 factors, 10 methodologies — and is idempotent', async () => {
    await seed(prisma, { demoSeedPassword: TEST_PASSWORD });
    const first = await tableCounts(prisma);
    expect(first).toEqual({
      organizations: 1,
      users: 4,
      emission_factors: 4,
      methodologies: 10,
    });

    // Second run must not duplicate or fail (upsert semantics).
    await seed(prisma, { demoSeedPassword: TEST_PASSWORD });
    expect(await tableCounts(prisma)).toEqual(first);
    // Two full seed runs (8 argon2 hashes) can exceed vitest's 5s default.
  }, 30_000);

  it('stores argon2 password hashes that verify against the demo password', async () => {
    const user = await prisma.user.findUnique({ where: { email: 'registry@gem.demo' } });
    expect(user).not.toBeNull();
    expect(user!.role).toBe('admin');
    await expect(argon2.verify(user!.password_hash, TEST_PASSWORD)).resolves.toBe(true);
  });

  it('stores the full schema-v2 methodology documents keyed by SPA ids', async () => {
    const solar = await prisma.methodology.findUnique({ where: { id: 'meth-tver-solar' } });
    expect(solar).not.toBeNull();
    expect(solar!.code).toBe('T-VER-S-METH-01-01');
    const doc = solar!.document as Record<string, unknown>;
    expect(doc.schema_version).toBe(2);
    expect(doc.code).toBe('T-VER-S-METH-01-01');
    expect(Array.isArray(doc.pdd_sections)).toBe(true);
    // code+version unique constraint is live
    const dupCheck = await prisma.methodology.count({ where: { code: 'T-VER-S-METH-01-01' } });
    expect(dupCheck).toBe(1);
  });

  it('skips demo users entirely when no demo password is provided', async () => {
    await resetDatabase(prisma);
    await seed(prisma, {});
    expect(await prisma.user.count()).toBe(0);
    // everything else still seeds
    expect(await tableCounts(prisma)).toEqual({
      organizations: 1,
      users: 0,
      emission_factors: 4,
      methodologies: 10,
    });
  });
});
