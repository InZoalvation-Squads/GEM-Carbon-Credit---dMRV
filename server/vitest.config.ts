import { defineConfig } from 'vitest/config';

// Per-run test database suffix: two concurrent `npm test` runs (worktrees, CI
// shards) must not share one test DB. An explicit VITEST_DB_SUFFIX wins;
// otherwise the runner's pid namespaces this run. src/test/db.ts derives the
// DB name from it and the global teardown drops the per-run DB afterwards.
const dbSuffix = process.env.VITEST_DB_SUFFIX ?? `p${process.pid}`;
process.env.VITEST_DB_SUFFIX = dbSuffix; // for globalSetup (same process)

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Test files within a run share that run's database — keep them sequential.
    fileParallelism: false,
    env: { VITEST_DB_SUFFIX: dbSuffix }, // for test workers
    globalSetup: ['./src/test/global-setup.ts'],
  },
});
