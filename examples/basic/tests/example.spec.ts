import { test, expect } from '@playwright/test';

// An ordinary Playwright test: nothing here knows about qa-instructions.
// The reporter in playwright.config.ts derives the QA Steps.

test('Browse Playwright docs', async ({ page }) => {
  await page.goto('https://playwright.dev');
  await expect(page.getByRole('link', { name: 'Get started' })).toBeVisible();

  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/.*intro/);
});
