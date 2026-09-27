import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRecorder,
  type ActionCapture,
  type CheckCapture,
  type ScreenshotSource,
  type TestEvent,
} from '../src/index.js';

/** A source that knows what some checks checked, as a trace would. */
class CheckSource implements ScreenshotSource {
  constructor(private readonly checks: Record<string, CheckCapture>) {}

  capture(): ActionCapture | undefined {
    return undefined;
  }

  check(ref: string): CheckCapture | undefined {
    return this.checks[ref];
  }
}

const start: TestEvent = {
  type: 'testStart',
  title: 'Cart',
  runner: 'playwright',
  baseUrl: 'http://127.0.0.1:4321',
};
const passed: TestEvent = { type: 'testEnd', status: 'passed' };
const fill: TestEvent = {
  type: 'action',
  kind: 'fill',
  value: '3',
  target: { by: 'label', value: 'Quantity' },
};

function recorderFor(events: TestEvent[]): QaInstructionsRecorder {
  const recorder = new QaInstructionsRecorder();
  for (const event of [start, ...events, passed]) recorder.handle(event);
  return recorder;
}

function expected(
  source: ScreenshotSource | undefined,
  ...events: TestEvent[]
): (string | undefined)[] {
  const recorder = recorderFor([fill, ...events]);
  const bundle = source
    ? recorder.toRecording(source).bundle
    : recorder.toBundle();
  return bundle.steps.map((step) => step.expected);
}

test('a check the test named by a variable gets the element the source says it checked', () => {
  const check: TestEvent = {
    type: 'check',
    matcher: 'toHaveValue',
    negated: false,
    subject: 'element',
    ref: '1:Expect "toHaveValue"',
  };
  const source = new CheckSource({
    '1:Expect "toHaveValue"': {
      target: { by: 'label', value: 'Quantity' },
      expected: '3',
    },
  });

  assert.deepEqual(expected(source, check), ['**Quantity** shows **3**']);
  // Without the source, as without a trace: nothing to name.
  assert.deepEqual(expected(undefined, check), [undefined]);
});

test('what the test reported wins over what the source recorded', () => {
  const check: TestEvent = {
    type: 'check',
    matcher: 'toHaveValue',
    negated: false,
    subject: 'element',
    target: { by: 'role', role: 'spinbutton', name: 'Quantity' },
    expected: '3',
    ref: 'c1',
  };
  const source = new CheckSource({
    c1: { target: { by: 'selector', value: 'input' }, expected: '4' },
  });
  assert.deepEqual(expected(source, check), [
    'The **Quantity** spinbutton shows **3**',
  ]);
});

test('a computed expected value is the value the source says the test expected', () => {
  const check: TestEvent = {
    type: 'check',
    matcher: 'toBeCloseTo',
    negated: false,
    subject: 'value',
    description: 'cart subtotal',
    ref: 'c1',
  };
  assert.deepEqual(
    expected(new CheckSource({ c1: { expected: '15' } }), check),
    ['**cart subtotal** is **15**'],
  );
});

test('a failed check the source makes readable marks its QA Step as failing', () => {
  const recorder = new QaInstructionsRecorder();
  for (const event of [
    start,
    fill,
    {
      type: 'check',
      matcher: 'toHaveValue',
      negated: false,
      subject: 'element',
      failed: true,
      ref: 'c1',
    },
    { type: 'testEnd', status: 'failed' },
  ] as TestEvent[]) {
    recorder.handle(event);
  }
  const source = new CheckSource({
    c1: { target: { by: 'label', value: 'Quantity' }, expected: '3' },
  });
  assert.deepEqual(
    recorder
      .toRecording(source)
      .bundle.steps.map(({ expected, failed }) => ({ expected, failed })),
    [{ expected: '**Quantity** shows **3**', failed: true }],
  );
  // Text only, the check says nothing a tester can see, so no step is marked.
  assert.deepEqual(
    recorder.toBundle().steps.map(({ failed }) => failed),
    [undefined],
  );
});

test('a pattern of plain text reads as the text the page must contain', () => {
  const pattern = (
    matcher: string,
    source: string,
    subject: 'page' | 'element',
    negated = false,
  ): TestEvent => ({
    type: 'check',
    matcher,
    negated,
    subject,
    target:
      subject === 'element' ? { by: 'label', value: 'Status' } : undefined,
    expectedPattern: { source, flags: '' },
  });

  assert.deepEqual(
    expected(
      undefined,
      pattern('toHaveURL', 'login-error', 'page'),
      pattern('toHaveTitle', 'Sign in', 'page'),
      pattern('toHaveText', 'Paid', 'element'),
      pattern('toHaveValue', 'order\\.pdf', 'element', true),
    ),
    [
      'The page address contains **login-error**; the page title contains **Sign in**; **Status** contains **Paid**; **Status** does not contain **order.pdf**',
    ],
  );
});

test('a pattern that is more than plain text is shown as written', () => {
  assert.deepEqual(
    expected(undefined, {
      type: 'check',
      matcher: 'toHaveURL',
      negated: false,
      subject: 'page',
      expectedPattern: { source: '\\/orders\\/\\d+$', flags: 'i' },
    }),
    ['The page address matches **/\\/orders\\/\\d+$/i**'],
  );
});

test('a pattern from the source fills a check the test reported none for', () => {
  const check: TestEvent = {
    type: 'check',
    matcher: 'toHaveURL',
    negated: false,
    subject: 'page',
    ref: 'c1',
  };
  assert.deepEqual(
    expected(
      new CheckSource({
        c1: { expectedPattern: { source: 'login-error', flags: '' } },
      }),
      check,
    ),
    ['The page address contains **login-error**'],
  );
});
