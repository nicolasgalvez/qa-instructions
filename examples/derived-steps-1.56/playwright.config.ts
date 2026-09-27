import { defineConfig } from '@playwright/test';
import { fixtureOrigin } from '@qa-instructions/fixture-site/origin';

const baseURL = fixtureOrigin.url;

// As in derived-steps: the test accounts' email addresses are secrets too.
const mask = [/[\w.+-]+@qa\.example\.com/];

// The derived-steps tests (copied into ./tests by scripts/sync-specs.mjs),
// run on Playwright 1.56: step details come from step titles and Step
// Screenshots from the trace's screen recording.
export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs', mask }],
  ],
  use: {
    baseURL,
    viewport: { width: 800, height: 600 },
    // Step Screenshots before Playwright 1.63: the trace's screen recording.
    trace: 'on',
  },
  webServer: {
    command: 'pnpm --filter @qa-instructions/fixture-site dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
