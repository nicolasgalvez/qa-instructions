import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRecorder,
  renderQaSteps,
  type QaRunBundle,
  type SectionPresentation,
  type TestEvent,
} from '../src/index.js';

const start: TestEvent = {
  type: 'testStart',
  title: 'Check out',
  runner: 'playwright',
  baseUrl: 'http://127.0.0.1:4321',
};
const passed: TestEvent = { type: 'testEnd', status: 'passed' };

const groupStart = (title: string): TestEvent => ({
  type: 'groupStart',
  title,
});
const groupEnd = (title: string): TestEvent => ({ type: 'groupEnd', title });
const click = (name: string): TestEvent => ({
  type: 'action',
  kind: 'click',
  target: { by: 'role', role: 'button', name },
});
const visible = (name: string): TestEvent => ({
  type: 'check',
  matcher: 'toBeVisible',
  negated: false,
  subject: 'element',
  target: { by: 'role', role: 'heading', name },
});

function record(
  sections: SectionPresentation | undefined,
  ...events: TestEvent[]
): QaRunBundle {
  const recorder = new QaInstructionsRecorder(
    sections === undefined ? {} : { sections },
  );
  for (const event of [start, ...events, passed]) recorder.handle(event);
  return recorder.toBundle();
}

/** Two groups, the second holding a nested group, then an ungrouped step. */
const groupedTest: TestEvent[] = [
  groupStart('Add to cart'),
  { type: 'action', kind: 'navigate', url: '/product' },
  { type: 'action', kind: 'wait' },
  click('Add'),
  visible('Cart'),
  groupEnd('Add to cart'),
  groupStart('Pay'),
  click('Checkout'),
  groupStart('Enter card'),
  {
    type: 'action',
    kind: 'fill',
    target: { by: 'label', value: 'Card' },
    value: '4242',
  },
  groupEnd('Enter card'),
  click('Pay now'),
  visible('Thank you'),
  groupEnd('Pay'),
  { type: 'action', kind: 'reload' },
];

test('by default each group is a Section heading, numbering continuous', () => {
  assert.equal(
    renderQaSteps(record(undefined, ...groupedTest)),
    [
      '### Add to cart',
      '1. Open http://127.0.0.1:4321/product',
      '2. Click the **Add** button — The **Cart** heading is visible',
      '',
      '### Pay',
      '3. Click the **Checkout** button',
      '',
      '### Pay › Enter card',
      '4. Type **4242** into **Card**',
      '',
      '### Pay',
      '5. Click the **Pay now** button — The **Thank you** heading is visible',
      '',
      '6. Reload the page',
      '',
    ].join('\n'),
  );
});

test('the bundle records each QA Step’s Section, outermost group first', () => {
  const bundle = record('sections', ...groupedTest);
  assert.deepEqual(
    bundle.steps.map((step) => step.section),
    [
      ['Add to cart'],
      ['Add to cart'],
      ['Pay'],
      ['Pay', 'Enter card'],
      ['Pay'],
      undefined,
    ],
  );
});

test('"collapse" turns each group into one QA Step named after it', () => {
  const bundle = record('collapse', ...groupedTest);
  assert.equal(
    renderQaSteps(bundle),
    [
      '1. Add to cart — The **Cart** heading is visible',
      '2. Pay — The **Thank you** heading is visible',
      '3. Reload the page',
      '',
    ].join('\n'),
  );
  assert.equal(bundle.steps[0].url, 'http://127.0.0.1:4321/product');
  assert.ok(bundle.steps.every((step) => step.section === undefined));
});

test('"collapse" marks the group’s QA Step when an Action inside it fails', () => {
  const recorder = new QaInstructionsRecorder({ sections: 'collapse' });
  for (const event of [
    start,
    groupStart('Pay'),
    click('Checkout'),
    { ...click('Pay now'), failed: true } as TestEvent,
    groupEnd('Pay'),
    { type: 'testEnd', status: 'failed' } as TestEvent,
  ]) {
    recorder.handle(event);
  }
  assert.equal(
    renderQaSteps(recorder.toBundle()),
    [
      '**Incomplete:** the test failed at step 1, so any later steps are missing.',
      '',
      '1. Pay (**test failed here**)',
      '',
    ].join('\n'),
  );
});

test('"collapse" keeps checks made after a group with its QA Step', () => {
  assert.equal(
    renderQaSteps(
      record(
        'collapse',
        groupStart('Add to cart'),
        click('Add'),
        groupEnd('Add to cart'),
        visible('Cart'),
      ),
    ),
    '1. Add to cart — The **Cart** heading is visible\n',
  );
});

test('"collapse" skips a group with nothing a tester can do', () => {
  assert.equal(
    renderQaSteps(
      record(
        'collapse',
        click('Add'),
        groupStart('Wait for the cart'),
        { type: 'action', kind: 'wait' },
        visible('Cart'),
        groupEnd('Wait for the cart'),
      ),
    ),
    '1. Click the **Add** button — The **Cart** heading is visible\n',
  );
});

test('"ignore" lists the QA Steps flat with no headings', () => {
  const bundle = record('ignore', ...groupedTest);
  assert.equal(
    renderQaSteps(bundle),
    [
      '1. Open http://127.0.0.1:4321/product',
      '2. Click the **Add** button — The **Cart** heading is visible',
      '3. Click the **Checkout** button',
      '4. Type **4242** into **Card**',
      '5. Click the **Pay now** button — The **Thank you** heading is visible',
      '6. Reload the page',
      '',
    ].join('\n'),
  );
  assert.ok(bundle.steps.every((step) => step.section === undefined));
});

test('a group with no QA Steps produces no heading', () => {
  assert.equal(
    renderQaSteps(
      record(
        'sections',
        click('Add'),
        groupStart('Wait for the cart'),
        { type: 'action', kind: 'wait' },
        groupEnd('Wait for the cart'),
      ),
    ),
    '1. Click the **Add** button\n',
  );
});

test('tests with no groups are unaffected in every mode', () => {
  const ungrouped: TestEvent[] = [click('Add'), visible('Cart')];
  for (const mode of ['sections', 'collapse', 'ignore'] as const) {
    assert.equal(
      renderQaSteps(record(mode, ...ungrouped)),
      '1. Click the **Add** button — The **Cart** heading is visible\n',
      mode,
    );
  }
});

test('a Section heading follows the prerequisite with one blank line', () => {
  const bundle = record('sections', groupStart('Add'), click('Add'));
  bundle.meta.prerequisite = 'Deploy to dev first.';
  assert.equal(
    renderQaSteps(bundle),
    'Deploy to dev first.\n\n### Add\n1. Click the **Add** button\n',
  );
});
