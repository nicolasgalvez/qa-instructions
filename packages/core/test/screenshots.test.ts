import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRecorder,
  QaInstructionsRun,
  type ActionCapture,
  type ActionEvent,
  type QaInstructionsRecorderOptions,
  type QaRecording,
  type ScreenshotSource,
  type TestEvent,
} from '../src/index.js';

const png = (label: string) => Buffer.from(`png:${label}`);

/** A screenshot source backed by a plain map, keyed by action ref. */
class MapScreenshotSource implements ScreenshotSource {
  constructor(private readonly captures: Record<string, ActionCapture>) {}

  capture(ref: string): ActionCapture | undefined {
    return this.captures[ref];
  }
}

const start: TestEvent = {
  type: 'testStart',
  title: 'Paint',
  runner: 'playwright',
  file: '/proj/tests/paint.spec.ts',
};
const passed: TestEvent = { type: 'testEnd', status: 'passed' };

function recorderFor(
  events: TestEvent[],
  options?: QaInstructionsRecorderOptions,
): QaInstructionsRecorder {
  const recorder = new QaInstructionsRecorder(options);
  for (const event of [start, ...events, passed]) recorder.handle(event);
  return recorder;
}

function record(source: ScreenshotSource, ...events: TestEvent[]): QaRecording {
  return recorderFor(events).toRecording(source);
}

const click: ActionEvent = {
  type: 'action',
  kind: 'click',
  target: { by: 'role', role: 'button', name: 'Paint' },
  ref: 'click',
};

test('each QA Step with an Action gets its Step Screenshot, stored with the bundle', () => {
  const { bundle, assets } = record(
    new MapScreenshotSource({
      open: {
        screenshots: [
          { moment: 'before', contentType: 'image/png', data: png('blank') },
          { moment: 'after', contentType: 'image/png', data: png('loaded') },
        ],
      },
      click: {
        screenshots: [
          { moment: 'before', contentType: 'image/png', data: png('before') },
          { moment: 'after', contentType: 'image/png', data: png('after') },
          { moment: 'action', contentType: 'image/png', data: png('action') },
        ],
        box: { x: 40, y: 40, width: 120, height: 40 },
        point: { x: 100, y: 60 },
      },
    }),
    {
      type: 'action',
      kind: 'navigate',
      url: 'https://example.com/',
      ref: 'open',
    },
    click,
  );

  assert.deepEqual(
    bundle.steps.map((step) => step.assetIds),
    [['step-01'], ['step-02']],
  );
  // As written to bundle.json.
  assert.deepEqual(JSON.parse(JSON.stringify(bundle.assets)), {
    'step-01': {
      id: 'step-01',
      contentType: 'image/png',
      filename: 'step-01.png',
    },
    'step-02': {
      id: 'step-02',
      contentType: 'image/png',
      filename: 'step-02.png',
    },
  });
  assert.deepEqual(
    assets.map(({ filename, data }) => [filename, data.toString()]),
    [
      // No action-moment image for a navigation: the loaded page, not the blank one.
      ['step-01.png', 'png:loaded'],
      // The moment of the Action is preferred over before and after.
      ['step-02.png', 'png:action'],
    ],
  );
  assert.deepEqual(
    bundle.steps.map((step) => step.screenshotMoment),
    ['after', 'action'],
  );
});

test('the element box and click point of an Action are kept on its QA Step', () => {
  const { bundle } = record(
    new MapScreenshotSource({
      click: {
        screenshots: [],
        box: { x: 40, y: 40, width: 120, height: 40 },
        point: { x: 100, y: 60 },
      },
    }),
    click,
  );

  assert.deepEqual(bundle.steps[0].elementBox, {
    x: 40,
    y: 40,
    width: 120,
    height: 40,
  });
  assert.deepEqual(bundle.steps[0].clickPoint, { x: 100, y: 60 });
  assert.equal(bundle.steps[0].assetIds, undefined);
});

