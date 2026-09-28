import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ActionRef, CheckRef } from '../../src/playwright/action-ref.js';
import { findOne } from 'domutils';
import { parseDocument } from 'htmlparser2';

import { LocatorParser } from '../../src/playwright/locator-parser.js';
import { SelectorParser } from '../../src/playwright/selector-parser.js';
import { SnapshotTarget } from '../../src/playwright/snapshot-target.js';
import { TraceScreenshotSource } from '../../src/playwright/trace-screenshot-source.js';

test('a CSS selector tells what kind of element it ends on, never shown to a tester', () => {
  const parser = new LocatorParser();
  assert.deepEqual(
    parser.parse(
      `locator('#f').locator('input[name="q"][type="number"]').first()`,
    ),
    {
      by: 'selector',
      value: 'input[name="q"][type="number"]',
      tag: 'input',
      type: 'number',
    },
  );
  assert.deepEqual(
    parser.parse(
      `locator('label:has-text("one time") input[type="radio"], label input[type="radio"]')`,
    ),
    {
      by: 'selector',
      value:
        'label:has-text("one time") input[type="radio"], label input[type="radio"]',
      tag: 'input',
      type: 'radio',
    },
  );
  assert.deepEqual(parser.parse(`locator('.card')`), {
    by: 'selector',
    value: '.card',
  });
  // Not CSS: nothing more is known.
  assert.deepEqual(parser.parse(`locator('text=Hello >> nth=0')`), {
    by: 'selector',
    value: 'text=Hello >> nth=0',
  });
});

test('before 1.63 an element stays marked after its call, and the mark is not taken for a later call', async () => {
  // Trace format 8 from test/fixtures/traces/scenario.spec.ts: the field
  // filled first keeps its mark while the button is clicked.
  const source = await TraceScreenshotSource.open(
    fileURLToPath(
      new URL(
        '../../../test/playwright/fixtures/traces/v8.zip',
        import.meta.url,
      ),
    ),
  );
  const fill = source.capture(ActionRef.of(5, `Fill "Ada" getByLabel('Name')`));
  const click = source.capture(
    ActionRef.of(6, `Click getByRole('button', { name: 'Paint' })`),
  );
  assert.equal(fill?.element?.tag, 'input');
  assert.deepEqual(fill?.element?.labels, ['Name']);
  assert.equal(click?.element?.tag, 'button');
  assert.equal(click?.element?.text, 'Paint');
});

/** Recorded from test/fixtures/traces/names.spec.ts, with DOM snapshots. */
const NAMES_TRACE = fileURLToPath(
  new URL(
    '../../../test/playwright/fixtures/traces/v9-names.zip',
    import.meta.url,
  ),
);
// Three fixture calls, then the test body.
const NAMES = {
  navigate: ActionRef.of(4, 'Navigate'),
  radio: ActionRef.of(5, 'Check'),
  quantity: ActionRef.of(6, 'Fill "3"'),
  quantityCheck: CheckRef.of(1, 'Expect "toHaveValue"'),
  add: ActionRef.of(7, 'Click'),
  note: ActionRef.of(8, 'Fill "Thanks"'),
  cart: ActionRef.of(9, 'Click'),
  gift: ActionRef.of(10, 'Check'),
};

