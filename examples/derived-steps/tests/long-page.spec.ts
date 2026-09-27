import { test, expect } from '@playwright/test';

// An ordinary Playwright test on a long page: the field and button it uses
// sit far below the fold, so Playwright scrolls to each before acting. Each
// Step Screenshot must show the page scrolled to the element, not the top.

test('Order boots from the bottom of the page', async ({ page }) => {
  await page.goto('/order');

  await page.getByLabel('Trail boots quantity').fill('3');
  await page.getByRole('button', { name: 'Add Trail boots to cart' }).click();
  await expect(page.getByText('Added 3 Trail boots to the cart')).toBeVisible();
});
