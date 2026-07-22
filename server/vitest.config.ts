import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Route tests share one test database — keep files sequential.
    fileParallelism: false,
  },
});