test('with DOM snapshots, the trace says what each element looked like on the page', async () => {
  const source = await TraceScreenshotSource.open(NAMES_TRACE);
  const element = (ref: string) => source.capture(ref)?.element;

  // The product form the test narrowed each search to, titled by its heading.
  const product = {
    tag: 'form',
    attributes: { id: 'product_2' },
    title: 'Energy Certificates',
    scope: true,
  };

  assert.equal(element(NAMES.navigate), undefined);
  assert.deepEqual(element(NAMES.radio), {
    tag: 'input',
    attributes: { type: 'radio', name: 'price_2' },
    text: '',
    labels: ['One time purchase'],
    lookalikes: 2,
    region: product,
  });
  // The heading just before it is a fact the adapter reports; only the
  // core decides that a field is not named by it.
  assert.deepEqual(element(NAMES.quantity), {
    tag: 'input',
    attributes: { type: 'number', name: 'quantity', value: '1' },
    text: '',
    labels: [],
    lookalikes: 2,
    title: 'Energy Certificates',
    region: product,
  });
  // A check's element comes through too.
  assert.deepEqual(
    source.check(NAMES.quantityCheck)?.element,
    element(NAMES.quantity),
  );
  // Only the text a person can read: not the loading icon's label.
  assert.deepEqual(element(NAMES.add), {
    tag: 'button',
    attributes: { type: 'button', class: 'add' },
    text: 'Add to Cart',
    labels: [],
    lookalikes: 2,
    region: product,
  });
  // A label pointing at the field by id; text in earlier snapshots is
  // resolved from them.
  assert.deepEqual(element(NAMES.note)?.labels, ['Gift note']);
  // A label both around the field and pointing at it counts once.
  assert.deepEqual(element(NAMES.gift)?.labels, ['Make this a gift']);
  assert.deepEqual(element(NAMES.cart), {
    tag: 'a',
    attributes: { href: '#cart', 'data-testid': 'view-cart' },
    text: 'View cart',
    labels: [],
    lookalikes: 1,
  });
  // Found on the whole page and one of a kind: no part of the page to name.
  assert.equal(element(NAMES.note)?.region, undefined);
  assert.equal(element(NAMES.gift)?.region, undefined);
});

test('the part of the page an element is in comes from the test scope, else from the page', () => {
  const selectors = new SelectorParser();
  assert.equal(
    selectors.scope(`#product_2 >> input[name="quantity"] >> nth=0`),
    '#product_2',
  );
  assert.equal(
    selectors.scope(
      `#p >> internal:role=button[name="Add to Cart"i] >> visible=true`,
    ),
    '#p',
  );
  // Not scoped, or scoped by something that is not plain CSS.
  assert.equal(selectors.scope(`input[name="quantity"]`), undefined);
  assert.equal(
    selectors.scope(`internal:role=form >> input[name="quantity"]`),
    undefined,
  );

  const target = (html: string, scope?: string) => {
    const document = parseDocument(html);
    const marked = findOne(
      (el) => '__playwright_target__' in el.attribs,
      document.children,
    );
    assert.ok(marked);
    return SnapshotTarget.find({ document, own: [marked] }, 'call@1')?.recorded(
      scope,
    );
  };
  const cards = (inner: string) => `<body>
    <section class="card"><h2>Basic</h2><div><input name="q" __playwright_target__="call@1"></div></section>
    <section class="card"><h2>Pro</h2><div><input name="q"></div></section>
    ${inner}</body>`;

  // Lookalikes elsewhere: the nearest titled part holding no other one.
  assert.deepEqual(target(cards(''))?.region, {
    tag: 'section',
    attributes: { class: 'card' },
    title: 'Basic',
    scope: false,
  });
  assert.equal(target(cards(''))?.lookalikes, 2);
  // A part titled by the heading just before it.
  assert.deepEqual(
    target(
      `<body><h2>Basic</h2><form id="a"><input name="q" __playwright_target__="call@1"></form>
       <h2>Pro</h2><form id="b"><input name="q"></form></body>`,
      '#a',
    )?.region,
    { tag: 'form', attributes: { id: 'a' }, title: 'Basic', scope: true },
  );
  // A scope a tester cannot see (the page body) names no part.
  assert.equal(
    target(
      `<body><h1>Store</h1><input name="q" __playwright_target__="call@1"></body>`,
      'body',
    )?.region,
    undefined,
  );
  // A part of the page checked itself carries its title, as when it holds
  // the element a later step touches.
  assert.equal(
    target(
      `<body><form id="a" __playwright_target__="call@1"><h2>Basic</h2><input name="q"></form></body>`,
    )?.title,
    'Basic',
  );
  // A heading holding the element itself does not title its part.
  assert.equal(
    target(
      `<body><div><h2><a href="#" __playwright_target__="call@1">Basic</a></h2></div>
       <div><h2><a href="#">Basic</a></h2></div></body>`,
    )?.region,
    undefined,
  );
});
