import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRecorder,
  renderQaSteps,
  type QaRunBundle,
  type TestEvent,
} from '../src/index.js';

const start: TestEvent = {
  type: 'testStart',
  title: 'Sign in',
  runner: 'playwright',
  file: '/proj/tests/sign-in.spec.ts',
  project: 'chromium',
  baseUrl: 'http://127.0.0.1:4321',
};
const passed: TestEvent = { type: 'testEnd', status: 'passed' };

function record(...events: TestEvent[]): QaRunBundle {
  const recorder = new QaInstructionsRecorder();
  for (const event of [start, ...events, passed]) recorder.handle(event);
  return recorder.toBundle();
}

function qaSteps(...events: TestEvent[]) {
  return record(...events).steps.map(({ action, expected }) =>
    expected === undefined ? { action } : { action, expected },
  );
}

test('QA Instructions are titled after the test and record its source', () => {
  const bundle = record();
  assert.equal(bundle.meta.title, 'Sign in');
  assert.equal(bundle.meta.status, 'complete');
  assert.deepEqual(bundle.meta.source, {
    runner: 'playwright',
    testFile: '/proj/tests/sign-in.spec.ts',
    testTitle: 'Sign in',
    project: 'chromium',
  });
});

function recordFailure(...events: TestEvent[]): QaRunBundle {
  const recorder = new QaInstructionsRecorder();
  for (const event of [
    start,
    ...events,
    { type: 'testEnd', status: 'failed' } as TestEvent,
  ]) {
    recorder.handle(event);
  }
  return recorder.toBundle();
}

const failedSteps = (bundle: QaRunBundle) =>
  bundle.steps.filter((step) => step.failed).map((step) => step.index);

test('a test that does not pass is marked incomplete', () => {
  for (const status of ['failed', 'timedOut', 'interrupted'] as const) {
    const recorder = new QaInstructionsRecorder();
    recorder.handle(start);
    recorder.handle({ type: 'testEnd', status });
    assert.equal(recorder.toBundle().meta.status, 'incomplete');
  }
});

test('a failed Action is the last QA Step and is marked as the failing step', () => {
  const bundle = recordFailure(
    { type: 'action', kind: 'navigate', url: '/' },
    {
      type: 'action',
      kind: 'click',
      target: { by: 'role', role: 'link', name: 'Sign in' },
      failed: true,
    },
    // After-hooks and anything else after the failure are not QA Steps.
    { type: 'action', kind: 'reload' },
    {
      type: 'check',
      matcher: 'toBeVisible',
      negated: false,
      subject: 'element',
      target: { by: 'text', value: 'Hello' },
    },
  );
  assert.equal(bundle.meta.status, 'incomplete');
  assert.deepEqual(
    bundle.steps.map((step) => step.action),
    ['Open http://127.0.0.1:4321/', 'Click the **Sign in** link'],
  );
  assert.deepEqual(failedSteps(bundle), [2]);
});

test('a failed check marks the QA Step whose Expected Result it is', () => {
  const bundle = recordFailure(
    { type: 'action', kind: 'navigate', url: '/' },
    {
      type: 'check',
      matcher: 'toHaveTitle',
      negated: false,
      subject: 'page',
      expected: 'Home',
      failed: true,
    },
    { type: 'action', kind: 'reload' },
  );
  assert.deepEqual(
    bundle.steps.map(({ action, expected }) => ({ action, expected })),
    [
      {
        action: 'Open http://127.0.0.1:4321/',
        expected: 'The page title is **Home**',
      },
    ],
  );
  assert.deepEqual(failedSteps(bundle), [1]);
});

test('a failure a tester cannot see ends the QA Steps without marking one', () => {
  const bundle = recordFailure(
    { type: 'action', kind: 'navigate', url: '/' },
    { type: 'action', kind: 'script', failed: true },
    { type: 'action', kind: 'reload' },
  );
  assert.equal(bundle.meta.status, 'incomplete');
  assert.deepEqual(
    bundle.steps.map((step) => step.action),
    ['Open http://127.0.0.1:4321/'],
  );
  assert.deepEqual(failedSteps(bundle), []);
});

