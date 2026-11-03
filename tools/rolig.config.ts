// Egen opsætning til Rolig-gennemgangen, så den ikke kører med de almindelige
// tests (e2e/). Se tools/rolig-gennemgang.spec.ts.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'rolig-gennemgang.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
  },
});
