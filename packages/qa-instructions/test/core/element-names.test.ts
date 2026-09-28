import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRecorder,
  type ActionCapture,
  type CheckCapture,
  type ElementTarget,
  type RecordedElement,
  type ScreenshotSource,
  type TestEvent,
} from '../../src/core/index.js';

/** A source that only knows the elements Actions and checks touched. */
class ElementSource implements ScreenshotSource {
  constructor(
    private readonly elements: Record<string, RecordedElement> = {},
  ) {}

  capture(ref: string): ActionCapture | undefined {
    const element = this.elements[ref];
    return element && { screenshots: [], element };
  }

  check(ref: string): CheckCapture | undefined {
    const element = this.elements[ref];
    return element && { element };
  }
}

function element(
  tag: string,
  {
    attributes = {},
    text = '',
    labels = [],
  }: Partial<Omit<RecordedElement, 'tag'>> = {},
): RecordedElement {
  return { tag, attributes, text, labels };
}

function steps(
  events: TestEvent[],
  elements: Record<string, RecordedElement> = {},
): { action: string; expected?: string }[] {
  const recorder = new QaInstructionsRecorder();
  recorder.handle({ type: 'testStart', title: 'Buy', runner: 'playwright' });
  for (const event of events) recorder.handle(event);
  recorder.handle({ type: 'testEnd', status: 'passed' });
  return recorder
    .toRecording(new ElementSource(elements))
    .bundle.steps.map(({ action, expected }) =>
      expected === undefined ? { action } : { action, expected },
    );
}

const css = (value: string, hint: { tag?: string; type?: string } = {}) =>
  ({ by: 'selector', value, ...hint }) as ElementTarget;

test('an element found by CSS selector is named as the page showed it', () => {
  assert.deepEqual(
    steps(
      [
        {
          type: 'action',
          kind: 'check',
          target: css('label:has-text("one time") input[type="radio"]'),
          ref: 'radio',
        },
        {
          type: 'action',
          kind: 'fill',
          target: css('input[name="edd_download_quantity"]'),
          value: '3',
          ref: 'quantity',
        },
        {
          type: 'action',
          kind: 'fill',
          target: css('#name'),
          value: 'Ada',
          ref: 'name',
        },
        {
          type: 'action',
          kind: 'click',
          target: css('button.edd-add-to-cart, .edd-add-to-cart'),
          ref: 'add',
        },
        {
          type: 'action',
          kind: 'click',
          target: css('input.buy'),
          ref: 'buy',
        },
        {
          type: 'action',
          kind: 'hover',
          target: css('.tip'),
          ref: 'tip',
        },
      ],
      {
        radio: element('input', {
          attributes: { type: 'radio' },
          labels: ['RECs (one time purchase)'],
        }),
        quantity: element('input', {
          attributes: { type: 'number', name: 'edd_download_quantity' },
        }),
        name: element('input', { labels: ['Name'] }),
        add: element('button', { text: 'Add to Cart' }),
        buy: element('input', { attributes: { type: 'submit', value: 'Buy' } }),
        tip: element('span', { text: 'What is a REC?' }),
      },
    ),
    [
      { action: 'Check the **RECs (one time purchase)** option' },
      { action: 'Type **3** into the number field' },
      { action: 'Type **Ada** into **Name**' },
      { action: 'Click the **Add to Cart** button' },
      { action: 'Click the **Buy** button' },
      { action: 'Hover over **What is a REC?**' },
    ],
  );
});

test('an element found by test id is named as the page showed it', () => {
  assert.deepEqual(
    steps(
      [
        {
          type: 'action',
          kind: 'click',
          target: { by: 'testId', value: 'view-cart' },
          ref: 'cart',
        },
        {
          type: 'action',
          kind: 'click',
          target: { by: 'testId', value: 'menu' },
          ref: 'menu',
        },
      ],
      {
        cart: element('a', {
          attributes: { href: '#cart' },
          text: 'View cart',
        }),
        menu: element('button', {
          attributes: { 'aria-label': 'Menu' },
          text: '',
        }),
      },
    ),
    [
      { action: 'Click the **View cart** link' },
      { action: 'Click the **Menu** button' },
    ],
  );
});

test('an element with an explicit role is named by that role', () => {
  assert.deepEqual(
    steps(
      [
        {
          type: 'action',
          kind: 'click',
          target: css('.toggle'),
          ref: 'toggle',
        },
      ],
      {
        toggle: element('div', {
          attributes: { role: 'switch' },
          text: 'Dark mode',
        }),
      },
    ),
    [{ action: 'Click the **Dark mode** switch' }],
  );
});

