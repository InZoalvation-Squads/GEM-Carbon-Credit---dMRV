import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Demo mode is the deterministic default for the suite, even when the
    // developer's local .env sets VITE_API_BASE_URL. Server-mode tests opt in
    // per-test via vi.stubEnv('VITE_API_BASE_URL', ...).
    env: { VITE_API_BASE_URL: '' },
  },
});
