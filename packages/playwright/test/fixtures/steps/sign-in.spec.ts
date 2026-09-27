import { test, expect, type Page } from '@playwright/test';

// An ordinary Playwright test: nothing here knows about qa-instructions.
// The reporter in playwright.config.ts derives the QA Steps.

async function submitBadCredentials(page: Page, username: string) {
  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Submit bad credentials' }).click();
}

test('Sign in with bad credentials', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Fixture App' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveTitle('Sign in');
  await expect(page.getByLabel('Username')).toBeEmpty();

  // Test plumbing a tester cannot repeat.
  await page.waitForTimeout(10);
  const marker = await page.getByTestId('step-marker').textContent();
  expect(marker).toContain('LOGIN');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.request.get('/');

  await submitBadCredentials(page, 'demo-user');
  await expect(page).toHaveURL(/login-error/);
  await expect(page.getByText('Invalid credentials')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Login failed' }),
  ).not.toBeHidden();

  await page.keyboard.press('Tab');
});