test('a before-only capture still gives the QA Step a screenshot', () => {
  const { assets } = record(
    new MapScreenshotSource({
      click: {
        screenshots: [
          { moment: 'before', contentType: 'image/png', data: png('before') },
        ],
      },
    }),
    click,
  );
  assert.deepEqual(
    assets.map(({ data }) => data.toString()),
    ['png:before'],
  );
});

test('QA Steps without a capture, and checks, are recorded without error', () => {
  const { bundle, assets } = record(
    new MapScreenshotSource({}),
    { type: 'action', kind: 'reload' },
    { ...click, ref: 'unknown' },
    {
      type: 'check',
      matcher: 'toBeVisible',
      negated: false,
      subject: 'element',
      target: { by: 'text', value: 'Done' },
    },
  );

  assert.equal(bundle.steps.length, 2);
  assert.deepEqual(bundle.assets, {});
  assert.deepEqual(assets, []);
  for (const step of bundle.steps) {
    assert.equal(step.assetIds, undefined);
    assert.equal(step.elementBox, undefined);
    assert.equal(step.clickPoint, undefined);
  }
});

test('test plumbing never takes a Step Screenshot', () => {
  const { bundle, assets } = record(
    new MapScreenshotSource({
      wait: {
        screenshots: [
          { moment: 'after', contentType: 'image/png', data: png('wait') },
        ],
      },
    }),
    { type: 'action', kind: 'wait', ref: 'wait' },
  );
  assert.equal(bundle.steps.length, 0);
  assert.deepEqual(assets, []);
});

test('without a screenshot source, QA Instructions have no screenshots', () => {
  const recorder = recorderFor([click]);
  const { bundle, assets } = recorder.toRecording();
  assert.equal(bundle.steps[0].assetIds, undefined);
  assert.deepEqual(assets, []);
  assert.equal(recorder.toBundle().steps[0].assetIds, undefined);
});

test('a script-change warning step shows the page the script left', () => {
  const { bundle, assets } = record(
    new MapScreenshotSource({
      script: {
        screenshots: [
          { moment: 'before', contentType: 'image/png', data: png('closed') },
          { moment: 'after', contentType: 'image/png', data: png('opened') },
        ],
      },
    }),
    { type: 'action', kind: 'script', ref: 'script' },
  );

  assert.equal(bundle.steps[0].warning, true);
  assert.equal(bundle.steps[0].screenshotMoment, 'after');
  assert.deepEqual(
    assets.map(({ data }) => data.toString()),
    ['png:opened'],
  );
});

test('a collapsed group takes the Step Screenshot of its first Action', () => {
  const { bundle, assets } = recorderFor(
    [
      { type: 'groupStart', title: 'Paint the page' },
      { ...click, ref: 'first' },
      { ...click, ref: 'second' },
      { type: 'groupEnd', title: 'Paint the page' },
    ],
    { sections: 'collapse' },
  ).toRecording(
    new MapScreenshotSource({
      first: {
        screenshots: [
          { moment: 'action', contentType: 'image/png', data: png('first') },
        ],
      },
      second: {
        screenshots: [
          { moment: 'action', contentType: 'image/png', data: png('second') },
        ],
      },
    }),
  );

  assert.deepEqual(
    bundle.steps.map((step) => [step.action, step.assetIds]),
    [['Paint the page', ['step-01']]],
  );
  assert.deepEqual(
    assets.map(({ data }) => data.toString()),
    ['png:first'],
  );
});

test('a run records each test with Step Screenshots from its own source', () => {
  const run = new QaInstructionsRun();
  for (const event of [start, click, passed]) run.handle(event);

  const [result] = run.results();
  assert.equal(result.start.title, 'Paint');
  assert.equal(result.bundle.steps[0].assetIds, undefined);
  const { bundle, assets } = result.record(
    new MapScreenshotSource({
      click: {
        screenshots: [
          { moment: 'after', contentType: 'image/png', data: png('after') },
        ],
      },
    }),
  );
  assert.deepEqual(bundle.steps[0].assetIds, ['step-01']);
  assert.deepEqual(
    assets.map(({ data }) => data.toString()),
    ['png:after'],
  );
});
