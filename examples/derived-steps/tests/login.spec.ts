import { test, expect } from '@playwright/test';

// An ordinary Playwright test that types a password and an email address.
// The password field is recognized from the page recorded in the trace; the
// email address matches the `mask` pattern in playwright.config.ts. Neither
// may appear in any QA Instructions output (see scripts/verify-run.mjs).

const EMAIL = 'tester@qa.example.com';
const PASSWORD = 'correct-horse-battery-staple';

test('Sign in with a password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(EMAIL);
  await expect(page.getByLabel('Username')).toHaveValue(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await expect(page.getByLabel('Password')).toHaveValue(PASSWORD);
  await page.getByRole('button', { name: 'Submit bad credentials' }).click();
  await expect(page).toHaveURL(/login-error/);
});
