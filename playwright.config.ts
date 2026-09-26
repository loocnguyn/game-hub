import { defineConfig } from '@playwright/test';

// End-to-end tests against the local dev server (which talks to the real Supabase project).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '.tmp/e2e-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3100',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    screenshot: 'only-on-failure',
  },
  webServer: {
    // A dedicated port so another local dev server on :3000 is never tested by mistake.
    command: 'npx next dev -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
