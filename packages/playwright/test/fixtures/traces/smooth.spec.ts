import { test } from '@playwright/test';

// The Playwright test that recorded `v8-smooth.zip` (Playwright 1.56, see
// examples/derived-steps-1.56/scripts/record-fixtures.mjs): a long page that
// scrolls smoothly (`scroll-behavior: smooth`), with a form far below the
// fold, as on a store's product page.
//
// The page is green with a yellow band far below the top. In the band are a
// radio that is already checked, a Quantity field, and an Add button. Typing
// turns the field blue; a click turns the button red. Nothing animates, so
// the recording gets a frame only when the page repaints.
const PAGE =
  'data:text/html,' +
  encodeURIComponent(`<!doctype html>
<style>html { scroll-behavior: smooth }</style>
<body style="margin:0;background:#00aa00">
  <div style="height:1500px"></div>
  <form style="background:#ffd400;padding:20px">
    <label style="display:block"><input type="radio" name="plan" checked> One time</label>
    <label style="display:block"><input type="radio" name="plan"> Monthly</label>
    <label style="display:block;margin-top:20px">Quantity
      <input value="1" oninput="this.style.background='#0000cc'"></label>
    <button type="button" style="display:block;margin-top:20px;width:160px;height:40px;border:0;background:#1f4fd8"
      onclick="this.style.background='#cc0000'">Add</button>
  </form>
  <div style="height:1500px"></div>
</body>`);

test('smooth', async ({ page }) => {
  await page.goto(PAGE);
  // Already checked: Playwright neither scrolls to it nor clicks it.
  await page.getByLabel('One time').check();
  // Focusing the field starts a smooth scroll that outlasts the fill.
  await page.getByLabel('Quantity').fill('3');
  // The next Action follows at once, waiting for the scroll to settle.
  await page.getByRole('button', { name: 'Add' }).click();
  await page.waitForTimeout(300);
});
