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

// As on a store's product page: the page scrolls smoothly, the option is
// already checked, and the click follows the fill at once. The fill's focus
// starts a scroll that runs on after the fill ends.
test('Order gift cards on a smoothly scrolling page', async ({ page }) => {
  await page.goto('/gift-cards');

  await page.getByLabel('One time purchase').check();
  await page.getByLabel('Gift card quantity').fill('3');
  await page.getByRole('button', { name: 'Add gift cards to cart' }).click();
  await expect(page.getByText('Added 3 gift cards to the cart')).toBeVisible();
});
