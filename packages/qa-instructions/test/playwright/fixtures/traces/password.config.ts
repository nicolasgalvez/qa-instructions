import { defineConfig } from '@playwright/test';

// Records the committed sample trace with DOM snapshots; see password.spec.ts.
export default defineConfig({
  testDir: '.',
  testMatch: 'password.spec.ts',
  reporter: 'list',
  use: {
    viewport: { width: 400, height: 300 },
    trace: {
      mode: 'on',
      snapshots: { screen: true, dom: true },
      screenshots: false,
      sources: false,
    },
  },
});
