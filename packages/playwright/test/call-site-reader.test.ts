import assert from 'node:assert/strict';
import test from 'node:test';

import { CallSiteReader } from '../src/reporter/call-site-reader.js';

/**
 * Reads the call site of `method` on the first line calling it, located the
 * way Playwright reports a step: 1-based line and column of the method name.
 */
function callSite(source: string, method: string) {
  const lines = source.split('\n');
  const index = lines.findIndex((line) => line.includes(`${method}(`));
  const column = lines[index].indexOf(`${method}(`) + 1;
  const reader = new CallSiteReader(() => source);
  return reader.read({ file: 'spec.ts', line: index + 1, column });
}

test('a call awaited as its own statement discards its result', () => {
  assert.equal(
    callSite(
      `test('x', async ({ page }) => {
  await page.locator('details:not([open])').evaluateAll((els) => els.forEach((d) => (d.open = true)));
});`,
      'evaluateAll',
    )?.resultUsed,
    false,
  );
});

test('a chain split over lines is read back to its statement', () => {
  assert.equal(
    callSite(
      `  await page.goto('/faq')
  await page
    .locator('details:not([open])')
    .evaluateAll((els) => els.forEach((d) => (d.open = true)));`,
      'evaluateAll',
    )?.resultUsed,
    false,
  );
});

test('a result assigned, checked, returned, or passed on is used', () => {
  for (const [source, method] of [
    [
      `  const count = await page.locator('details').evaluateAll((els) => els.length);`,
      'evaluateAll',
    ],
    [
      `  expect(await page.evaluate(() => document.title)).toBe('x');`,
      'evaluate',
    ],
    [`  return page.evaluate(() => 1);`, 'evaluate'],
    [`const read = () => page.$eval('h1', (el) => el.textContent);`, '$eval'],
    [`  await Promise.all([page.evaluate(() => 1)]);`, 'evaluate'],
  ]) {
    assert.equal(callSite(source, method)?.resultUsed, true, source);
  }
});

test('brackets inside strings and comments do not confuse the reader', () => {
  assert.equal(
    callSite(
      `  // a comment with ) and ( and 'quote
  await page.locator('a[href=")"]').evaluate((el) => el.click());`,
      'evaluate',
    )?.resultUsed,
    false,
  );
});

test('a statement after one without a semicolon still stands alone', () => {
  assert.equal(
    callSite(
      `  const x = foo()
  await page.evaluate(() => window.scrollTo(0, 0))`,
      'evaluate',
    )?.resultUsed,
    false,
  );
});

test('force: true in the call options marks the call forced', () => {
  const source = (options: string) =>
    `  await page.getByRole('button', { name: 'Go (now)' }).click(${options});`;
  assert.equal(callSite(source('{ force: true }'), 'click')?.forced, true);
  assert.equal(
    callSite(source('{ timeout: 1000, force : true }'), 'click')?.forced,
    true,
  );
  assert.equal(callSite(source('{ force: false }'), 'click')?.forced, false);
  assert.equal(callSite(source(''), 'click')?.forced, false);
  assert.equal(
    callSite(source(`{ trial: 'force: true' }`), 'click')?.forced,
    false,
  );
});

test('an unreadable source file gives no call site', () => {
  const reader = new CallSiteReader(() => undefined);
  assert.equal(reader.read({ file: 'gone.ts', line: 1, column: 1 }), undefined);
});

test('a location past the end of the file gives no call site', () => {
  const reader = new CallSiteReader(() => 'await page.evaluate(() => 1);');
  assert.equal(reader.read({ file: 'a.ts', line: 9, column: 1 }), undefined);
});