test('a test that fails before any Action is incomplete with no QA Steps', () => {
  const bundle = recordFailure(
    { type: 'action', kind: 'setup', failed: true },
    { type: 'action', kind: 'navigate', url: '/' },
  );
  assert.equal(bundle.meta.status, 'incomplete');
  assert.deepEqual(bundle.steps, []);
});

test('incomplete QA Instructions say where the test failed', () => {
  assert.equal(
    renderQaSteps(
      recordFailure(
        { type: 'action', kind: 'navigate', url: '/' },
        { type: 'action', kind: 'reload', failed: true },
      ),
    ),
    '**Incomplete:** the test failed at step 2, so any later steps are missing.\n' +
      '\n' +
      '1. Open http://127.0.0.1:4321/\n' +
      '2. Reload the page (**test failed here**)\n',
  );
  assert.equal(
    renderQaSteps(
      recordFailure(
        { type: 'action', kind: 'navigate', url: '/' },
        { type: 'action', kind: 'wait', failed: true },
      ),
    ),
    '**Incomplete:** the test failed after step 1, so any later steps are missing.\n' +
      '\n' +
      '1. Open http://127.0.0.1:4321/\n',
  );
  assert.equal(
    renderQaSteps(recordFailure()),
    '**Incomplete:** the test failed before its first step.\n',
  );
});

test('opening a URL is a QA Step with the full URL', () => {
  const bundle = record({ type: 'action', kind: 'navigate', url: '/login' });
  assert.equal(bundle.steps.length, 1);
  assert.equal(bundle.steps[0].action, 'Open http://127.0.0.1:4321/login');
  assert.equal(bundle.steps[0].url, 'http://127.0.0.1:4321/login');
});

test('an absolute URL is kept as written', () => {
  assert.deepEqual(
    qaSteps({ type: 'action', kind: 'navigate', url: 'https://example.com/a' }),
    [{ action: 'Open https://example.com/a' }],
  );
});

test('each Action names the element as a tester sees it', () => {
  assert.deepEqual(
    qaSteps(
      {
        type: 'action',
        kind: 'click',
        target: { by: 'role', role: 'link', name: 'Get started' },
      },
      {
        type: 'action',
        kind: 'fill',
        target: { by: 'label', value: 'Quantity' },
        value: '3',
      },
      {
        type: 'action',
        kind: 'press',
        target: { by: 'placeholder', value: 'Search' },
        value: 'Enter',
      },
      { type: 'action', kind: 'press', value: 'Tab' },
      {
        type: 'action',
        kind: 'select',
        target: { by: 'role', role: 'combobox', name: 'Size' },
        value: 'Large',
      },
      {
        type: 'action',
        kind: 'check',
        target: { by: 'role', role: 'checkbox', name: 'Remember me' },
      },
      {
        type: 'action',
        kind: 'hover',
        target: { by: 'text', value: 'Products' },
      },
      {
        type: 'action',
        kind: 'doubleClick',
        target: { by: 'role', role: 'button' },
      },
      {
        type: 'action',
        kind: 'click',
        target: { by: 'testId', value: 'sign-in-link' },
      },
      {
        type: 'action',
        kind: 'fill',
        target: { by: 'label', value: 'Notes' },
        value: '',
      },
      { type: 'action', kind: 'reload' },
    ),
    [
      { action: 'Click the **Get started** link' },
      { action: 'Type **3** into **Quantity**' },
      { action: 'Press **Enter** in the **Search** field' },
      { action: 'Press **Tab**' },
      { action: 'Choose **Large** in the **Size** dropdown' },
      { action: 'Check the **Remember me** checkbox' },
      { action: 'Hover over **Products**' },
      { action: 'Double-click the button' },
      { action: 'Click the **sign in link** element' },
      { action: 'Clear **Notes**' },
      { action: 'Reload the page' },
    ],
  );
});

test('test plumbing never becomes a QA Step', () => {
  assert.deepEqual(
    qaSteps(
      { type: 'action', kind: 'setup' },
      { type: 'action', kind: 'navigate', url: '/' },
      { type: 'action', kind: 'wait' },
      { type: 'action', kind: 'script' },
      { type: 'action', kind: 'read' },
      { type: 'action', kind: 'request', url: '/api/cart' },
      { type: 'action', kind: 'other' },
    ),
    [{ action: 'Open http://127.0.0.1:4321/' }],
  );
});

