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

test('a literal first argument is read as written', () => {
  assert.equal(
    callSite(`  await page.goto('https://example.com/a?b=1');`, 'goto')
      ?.literalArgument,
    'https://example.com/a?b=1',
  );
  assert.equal(
    callSite(`  await page.goto(PAGE);`, 'goto')?.literalArgument,
    undefined,
  );
  assert.equal(
    callSite('  await page.goto(`/items/${id}`);', 'goto')?.literalArgument,
    undefined,
  );
});

/**
 * Reads the check whose matcher is `matcher`, located the way Playwright
 * reports an `expect` step: at the matcher's name.
 */
function readCheck(source: string, matcher: string) {
  const lines = source.split('\n');
  const index = lines.findIndex((line) => line.includes(`${matcher}(`));
  const column = lines[index].indexOf(`${matcher}(`) + 1;
  const reader = new CallSiteReader(() => source);
  return reader.readCheck({ file: 'spec.ts', line: index + 1, column });
}

/** A check's subject and expected value, as read from the source. */
function checkSite(source: string, matcher: string) {
  const site = readCheck(source, matcher);
  if (!site) return undefined;
  const { subject, expected } = site;
  return expected === undefined ? { subject } : { subject, expected };
}

test('a check reads its matcher and whether it is negated from the source', () => {
  const matcherOf = (source: string, matcher: string) => {
    const site = readCheck(source, matcher);
    return site && { matcher: site.matcher, negated: site.negated };
  };
  assert.deepEqual(
    matcherOf(
      `  expect(cartQty, 'cart line-item quantity').toBe(QTY);`,
      'toBe',
    ),
    { matcher: 'toBe', negated: false },
  );
  assert.deepEqual(
    matcherOf(
      `  await expect(\n    page.getByText('Saved'),\n    'saved note',\n  ).not.toBeHidden();`,
      'toBeHidden',
    ),
    { matcher: 'toBeHidden', negated: true },
  );
  assert.deepEqual(
    matcherOf(
      `  expect(total, 'order total')\n    .toBeCloseTo(SUBTOTAL, 2);`,
      'toBeCloseTo',
    ),
    { matcher: 'toBeCloseTo', negated: false },
  );
});

test('a check reads its subject and expected value from the source', () => {
  assert.deepEqual(
    checkSite(`  await expect(page).toHaveTitle('Sign in');`, 'toHaveTitle'),
    { subject: 'page', expected: 'Sign in' },
  );
  assert.deepEqual(
    checkSite(
      `  await expect(page.getByLabel('Username')).toBeEmpty();`,
      'toBeEmpty',
    ),
    { subject: "page.getByLabel('Username')" },
  );
  assert.deepEqual(checkSite(`  expect(sections).toBe(2);`, 'toBe'), {
    subject: 'sections',
    expected: '2',
  });
  assert.deepEqual(
    checkSite(
      `  await expect(page.getByTestId('welcome-message')).toHaveText(\n    "Logged in as \\"demo\\"",\n  );`,
      'toHaveText',
    ),
    {
      subject: "page.getByTestId('welcome-message')",
      expected: 'Logged in as "demo"',
    },
  );
});

test('a check split over lines, negated, or soft is read back to expect()', () => {
  assert.deepEqual(
    checkSite(
      `  await expect(
    page.getByRole('heading', { name: 'Login failed' }),
  ).not.toBeHidden();`,
      'toBeHidden',
    ),
    { subject: "page.getByRole('heading', { name: 'Login failed' })" },
  );
  assert.deepEqual(
    checkSite(
      `  await expect.soft(page.getByText('Saved'), 'saved note').toBeVisible();`,
      'toBeVisible',
    ),
    { subject: "page.getByText('Saved')" },
  );
});

test('a check whose expected value is not a literal has none', () => {
  assert.deepEqual(
    checkSite(`  await expect(page).toHaveURL(/login-error/);`, 'toHaveURL'),
    { subject: 'page' },
  );
  assert.deepEqual(
    checkSite(`  await expect(page).toHaveTitle(title);`, 'toHaveTitle'),
    { subject: 'page' },
  );
});

test('an expected value held in a constant is read from its one declaration', () => {
  const source = `const EMAIL = 'tester@example.com';
test('x', async ({ page }) => {
  await expect(page.getByLabel('Username')).toHaveValue(EMAIL);
});`;
  assert.deepEqual(checkSite(source, 'toHaveValue'), {
    subject: "page.getByLabel('Username')",
    expected: 'tester@example.com',
  });

  // Declared twice (e.g. in two tests): which one applies is not read.
  assert.deepEqual(checkSite(`const EMAIL = 'a';\n${source}`, 'toHaveValue'), {
    subject: "page.getByLabel('Username')",
  });
  // Not a plain literal.
  assert.deepEqual(
    checkSite(
      source.replace("'tester@example.com'", 'makeEmail()'),
      'toHaveValue',
    ),
    { subject: "page.getByLabel('Username')" },
  );
});

test('a location that is not a matcher call gives no check', () => {
  assert.equal(
    checkSite(`  await page.getByRole('button').click();`, 'click'),
    undefined,
  );
});
