import { test, expect } from '@playwright/test';

// An ordinary Playwright test on UI that moves: a hamburger menu that slides
// in, an accordion that animates open, and a sticky header used after the
// page has scrolled. Each Step Screenshot's Highlight must sit on the
// element the step names.

test('Register a warranty from the menu', async ({ page }) => {
  await page.goto('/store');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'Warranty' }).click();

  await page.getByRole('button', { name: 'Warranty' }).click();
  await expect(page.getByLabel('Serial number')).toBeInViewport({ ratio: 1 });

  await page.getByLabel('Serial number').fill('SN-1234');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Registered')).toBeVisible();

  // The page has scrolled; the header, and its menu button, stay on top.
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('link', { name: 'Shipping' })).toBeInViewport();
});
