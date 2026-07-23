// Vitest globalSetup. No up-front work — each test file bootstraps the test
// database lazily via setupTestDatabase() — but the teardown drops this run's
// per-pid database (best effort) so concurrent/repeated runs don't accumulate.
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { testDatabaseName } from './db.js';

export async function setup(): Promise<void> {
  // intentionally empty
}

export async function teardown(): Promise<void> {
  // Without a suffix we are on the shared default DB — keep it warm.
  if (!process.env.VITEST_DB_SUFFIX) return;
  const name = testDatabaseName();
  const admin = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } catch {
    // Best effort — a leaked per-pid test DB is harmless and uniquely named.
  } finally {
    await admin.$disconnect();
  }
}
