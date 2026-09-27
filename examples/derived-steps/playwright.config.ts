import { defineConfig } from '@playwright/test';
import { fixtureOrigin } from '@qa-instructions/fixture-site/origin';

const baseURL = fixtureOrigin.url;

// Secrets beyond password fields to keep out of QA Instructions: here, the
// test accounts' email addresses.
const mask = [/[\w.+-]+@qa\.example\.com/];

/** One reporter per Highlight style, for the moving-UI test only. */
const highlightStyles = [
  'outline',
  'clickDot',
  'badge',
  'spotlight',
  'none',
] as const;

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
    ...highlightStyles.map(
      (highlight) =>
        [
          '@qa-instructions/playwright/reporter',
          {
            outputDir: `qa-runs/styles/${highlight}`,
            highlight,
            select: { files: ['moving-ui.spec.ts'] },
          },
        ] as const,
    ),
  ],
  use: {
    baseURL,
    viewport: { width: 800, height: 600 },
    // Step Screenshots: one screen snapshot per action (Playwright 1.63+).
    // DOM snapshots let the reporter recognize password fields and name
    // elements found by test id or CSS selector.
    trace: { mode: 'on', snapshots: { screen: true, dom: true } },
  },
  webServer: {
    command: 'pnpm --filter @qa-instructions/fixture-site dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
