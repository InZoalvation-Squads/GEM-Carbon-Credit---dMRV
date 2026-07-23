// Test-database bootstrap (convention from the Phase 1a plan):
// use `<main_db>_test`, created via the main (admin) connection on first run.
// If CREATE DATABASE is not permitted, fall back to a `test_<runid>` schema
// inside the main database via Prisma's `?schema=` connection parameter.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Ensure the test database exists and is migrated; returns its DATABASE_URL.
 */
export async function setupTestDatabase(): Promise<string> {
  const mainUrl = new URL(config.DATABASE_URL);
  const mainDbName = decodeURIComponent(mainUrl.pathname.replace(/^\//, ''));
  const testDbName = `${mainDbName}_test`;

  let testUrl: string;
  const admin = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  try {
    const rows = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${testDbName}`;
    if (rows.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${testDbName}"`);
    }
    const url = new URL(config.DATABASE_URL);
    url.pathname = `/${testDbName}`;
    testUrl = url.toString();
  } catch {
    // No CREATE DATABASE right — fall back to an isolated schema in the main DB.
    const url = new URL(config.DATABASE_URL);
    url.searchParams.set('schema', `test_${Date.now().toString(36)}`);
    testUrl = url.toString();
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: SERVER_ROOT,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });
  return testUrl;
}

/** Truncate every app table (not _prisma_migrations) for a clean slate. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_log, guardian_tokens, credentials, pdds, methodologies,
      verification_comments, verification_requests, evidence_files,
      emission_factors, monitoring_records, projects, users, organizations
    CASCADE
  `);
}
