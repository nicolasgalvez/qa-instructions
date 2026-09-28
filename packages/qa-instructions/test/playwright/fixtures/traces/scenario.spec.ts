import { test, expect } from '@playwright/test';

// The Playwright test that recorded the committed sample traces. Regenerate
// with Playwright 1.63 for `v9.zip`, and with a Playwright build that writes
// trace format 10 (e.g. `@playwright/test@1.64.0-alpha-2026-09-26`) for
// `v10.zip`:
//
//   pnpm exec playwright install chromium
//   pnpm exec playwright test -c test/fixtures/traces
//   cp test-results/*/trace.zip test/fixtures/traces/v9.zip
//
// The page is green until the button is clicked, then red, so the moment a
// screenshot was taken is visible in its pixels.
const PAGE =
  'data:text/html,' +
  encodeURIComponent(`<!doctype html>
<body style="margin:0;background:#00aa00">
  <button style="position:absolute;left:40px;top:40px;width:120px;height:40px"
    onclick="document.body.style.background='#cc0000'">Paint</button>
  <label style="position:absolute;left:40px;top:120px">Name <input></label>
</body>`);

test('sample', async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole('button', { name: 'Paint' })).toBeVisible();
  await test.step('fill in the form', async () => {
    await page.getByLabel('Name').fill('Ada');
  });
  // A getter: in the trace, but hidden from reporters.
  expect(await page.getByRole('button').textContent()).toBe('Paint');
  await page.getByRole('button', { name: 'Paint' }).click();
  await page.keyboard.press('Tab');
});
