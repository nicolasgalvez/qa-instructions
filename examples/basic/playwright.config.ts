import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['@procyon-creative/qa-instructions/playwright', { outputDir: 'qa-runs' }],
  ],
});
