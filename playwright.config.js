import { defineConfig } from '@playwright/test';

// Electron end-to-end tests. These launch the real main process against the
// built renderer in dist/, so `npm run build` must run first (the test:e2e
// script chains it). Kept out of the tests/ unit directory because they use
// the Playwright runner, not node --test.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 45_000,
  expect: { timeout: 10_000 },
});