test('without a recording of the page, a selector is described plainly, never shown', () => {
  assert.deepEqual(
    steps([
      {
        type: 'action',
        kind: 'click',
        target: css('button.edd-add-to-cart, .edd-add-to-cart', {
          tag: 'button',
        }),
      },
      {
        type: 'action',
        kind: 'fill',
        target: css('input[name="qty"][type="number"]', {
          tag: 'input',
          type: 'number',
        }),
        value: '3',
      },
      {
        type: 'action',
        kind: 'check',
        target: css('input[type="radio"]', { tag: 'input', type: 'radio' }),
      },
      { type: 'action', kind: 'click', target: css('.card') },
      {
        type: 'action',
        kind: 'click',
        target: { by: 'testId', value: 'sign-in-link' },
      },
    ]),
    [
      { action: 'Click the button' },
      { action: 'Type **3** into the number field' },
      { action: 'Check the option' },
      { action: 'Click the element' },
      { action: 'Click the element' },
    ],
  );
});

test('a long text inside an element is not used as its name', () => {
  assert.deepEqual(
    steps(
      [{ type: 'action', kind: 'click', target: css('.card'), ref: 'card' }],
      { card: element('div', { text: 'x'.repeat(81) }) },
    ),
    [{ action: 'Click the element' }],
  );
});

test('elements found by role, label, or text keep the names the test gave them', () => {
  assert.deepEqual(
    steps(
      [
        {
          type: 'action',
          kind: 'click',
          target: { by: 'role', role: 'link', name: 'Sign in' },
          ref: 'link',
        },
        {
          type: 'action',
          kind: 'fill',
          target: { by: 'label', value: 'Username' },
          value: 'ada',
          ref: 'field',
        },
      ],
      {
        link: element('a', { attributes: { href: '/' }, text: 'Sign in now' }),
        field: element('input', { labels: ['Your username'] }),
      },
    ),
    [
      { action: 'Click the **Sign in** link' },
      { action: 'Type **ada** into **Username**' },
    ],
  );
});

test('checks name elements the same way, and a text check never names an element by the text it checks', () => {
  assert.deepEqual(
    steps(
      [
        { type: 'action', kind: 'reload' },
        {
          type: 'check',
          matcher: 'toHaveValue',
          negated: false,
          subject: 'element',
          target: css('input[name="qty"]'),
          expected: '3',
          ref: 'quantity',
        },
        {
          type: 'check',
          matcher: 'toHaveText',
          negated: false,
          subject: 'element',
          target: { by: 'testId', value: 'cart-status' },
          expected: '3 in your cart',
          ref: 'status',
        },
        {
          type: 'check',
          matcher: 'toBeVisible',
          negated: false,
          subject: 'element',
          target: { by: 'testId', value: 'thanks' },
          ref: 'thanks',
        },
      ],
      {
        quantity: element('input', { attributes: { type: 'number' } }),
        status: element('p', { text: '3 in your cart' }),
        thanks: element('h2', { text: 'Thank you' }),
      },
    ),
    [
      {
        action: 'Reload the page',
        expected:
          'The number field shows **3**; the page shows **3 in your cart**; the **Thank you** heading is visible',
      },
    ],
  );
});

test('a check whose subject the runner could not read is an element check when the page recorded one', () => {
  assert.deepEqual(
    steps(
      [
        { type: 'action', kind: 'reload' },
        {
          type: 'check',
          matcher: 'toHaveValue',
          negated: false,
          subject: 'value',
          expected: '3',
          ref: 'quantity',
        },
        // A plain value check: nothing on the page.
        {
          type: 'check',
          matcher: 'toBe',
          negated: false,
          subject: 'value',
          expected: '3',
        },
      ],
      { quantity: element('input', { attributes: { type: 'number' } }) },
    ),
    [{ action: 'Reload the page', expected: 'The number field shows **3**' }],
  );
});

test('a script change on a selector-found element names it plainly', () => {
  assert.deepEqual(
    steps([
      {
        type: 'action',
        kind: 'script',
        target: css('details:not([open])', { tag: 'details' }),
        resultUsed: false,
      },
    ]),
    [
      {
        action:
          'The test changed the expandable section with a script instead of a user action. If the page does not match what comes next, change it by hand to continue.',
      },
    ],
  );
});
