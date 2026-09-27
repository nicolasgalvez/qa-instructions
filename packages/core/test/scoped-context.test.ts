import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRecorder,
  type ActionCapture,
  type CheckCapture,
  type ElementTarget,
  type RecordedElement,
  type RecordedRegion,
  type ScreenshotSource,
  type TestEvent,
} from '../src/index.js';

/** A source that only knows the elements Actions and checks touched. */
class ElementSource implements ScreenshotSource {
  constructor(private readonly elements: Record<string, RecordedElement>) {}

  capture(ref: string): ActionCapture | undefined {
    const element = this.elements[ref];
    return element && { screenshots: [], element };
  }

  check(ref: string): CheckCapture | undefined {
    const element = this.elements[ref];
    return element && { element };
  }
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

const product: RecordedRegion = {
  tag: 'form',
  attributes: { id: 'edd_purchase_102' },
  title: 'Renewable Energy Certificates (RECs)',
  scope: true,
};

const quantity = (extra: Partial<RecordedElement> = {}): RecordedElement => ({
  tag: 'input',
  attributes: { type: 'number', name: 'edd_download_quantity' },
  text: '',
  labels: [],
  lookalikes: 2,
  region: product,
  ...extra,
});

test('an element found inside a part of the page says which part', () => {
  assert.deepEqual(
    steps(
      [
        {
          type: 'action',
          kind: 'fill',
          value: '3',
          target: css('input[name="edd_download_quantity"]', {
            tag: 'input',
          }),
          ref: 'fill',
        },
        {
          type: 'check',
          matcher: 'toHaveValue',
          negated: false,
          subject: 'element',
          expected: '3',
          ref: 'check',
        },
        {
          type: 'action',
          kind: 'click',
          target: { by: 'role', role: 'button', name: 'Add to Cart' },
          ref: 'click',
        },
      ],
      {
        fill: quantity({ labels: ['Quantity'] }),
        check: quantity({ labels: ['Quantity'] }),
        click: {
          tag: 'button',
          attributes: {},
          text: 'Add to Cart',
          labels: [],
          lookalikes: 2,
          region: product,
        },
      },
    ),
    [
      {
        action:
          'Type **3** into **Quantity** in the **Renewable Energy Certificates (RECs)** form',
        expected:
          '**Quantity** in the **Renewable Energy Certificates (RECs)** form shows **3**',
      },
      {
        action:
          'Click the **Add to Cart** button in the **Renewable Energy Certificates (RECs)** form',
      },
    ],
  );
});

test('the part of the page is named only when the test scoped to it or the page has lookalikes', () => {
  const fill = (element: RecordedElement) =>
    steps(
      [
        {
          type: 'action',
          kind: 'fill',
          value: '3',
          target: css('input'),
          ref: 'fill',
        },
      ],
      { fill: element },
    )[0].action;

  // One of a kind, and the part was found by walking the page, not by the
  // test: no context.
  assert.equal(
    fill(quantity({ lookalikes: 1, region: { ...product, scope: false } })),
    'Type **3** into the number field',
  );
  // One of a kind, but the test scoped to it.
  assert.equal(
    fill(quantity({ lookalikes: 1 })),
    'Type **3** into the number field in the **Renewable Energy Certificates (RECs)** form',
  );
  // A lookalike elsewhere on the page.
  assert.equal(
    fill(
      quantity({
        region: {
          tag: 'div',
          attributes: {},
          title: 'Water Restoration',
          scope: false,
        },
      }),
    ),
    'Type **3** into the number field in the **Water Restoration** section',
  );
  // A part with no readable name adds nothing, and no selector shows.
  assert.equal(
    fill(quantity({ region: { tag: 'form', attributes: {}, scope: true } })),
    'Type **3** into the number field',
  );
  // No recorded part at all.
  assert.equal(
    fill(quantity({ region: undefined })),
    'Type **3** into the number field',
  );
});

test('a text check that names no element does not name a part of the page', () => {
  assert.deepEqual(
    steps(
      [
        {
          type: 'action',
          kind: 'click',
          target: { by: 'role', role: 'button', name: 'Go' },
        },
        {
          type: 'check',
          matcher: 'toHaveText',
          negated: false,
          subject: 'element',
          target: css('.status'),
          expected: 'Done',
          ref: 'check',
        },
      ],
      {
        check: {
          tag: 'p',
          attributes: { class: 'status' },
          text: 'Done',
          labels: [],
          lookalikes: 1,
          region: product,
        },
      },
    ),
    [
      {
        action: 'Click the **Go** button',
        expected: 'The page shows **Done**',
      },
    ],
  );
});
