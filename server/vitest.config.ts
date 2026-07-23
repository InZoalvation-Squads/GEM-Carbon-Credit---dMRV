import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// Per-run test database suffix: two concurrent `npm test` runs (worktrees, CI
// shards) must not share one test DB. An explicit VITEST_DB_SUFFIX wins;
// otherwise the runner's pid namespaces this run. src/test/db.ts derives the
// DB name from it and the global teardown drops the per-run DB afterwards.
const dbSuffix = process.env.VITEST_DB_SUFFIX ?? `p${process.pid}`;
process.env.VITEST_DB_SUFFIX = dbSuffix; // for globalSetup (same process)

// Evidence blobs written by tests go to a per-run temp dir, never the real
// STORAGE_DIR. The prefix is load-bearing: evidence.test.ts only rm -rf's the
// dir in afterAll when the basename carries it (guard against a real dir).
const storageDir = join(tmpdir(), `carbon-ready-test-storage-${dbSuffix}`);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Test files within a run share that run's database — keep them sequential.
    fileParallelism: false,
    env: { VITEST_DB_SUFFIX: dbSuffix, STORAGE_DIR: storageDir }, // for test workers
    globalSetup: ['./src/test/global-setup.ts'],
  },
});
