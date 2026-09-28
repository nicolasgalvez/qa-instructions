import { test } from '@playwright/test';

// The Playwright test that recorded `v8-scroll.zip` (Playwright 1.56, see
// examples/derived-steps-1.56/scripts/record-fixtures.mjs): a long page on
// which Playwright scrolls before acting.
//
// The page is green with a yellow band far below the top. In the band, the
// Add button sits above the Quantity field; a second button, Far, is further
// down. Typing turns the field blue; a click turns its button red. So a
// frame's pixels show whether the page had scrolled and whether the Action
// had happened yet. A small square spins in the corner, so the page keeps
// painting and the recording keeps getting frames.
const PAGE =
  'data:text/html,' +
  encodeURIComponent(`<!doctype html>
<style>@keyframes spin { to { transform: rotate(360deg) } }</style>
<body style="margin:0;background:#00aa00">
  <div style="position:fixed;right:8px;top:8px;width:12px;height:12px;background:#000;animation:spin 1s linear infinite"></div>
  <div style="height:900px"></div>
  <div style="background:#ffd400;padding:20px">
    <button style="display:block;width:160px;height:40px;border:0;background:#1f4fd8"
      onclick="this.style.background='#cc0000'">Add</button>
    <label style="display:block;margin-top:20px">Quantity
      <input value="1" oninput="this.style.background='#0000cc'"></label>
  </div>
  <div style="height:900px"></div>
  <button style="display:block;width:160px;height:40px;border:0;background:#1f4fd8"
    onclick="this.style.background='#cc0000'">Far</button>
  <div style="height:300px"></div>
</body>`);

test('scroll', async ({ page }) => {
  await page.goto(PAGE);
  // Focusing the field scrolls it into view, after the input snapshot.
  await page.getByLabel('Quantity').fill('3');
  await page.waitForTimeout(300);
  // Already in view: no scroll.
  await page.getByRole('button', { name: 'Add' }).click();
  // Below the fold: Playwright scrolls to it just before the input.
  await page.getByRole('button', { name: 'Far' }).click();
  await page.waitForTimeout(300);
});
