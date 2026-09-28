import { test, expect } from '@playwright/test';

// An ordinary Playwright test that groups its actions with test.step,
// including a nested group and a trailing ungrouped action. The reporter
// shows the groups as Sections, collapsed QA Steps, or not at all, per its
// `testSteps` option (see playwright.config.ts).

test('Sign in with good credentials', async ({ page }) => {
  await test.step('Open the sign-in form', async () => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveTitle('Sign in');
  });

  await test.step('Sign in', async () => {
    await test.step('Enter the username', async () => {
      await page.getByLabel('Username').fill('demo-user');
      await expect(page.getByLabel('Username')).toHaveValue('demo-user');
    });
    await page.getByRole('link', { name: 'Submit good credentials' }).click();
    await expect(page.getByTestId('welcome-message')).toHaveText(
      'Logged in as demo-user',
    );
  });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});
