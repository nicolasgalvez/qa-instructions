import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// Same run as playwright.config.ts, but only tests tagged `@qa` produce
// QA Instructions.
export default defineConfig(base, {
  testMatch: 'selection.spec.ts',
  reporter: [
    ['list'],
    [
      '@qa-instructions/playwright/reporter',
      { outputDir: 'qa-runs-selection', select: { tags: ['@qa'] } },
    ],
  ],
});
