import { defineConfig } from '@playwright/test';

// Records the committed sample traces; see scenario.spec.ts.
export default defineConfig({
  testDir: '.',
  testMatch: 'scenario.spec.ts',
  reporter: 'list',
  use: {
    viewport: { width: 400, height: 300 },
    trace: {
      mode: 'on',
      snapshots: { screen: true },
      screenshots: false,
      sources: false,
    },
  },
});
