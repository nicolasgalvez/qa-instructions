import { defineConfig } from '@playwright/test';
import { fixtureOrigin } from '@qa-instructions/fixture-site/origin';

const baseURL = fixtureOrigin.url;

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    // The reporter writes qa-runs/<test>/qa-steps.txt itself; no render step.
    ['@procyon-creative/qa-instructions/playwright', { outputDir: 'qa-runs' }],
  ],
  use: {
    baseURL,
    viewport: { width: 800, height: 600 },
  },
  webServer: {
    command: 'pnpm --filter @qa-instructions/fixture-site dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
