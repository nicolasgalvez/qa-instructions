import { test, expect } from '@playwright/test';

// Tests that fail on purpose, run with retries by playwright.failing.config.ts.
// Each first attempt behaves differently from the last one, so the golden
// files prove only the last attempt produces QA Instructions.

test('Sign in shows the wrong user', async ({ page }) => {
  await page.goto('/');
  if (test.info().retry === 0) {
    // First attempt fails earlier than the last one.
    await expect(page).toHaveTitle('Not the first attempt');
  }
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Username').fill('demo-user');
  await page.getByRole('link', { name: 'Submit good credentials' }).click();
  await expect(page.getByTestId('welcome-message')).toHaveText(
    'Logged in as admin',
  );
  await page.getByRole('link', { name: 'Sign out' }).click();
});

test('Sign in with a missing link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByRole('link', { name: 'Forgot password' }).click();
  await expect(page).toHaveTitle('Reset password');
});

test('Setup fails before any step', async ({ page }) => {
  expect(test.info().project.name, 'unexpected project').toBe('no-such');
  await page.goto('/');
});

test('Flaky sign in passes on retry', async ({ page }) => {
  await page.goto('/');
  expect(test.info().retry, 'first attempt is flaky').toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveTitle('Sign in');
});
