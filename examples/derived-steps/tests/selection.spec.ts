import { test, expect } from '@playwright/test';

// Ordinary Playwright tests used to check test selection: the tagged one
// produces QA Instructions when the reporter selects `@qa`, the other still
// runs but produces nothing.

test('Open the home page', { tag: '@qa' }, async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Fixture App' }),
  ).toBeVisible();
});

test('Open the sign-in page', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle('Sign in');
});
