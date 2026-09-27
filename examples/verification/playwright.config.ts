import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4321';

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['@qa-instructions/playwright/reporter', { outputDir: 'qa-runs' }],
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
