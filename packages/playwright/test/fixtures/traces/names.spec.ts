import { test, expect } from '@playwright/test';

// The Playwright test that recorded the committed sample trace
// `v9-names.zip`, with DOM snapshots on (see names.config.ts). Regenerate
// with Playwright 1.63:
//
//   pnpm exec playwright test -c test/fixtures/traces/names.config.ts
//   cp test-results/*/trace.zip test/fixtures/traces/v9-names.zip
//
// Two product forms with the same fields, found by CSS selector and test id
// the way a real store's test finds them. The DOM snapshots show what each
// element looked like to a tester.
const product = (id: number, title: string) => `
  <form id="product_${id}">
    <h3>${title}</h3>
    <input type="number" name="quantity" value="1">
    <label><input type="radio" name="price_${id}">&nbsp;<span>One time purchase</span></label>
    <button type="button" class="add"><span>Add to Cart</span> <span aria-label="Loading"></span></button>
  </form>`;
const PAGE =
  'data:text/html,' +
  encodeURIComponent(`<!doctype html>
<body style="margin:0">
  ${product(1, 'Water Certificates')}
  ${product(2, 'Energy Certificates')}
  <label for="note">Gift note</label> <input id="note">
  <a href="#cart" data-testid="view-cart">View cart</a>
  <label for="gift"><input type="checkbox" id="gift"> Make this a gift</label>
</body>`);

test('names', async ({ page }) => {
  await page.goto(PAGE);
  const form = page.locator('#product_2');
  await form.locator('label:has-text("one time purchase") input').check();
  const quantity = form.locator('input[name="quantity"]');
  await quantity.fill('3');
  await expect(quantity).toHaveValue('3');
  await form.locator('button.add').click();
  await page.locator('#note').fill('Thanks');
  await page.getByTestId('view-cart').click();
  // A label both around the box and pointing at it names it once.
  await page.locator('#gift').check();
});
