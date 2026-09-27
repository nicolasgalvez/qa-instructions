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

test('Sign in despite failed soft checks', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect.soft(page).toHaveTitle('Log in');
  await page.getByLabel('Username').fill('demo-user');
  await expect
    .soft(page.getByLabel('Username'), 'typed username')
    .toHaveValue('someone-else');
  await page.getByRole('link', { name: 'Submit good credentials' }).click();
  await expect(page.getByTestId('welcome-message')).toHaveText(
    'Logged in as demo-user',
  );
});

// Skipped tests yield no QA Instructions, however they are skipped.
test.skip('Skipped sign in', async ({ page }) => {
  await page.goto('/');
});

test.fixme('Sign in to fix later', async ({ page }) => {
  await page.goto('/');
});

test('Sign in skipped at runtime', async ({ page }) => {
  await page.goto('/');
  test.skip(true, 'skipped once the page is open');
  await page.getByRole('link', { name: 'Sign in' }).click();
});

test('Flaky sign in passes on retry', async ({ page }) => {
  await page.goto('/');
  expect(test.info().retry, 'first attempt is flaky').toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveTitle('Sign in');
});
