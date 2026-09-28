import { test } from '@playwright/test';

// The Playwright test that recorded the committed sample trace `v9-dom.zip`,
// with DOM snapshots on (see password.config.ts). Regenerate with
// Playwright 1.63:
//
//   pnpm exec playwright test -c test/fixtures/traces/password.config.ts
//   cp test-results/*/trace.zip test/fixtures/traces/v9-dom.zip
//
// The DOM snapshots mark the element each Action touched, so the trace says
// which fills went into a password field.
const PAGE =
  'data:text/html,' +
  encodeURIComponent(`<!doctype html>
<body style="margin:0">
  <label>Name <input></label>
  <label>Password <input type="password"></label>
  <button>Sign in</button>
</body>`);

test('password', async ({ page }) => {
  await page.goto(PAGE);
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Password').fill('hunter2');
  await page.getByRole('button', { name: 'Sign in' }).click();
});
