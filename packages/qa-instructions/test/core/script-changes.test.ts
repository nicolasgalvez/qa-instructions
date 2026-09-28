import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRecorder,
  ScriptChangeRule,
  renderQaSteps,
  type ActionCapture,
  type ActionEvent,
  type ScreenshotSource,
  type SectionPresentation,
  type TestEvent,
} from '../../src/core/index.js';

/** What a recording of the page (e.g. a trace) says about each call, by ref. */
class RecordedFacts implements ScreenshotSource {
  constructor(private readonly captures: Record<string, ActionCapture>) {}

  capture(ref: string): ActionCapture | undefined {
    return this.captures[ref];
  }
}

const unchanged: ActionCapture = { screenshots: [], pageChanged: false };
const changed: ActionCapture = { screenshots: [], pageChanged: true };

function qaSteps(
  source: ScreenshotSource,
  events: TestEvent[],
  sections: SectionPresentation = 'sections',
): string {
  const recorder = new QaInstructionsRecorder({ sections });
  for (const event of [
    {
      type: 'testStart',
      title: 'Buy',
      runner: 'playwright',
      file: '/proj/buy.spec.ts',
      baseUrl: 'http://127.0.0.1:4321',
    },
    ...events,
    { type: 'testEnd', status: 'passed' },
  ] as TestEvent[]) {
    recorder.handle(event);
  }
  return renderQaSteps(recorder.toRecording(source).bundle);
}

const open: ActionEvent = {
  type: 'action',
  kind: 'navigate',
  url: '/leed',
  ref: 'open',
};
const openSections: ActionEvent = {
  type: 'action',
  kind: 'script',
  target: { by: 'selector', value: 'details:not([open])' },
  resultUsed: false,
  ref: 'script',
};
const quantityShown: TestEvent = {
  type: 'check',
  matcher: 'toBeVisible',
  negated: false,
  subject: 'element',
  target: { by: 'label', value: 'Quantity' },
};
const buy: ActionEvent = {
  type: 'action',
  kind: 'click',
  target: { by: 'role', role: 'button', name: 'Purchase' },
  ref: 'buy',
};

const WARNING =
  'Warning: The test changed the element with a script instead of a user action. If the page does not match what comes next, change it by hand to continue.';

test('a script the recording says changed nothing is no warning, and its checks stay with the step before', () => {
  assert.equal(
    qaSteps(new RecordedFacts({ script: unchanged }), [
      open,
      openSections,
      quantityShown,
      buy,
    ]),
    '1. Open http://127.0.0.1:4321/leed — **Quantity** is visible\n' +
      '2. Click the **Purchase** button\n',
  );
});

test('a script the recording says changed the page is a warning, even when its result was used', () => {
  assert.equal(
    qaSteps(new RecordedFacts({ script: changed }), [
      open,
      { ...openSections, resultUsed: true },
      buy,
    ]),
    '1. Open http://127.0.0.1:4321/leed\n' +
      `2. ${WARNING}\n` +
      '3. Click the **Purchase** button\n',
  );
});

test('an event dispatched by script that the recording says changed nothing is no warning', () => {
  assert.equal(
    qaSteps(new RecordedFacts({ dispatch: unchanged }), [
      open,
      {
        type: 'action',
        kind: 'dispatch',
        target: { by: 'text', value: 'More' },
        value: 'click',
        ref: 'dispatch',
      },
    ]),
    '1. Open http://127.0.0.1:4321/leed\n',
  );
});

test('without a recording of the page, the test source decides', () => {
  assert.equal(
    qaSteps(new RecordedFacts({ script: { screenshots: [] } }), [
      open,
      openSections,
    ]),
    `1. Open http://127.0.0.1:4321/leed\n2. ${WARNING}\n`,
  );
});

test('an Action the recording says was forced is approximate, however the test built its options', () => {
  assert.equal(
    qaSteps(new RecordedFacts({ buy: { screenshots: [], forced: true } }), [
      buy,
    ]),
    '1. Click the **Purchase** button (approximate: the test forced this Action past its usual checks, so its highlight may not line up)\n',
  );
});

test('a script that changed nothing does not split a collapsed group', () => {
  const group = (title: string): TestEvent[] => [
    { type: 'groupStart', title },
    open,
    openSections,
    buy,
    { type: 'groupEnd', title },
  ];
  assert.equal(
    qaSteps(
      new RecordedFacts({ script: unchanged }),
      group('Buy LEED RECs'),
      'collapse',
    ),
    '1. Buy LEED RECs\n',
  );
  assert.equal(
    qaSteps(
      new RecordedFacts({ script: changed }),
      group('Buy LEED RECs'),
      'collapse',
    ),
    `1. Buy LEED RECs\n2. ${WARNING}\n3. Buy LEED RECs\n`,
  );
});

test('a script the recording says opened collapsed sections names each by its heading and says to click it open', () => {
  const opened = (...names: string[]): ActionCapture => ({
    ...changed,
    sectionChanges: { opened: names, closed: [] },
  });
  assert.equal(
    qaSteps(new RecordedFacts({ script: opened('Explore more categories') }), [
      openSections,
    ]),
    '1. Warning: The test opened the **Explore more categories** section with a script instead of a user action. Click it to open it if it is closed.\n',
  );
  assert.equal(
    qaSteps(
      new RecordedFacts({ script: opened('Shipping', 'Returns', 'Contact') }),
      [openSections],
    ),
    '1. Warning: The test opened the **Shipping**, **Returns**, and **Contact** sections with a script instead of a user action. Click each one to open it if it is closed.\n',
  );
});

test('a script the recording says closed sections says to click them closed', () => {
  assert.equal(
    qaSteps(
      new RecordedFacts({
        script: {
          ...changed,
          sectionChanges: { opened: [], closed: ['Shipping', 'Returns'] },
        },
      }),
      [openSections],
    ),
    '1. Warning: The test closed the **Shipping** and **Returns** sections with a script instead of a user action. Click each one to close it if it is open.\n',
  );
});

test('a script that both opened and closed sections keeps the plain warning', () => {
  assert.equal(
    qaSteps(
      new RecordedFacts({
        script: {
          ...changed,
          sectionChanges: { opened: ['Shipping'], closed: ['Returns'] },
        },
      }),
      [openSections],
    ),
    `1. ${WARNING}\n`,
  );
});

test('the rule: what the recording says wins over what the test did with the result', () => {
  const rule = new ScriptChangeRule();
  const used = { ...openSections, resultUsed: true };
  assert.equal(rule.changesPage(used), false);
  assert.equal(rule.changesPage(used, { pageChanged: true }), true);
  assert.equal(rule.changesPage(openSections, { pageChanged: false }), false);
  assert.equal(
    rule.changesPage({ ...openSections, failed: true }, { pageChanged: true }),
    false,
  );
  assert.equal(rule.changesPage(buy, { pageChanged: true }), false);
});
