import { test, expect } from '@playwright/test';

// An ordinary Playwright test: nothing here knows about qa-instructions.
// The reporter in playwright.config.ts derives the QA Steps.

test('Login error flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('step-marker')).toHaveText('STEP 1 HOME');

  await page.getByTestId('sign-in-link').click();
  await expect(page.getByTestId('step-marker')).toHaveText('STEP 2 LOGIN');
  await expect(page.getByTestId('username')).toBeVisible();

  await page.getByTestId('submit-bad-credentials').click();
  await expect(page).toHaveURL(/login-error/);
  await expect(page.getByTestId('error-banner')).toHaveText(
    'Invalid credentials',
  );
  await expect(page.getByTestId('step-marker')).toHaveText('STEP 3 ERROR');
});
