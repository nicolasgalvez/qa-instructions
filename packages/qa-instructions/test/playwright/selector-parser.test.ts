import assert from 'node:assert/strict';
import test from 'node:test';

import { LocatorParser } from '../../src/playwright/locator-parser.js';
import { SelectorParser } from '../../src/playwright/selector-parser.js';

const selectors = new SelectorParser();
const locators = new LocatorParser();

test('a recorded selector names the element its locator description does', () => {
  // Each selector as a trace records it, next to the locator Playwright 1.63
  // reports for the same call.
  const pairs: [string, string][] = [
    [
      '#purchase_1174 >> input[name="download_quantity"] >> nth=0',
      `locator('#purchase_1174').locator('input[name="download_quantity"]').first()`,
    ],
    [
      '#purchase_1174 >> internal:role=button[name="Purchase"i]',
      `locator('#purchase_1174').getByRole('button', { name: 'Purchase' })`,
    ],
    [
      'internal:role=heading[name="Login failed"s][level=1]',
      `getByRole('heading', { name: 'Login failed', exact: true, level: 1 })`,
    ],
    ['internal:role=button', `getByRole('button')`],
    ['internal:text="Added to cart"i', `getByText('Added to cart')`],
    ['internal:label="Username"i', `getByLabel('Username')`],
    ['internal:attr=[placeholder="Search"i]', `getByPlaceholder('Search')`],
    ['internal:attr=[alt="Logo"i]', `getByAltText('Logo')`],
    ['internal:attr=[title="Close"i]', `getByTitle('Close')`],
    [
      'internal:testid=[data-testid="welcome-message"s]',
      `getByTestId('welcome-message')`,
    ],
    [
      'form >> internal:has-text="Saved"i',
      `locator('form').filter({ hasText: 'Saved' })`,
    ],
    ['internal:text=/Added/', `getByText(/Added/)`],
    [
      'internal:label="Say \\"hi\\""i >> visible=true',
      `getByLabel('Say "hi"')`,
    ],
  ];
  for (const [selector, locator] of pairs) {
    assert.deepEqual(
      selectors.parse(selector),
      locators.parse(locator),
      selector,
    );
  }
});

test('a selector with nothing a tester can see names nothing', () => {
  assert.equal(selectors.parse(undefined), undefined);
  assert.equal(selectors.parse(''), undefined);
  assert.equal(selectors.parse('nth=0'), undefined);
});