test('checks that follow an Action become its Expected Result', () => {
  assert.deepEqual(
    qaSteps(
      {
        type: 'action',
        kind: 'click',
        target: { by: 'role', role: 'button', name: 'Add' },
      },
      { type: 'action', kind: 'wait' },
      {
        type: 'check',
        matcher: 'toHaveText',
        negated: false,
        subject: 'element',
        target: { by: 'label', value: 'Cart' },
        expected: '3',
      },
      {
        type: 'check',
        matcher: 'toBeVisible',
        negated: false,
        subject: 'element',
        target: { by: 'role', role: 'heading', name: 'Cart' },
      },
      {
        type: 'action',
        kind: 'click',
        target: { by: 'role', role: 'button', name: 'Checkout' },
      },
    ),
    [
      {
        action: 'Click the **Add** button',
        expected: '**Cart** shows **3**; the **Cart** heading is visible',
      },
      { action: 'Click the **Checkout** button' },
    ],
  );
});

test('checks are worded in plain language, including negation', () => {
  const check = (
    matcher: string,
    negated = false,
    expected?: string,
  ): TestEvent => ({
    type: 'check',
    matcher,
    negated,
    subject: 'element',
    target: { by: 'role', role: 'button', name: 'Pay' },
    expected,
  });
  const expectedFor = (event: TestEvent) =>
    record({ type: 'action', kind: 'reload' }, event).steps[0].expected;

  assert.equal(
    expectedFor(check('toBeVisible', true)),
    'The **Pay** button is not visible',
  );
  assert.equal(
    expectedFor(check('toBeHidden', true)),
    'The **Pay** button is visible',
  );
  assert.equal(
    expectedFor(check('toBeDisabled')),
    'The **Pay** button is disabled',
  );
  assert.equal(
    expectedFor(check('toContainText', false, 'Pay now')),
    'The **Pay** button contains **Pay now**',
  );
  assert.equal(
    expectedFor(check('toHaveText', true, 'Paid')),
    'The **Pay** button does not show **Paid**',
  );
});

test('checks a tester cannot see are not Expected Results', () => {
  assert.deepEqual(
    qaSteps(
      { type: 'action', kind: 'reload' },
      {
        type: 'check',
        matcher: 'toContain',
        negated: false,
        subject: 'value',
        expected: 'LOGIN',
      },
      {
        type: 'check',
        matcher: 'toHaveAttribute',
        negated: false,
        subject: 'element',
        target: { by: 'label', value: 'Email' },
      },
      { type: 'check', matcher: 'toHaveURL', negated: false, subject: 'page' },
    ),
    [{ action: 'Reload the page' }],
  );
});

test('page checks with a readable expected value are Expected Results', () => {
  assert.deepEqual(
    qaSteps(
      { type: 'action', kind: 'navigate', url: '/' },
      {
        type: 'check',
        matcher: 'toHaveTitle',
        negated: false,
        subject: 'page',
        expected: 'Fixture Home',
      },
    ),
    [
      {
        action: 'Open http://127.0.0.1:4321/',
        expected: 'The page title is **Fixture Home**',
      },
    ],
  );
});

test('a check before any Action is not attached to anything', () => {
  assert.deepEqual(
    qaSteps(
      {
        type: 'check',
        matcher: 'toBeVisible',
        negated: false,
        subject: 'element',
        target: { by: 'text', value: 'Hello' },
      },
      { type: 'action', kind: 'reload' },
    ),
    [{ action: 'Reload the page' }],
  );
});

test('QA Steps render as numbered Jira-ready text', () => {
  const bundle = record(
    { type: 'action', kind: 'navigate', url: '/' },
    {
      type: 'check',
      matcher: 'toBeVisible',
      negated: false,
      subject: 'element',
      target: { by: 'role', role: 'heading', name: 'Welcome' },
    },
    {
      type: 'action',
      kind: 'click',
      target: { by: 'role', role: 'link', name: 'Sign in' },
    },
  );
  assert.equal(
    renderQaSteps(bundle),
    '1. Open http://127.0.0.1:4321/ — The **Welcome** heading is visible\n' +
      '2. Click the **Sign in** link\n',
  );
});
