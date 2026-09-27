import { test, expect } from '@playwright/test';

// An ordinary Playwright test written like a real store's: it finds
// elements by CSS selector and test id, inside the form of one of several
// products that each have the same fields. The QA Steps must name elements
// as a tester sees them, never by selector.

test('Add three RECs to the cart', async ({ page }) => {
  await page.goto('/certificates');

  const form = page.locator('#edd_purchase_102');
  await form
    .locator(
      'label:has-text("one time purchase") input[type="radio"], ' +
        'label:has-text("One Time Purchase") input[type="radio"]',
    )
    .first()
    .check();

  const quantity = form.locator('input[name="edd_download_quantity"]').first();
  await quantity.fill('3');
  await expect(quantity).toHaveValue('3');

  await form
    .locator(
      'button.edd-downloads-purchase--product-link, .edd-add-to-cart, input.edd-add-to-cart, button:has-text("Purchase")',
    )
    .first()
    .click();
  await expect(page.getByTestId('cart-status')).toHaveText(
    '3 × Renewable Energy Certificates (RECs) in your cart',
  );

  await page.getByTestId('view-cart').click();
});
