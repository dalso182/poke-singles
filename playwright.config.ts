import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

// Seed/cleanup scripts and DB assertions read the dev service-role creds.
dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: 'e2e',
  // The suite writes orders to the shared dev Supabase project — one worker
  // keeps stock/coupon assertions deterministic.
  workers: 1,
  fullyParallel: false,
  globalSetup: './e2e/global-setup',
  globalTeardown: './e2e/global-teardown',
  timeout: 60_000,
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4242',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4242',
    // Reuses an already-running `npm start` (and never tears it down);
    // Playwright only stops a server it spawned itself.
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
