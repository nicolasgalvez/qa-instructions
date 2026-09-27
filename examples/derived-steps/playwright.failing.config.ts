import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// Tests in ./failing-tests fail on purpose. This run is expected to exit
// non-zero; scripts/run-failing.mjs asserts that and keeps `pnpm e2e` green.
export default defineConfig({
  ...base,
  testDir: './failing-tests',
  outputDir: 'test-results/failing',
  retries: 1,
  expect: { timeout: 1_000 },
  use: { ...base.use, actionTimeout: 1_000 },
  reporter: [
    ['list'],
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs/failing' }],
  ],
});
