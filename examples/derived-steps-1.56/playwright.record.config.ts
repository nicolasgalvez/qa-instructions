import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// Records the Playwright 1.56 fixtures of the adapter's unit tests; see
// scripts/record-fixtures.mjs.
export default defineConfig({
  ...base,
  outputDir: 'test-results/record',
  reporter: [
    ['list'],
    [
      '../../packages/qa-instructions/test/playwright/fixtures/steps/step-dump-reporter.mjs',
      {
        outputDir:
          '../../packages/qa-instructions/test/playwright/fixtures/steps/1.56',
      },
    ],
  ],
  projects: [
    {
      name: 'steps',
      testDir: './tests',
      // The cart test's trace is kept as traces/v8-checks.zip; the adapter
      // reads only its events.
      use: { trace: { mode: 'on', sources: false, screenshots: false } },
    },
    {
      // The trace adapter's sample scenario, recorded as trace format 8.
      name: 'trace',
      testDir: './trace-scenario',
      use: {
        viewport: { width: 400, height: 300 },
        trace: { mode: 'on', sources: false },
      },
    },
  ],
});
