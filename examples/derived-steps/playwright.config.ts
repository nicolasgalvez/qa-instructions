import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4321';

// Secrets beyond password fields to keep out of QA Instructions: here, the
// test accounts' email addresses.
const mask = [/[\w.+-]+@qa\.example\.com/];

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    // Default presentation of test.step groups: Sections.
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs', mask }],
    [
      '@qa-instructions/playwright/reporter',
      { outputDir: 'qa-runs/collapse', testSteps: 'collapse', mask },
    ],
    [
      '@qa-instructions/playwright/reporter',
      { outputDir: 'qa-runs/ignore', testSteps: 'ignore', mask },
    ],
  ],
  use: {
    baseURL,
    viewport: { width: 800, height: 600 },
    // Step Screenshots: one screen snapshot per action (Playwright 1.63+).
    // DOM snapshots let the reporter recognize password fields.
    trace: { mode: 'on', snapshots: { screen: true, dom: true } },
  },
  webServer: {
    command: 'pnpm --filter @qa-instructions/fixture-site dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
