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

test('a test that does not pass is marked failed', () => {
  const recorder = new QaInstructionsRecorder();
  recorder.handle(start);
  recorder.handle({ type: 'testEnd', status: 'failed' });
  assert.equal(recorder.toBundle().meta.status, 'failed');
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
