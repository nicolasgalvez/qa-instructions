import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// Records the Playwright 1.63 step dumps the adapter's unit tests compare
// with 1.56; run by examples/derived-steps-1.56/scripts/record-fixtures.mjs.
export default defineConfig({
  ...base,
  testIgnore: 'selection.spec.ts',
  outputDir: 'test-results/record',
  reporter: [
    ['list'],
    [
      '../../packages/playwright/test/fixtures/steps/step-dump-reporter.mjs',
      { outputDir: '../../packages/playwright/test/fixtures/steps/1.63' },
    ],
  ],
});
