import { defineConfig } from '@playwright/test';

// Records the committed sample trace for element names; see names.spec.ts.
export default defineConfig({
  testDir: '.',
  testMatch: 'names.spec.ts',
  reporter: 'list',
  use: {
    viewport: { width: 400, height: 300 },
    trace: {
      mode: 'on',
      snapshots: { screen: false, dom: true },
      screenshots: false,
      sources: false,
    },
  },
});
