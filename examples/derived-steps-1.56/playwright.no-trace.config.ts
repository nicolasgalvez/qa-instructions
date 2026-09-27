import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// The same run with the trace setting left out, as a developer might forget
// it; scripts/verify-no-trace.mjs checks the reporter still writes QA
// Instructions and warns once with the line to add.
export default defineConfig({
  ...base,
  outputDir: 'test-results/no-trace',
  reporter: [
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs-no-trace' }],
  ],
  use: { ...base.use, trace: 'off' },
});
