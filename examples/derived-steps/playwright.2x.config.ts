import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// The moving-UI test on a high-DPI (2x) screen: Highlights must still line
// up with their elements.
export default defineConfig(base, {
  testMatch: 'moving-ui.spec.ts',
  reporter: [
    ['list'],
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs/2x' }],
  ],
  use: { deviceScaleFactor: 2 },
});
