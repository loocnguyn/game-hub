import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Integration tests hit the real Supabase project: run with `npm run test:api`.
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'supabase/functions/_shared'),
    },
  },
  test: {
    include: ['tests/api/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
