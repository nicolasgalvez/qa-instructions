import { test, expect } from '@playwright/test';

// Ordinary Playwright tests that change the page with scripts and force a
// click. The reporter turns the scripts into warning steps and marks the
// forced click approximate.

test('Read the FAQ', async ({ page }) => {
  await page.goto('/faq');

  // Reads the page only: no warning.
  const sections = await page
    .locator('details')
    .evaluateAll((els) => els.length);
  expect(sections).toBe(2);

  // Opens every collapsed answer by script, like a real store's test.
  await page
    .locator('details:not([open])')
    .evaluateAll((els) =>
      els.forEach((d) => ((d as HTMLDetailsElement).open = true)),
    );
  await expect(
    page.getByText('Orders ship within 2 business days.'),
  ).toBeVisible();

  // A click done by script.
  await page
    .getByRole('button', { name: 'Show contact details' })
    .dispatchEvent('click');
  await expect(page.getByText('Email help@example.com')).toBeVisible();
});

test('Open collapsed sections on a page without any', async ({ page }) => {
  await page.goto('/');

  // The same script as above, on a page with no collapsed sections: it
  // changes nothing, so a trace shows no warning is needed.
  await page
    .locator('details:not([open])')
    .evaluateAll((els) =>
      els.forEach((d) => ((d as HTMLDetailsElement).open = true)),
    );
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveTitle('Sign in');
});

test('Subscribe to the newsletter', async ({ page }) => {
  await page.goto('/newsletter');
  await page.getByRole('button', { name: 'Subscribe' }).click({ force: true });
  await expect(page.getByText('Thanks for subscribing')).toBeVisible();
});
