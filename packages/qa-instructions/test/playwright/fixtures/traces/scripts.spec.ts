import { test, expect } from '@playwright/test';

// The Playwright test that recorded the committed sample traces of scripts
// and forced Actions: `v9-scripts.zip` with Playwright 1.63 and DOM
// snapshots on (see scripts.config.ts):
//
//   pnpm exec playwright test -c test/fixtures/traces/scripts.config.ts
//   cp test-results/*/trace.zip test/fixtures/traces/v9-scripts.zip
//
// and `v8-scripts.zip` with Playwright 1.56 (see
// examples/derived-steps-1.56/scripts/record-fixtures.mjs).
//
// Each script either changes the page or leaves it as it was, whatever the
// test does with its result, and the forced click's options are built away
// from the call.
const PAGE =
  'data:text/html,' +
  encodeURIComponent(`<!doctype html>
<body style="margin:0">
  <details><summary>Shipping</summary><p>Orders ship in 2 days.</p></details>
  <p id="note" hidden>Saved</p>
  <button onclick="document.getElementById('note').hidden = false">Save</button>
</body>`);

test('scripts', async ({ page }) => {
  await page.goto(PAGE);
  // Reads the page; its result is used.
  const sections = await page
    .locator('details')
    .evaluateAll((els) => els.length);
  expect(sections).toBe(1);
  // Discarded, and the page is already at the top: changes nothing.
  await page.evaluate(() => window.scrollTo(0, 0));
  // Opens the collapsed section.
  await page
    .locator('details:not([open])')
    .evaluateAll((els) =>
      els.forEach((d) => ((d as HTMLDetailsElement).open = true)),
    );
  // The same script again: nothing is collapsed now, so nothing changes.
  await page
    .locator('details:not([open])')
    .evaluateAll((els) =>
      els.forEach((d) => ((d as HTMLDetailsElement).open = true)),
    );
  // Its result is used, and it changes the page too.
  const shown = await page
    .locator('#note')
    .evaluate((el) => ((el.hidden = false), el.hidden));
  expect(shown).toBe(false);
  // Forced, with options built away from the call.
  const options = { force: true };
  await page.getByRole('button', { name: 'Save' }).click(options);
});
