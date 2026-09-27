import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4321';

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    // Default presentation of test.step groups: Sections.
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs' }],
    [
      '@qa-instructions/playwright/reporter',
      { outputDir: 'qa-runs/collapse', testSteps: 'collapse' },
    ],
    [
      '@qa-instructions/playwright/reporter',
      { outputDir: 'qa-runs/ignore', testSteps: 'ignore' },
    ],
  ],
  use: {
    baseURL,
    viewport: { width: 800, height: 600 },
    // Step Screenshots: one screen snapshot per action (Playwright 1.63+).
    trace: { mode: 'on', snapshots: { screen: true } },
  },
  webServer: {
    command: 'pnpm --filter @qa-instructions/fixture-site dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
