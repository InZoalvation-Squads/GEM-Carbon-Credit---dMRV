// Test-database bootstrap (convention from the Phase 1a plan):
// use `<main_db>_test`, created via the main (admin) connection on first run.
// If CREATE DATABASE is not permitted (SQLSTATE 42501), fall back to a
// `test_<runid>` schema inside the main database via Prisma's `?schema=`
// connection parameter. A drifted/baseline-less test DB (Prisma P3005) is
// dropped and recreated automatically before `migrate deploy`.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** SQLSTATE of a raw Prisma/Postgres error, if present. */
function sqlState(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const meta = (err as { meta?: { code?: unknown } }).meta;
  return typeof meta?.code === 'string' ? meta.code : undefined;
}

/** Everything an execSync failure can tell us, flattened for matching. */
function execErrorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as Error & { stdout?: Buffer | string; stderr?: Buffer | string };
  return [e.message, e.stdout?.toString() ?? '', e.stderr?.toString() ?? ''].join('\n');
}

function migrateDeploy(databaseUrl: string): void {
  execSync('npx prisma migrate deploy', {
    cwd: SERVER_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}

/**
 * Ensure the test database exists and is migrated; returns its DATABASE_URL.
 */
export async function setupTestDatabase(): Promise<string> {
  const mainUrl = new URL(config.DATABASE_URL);
  const mainDbName = decodeURIComponent(mainUrl.pathname.replace(/^\//, ''));
  const testDbName = `${mainDbName}_test`;

  const admin = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  try {
    let testUrl: string;
    let dedicatedDb = false;
    try {
      const rows = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${testDbName}`;
      if (rows.length === 0) {
        await admin.$executeRawUnsafe(`CREATE DATABASE "${testDbName}"`);
      }
      const url = new URL(config.DATABASE_URL);
      url.pathname = `/${testDbName}`;
      testUrl = url.toString();
      dedicatedDb = true;
    } catch (err) {
      // Only an insufficient-privilege failure (SQLSTATE 42501) means "fall
      // back to a schema inside the main DB" — anything else is a real
      // problem (connectivity, bad credentials, …): rethrow.
      if (sqlState(err) !== '42501') throw err;
      const url = new URL(config.DATABASE_URL);
      url.searchParams.set('schema', `test_${Date.now().toString(36)}`);
      testUrl = url.toString();
    }

    try {
      migrateDeploy(testUrl);
    } catch (err) {
      // P3005: the test DB has tables but no _prisma_migrations baseline
      // (created by an older run or by hand, or drifted). It holds disposable
      // test data only — drop and recreate it, then deploy fresh.
      if (!dedicatedDb || !execErrorText(err).includes('P3005')) throw err;
      await admin.$executeRawUnsafe(`DROP DATABASE "${testDbName}" WITH (FORCE)`);
      await admin.$executeRawUnsafe(`CREATE DATABASE "${testDbName}"`);
      migrateDeploy(testUrl);
    }
    return testUrl;
  } finally {
    await admin.$disconnect();
  }
}

/** Truncate every app table (everything but _prisma_migrations) for a clean slate. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename.replace(/"/g, '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
}
