import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HighlightPlanner,
  StepScreenshotHighlighter,
  type Highlight,
  type QaAssetInput,
  type QaRecording,
  type QaSize,
  type QaStep,
  type ScreenshotAnnotator,
  type StepImage,
} from '../src/index.js';

const VIEWPORT: QaSize = { width: 800, height: 600 };
const IMAGE_1X: QaSize = { width: 800, height: 600 };
const IMAGE_2X: QaSize = { width: 1600, height: 1200 };

const click: QaStep = {
  index: 2,
  action: 'Click the **Menu** button',
  screenshotMoment: 'action',
  viewport: VIEWPORT,
  elementBox: { x: 40, y: 40, width: 120, height: 40 },
  clickPoint: { x: 100, y: 60 },
};

const COLOR = '#ff0080';

test('by default a click is outlined and its click point marked', () => {
  const highlight = new HighlightPlanner().plan(click, IMAGE_1X);

  assert.deepEqual(highlight, {
    color: COLOR,
    // 2px clear of the element, 3px thick.
    outline: { rect: { x: 35, y: 35, width: 130, height: 50 }, strokeWidth: 3 },
    clickDot: { x: 100, y: 60, radius: 6, ringWidth: 2 },
  });
});

test('geometry is scaled from the viewport to the image on a high-DPI (2x) run', () => {
  const highlight = new HighlightPlanner().plan(click, IMAGE_2X);

  assert.deepEqual(highlight, {
    color: COLOR,
    outline: {
      rect: { x: 70, y: 70, width: 260, height: 100 },
      strokeWidth: 6,
    },
    clickDot: { x: 200, y: 120, radius: 12, ringWidth: 4 },
  });
});

test('without a known viewport the image is taken to be at viewport scale', () => {
  const highlight = new HighlightPlanner().plan(
    { ...click, viewport: undefined },
    IMAGE_1X,
  );
  assert.deepEqual(highlight?.outline?.rect, {
    x: 35,
    y: 35,
    width: 130,
    height: 50,
  });
});

test('the outline snaps outward to whole pixels so its edges stay crisp', () => {
  const highlight = new HighlightPlanner().plan(
    {
      ...click,
      elementBox: { x: 129.015625, y: 165.875, width: 153, height: 21 },
    },
    IMAGE_1X,
  );
  assert.deepEqual(highlight?.outline?.rect, {
    x: 124,
    y: 160,
    width: 164,
    height: 32,
  });
});

test('a fill is outlined with no click point', () => {
  const highlight = new HighlightPlanner().plan(
    { ...click, action: 'Type **a** into **Name**', clickPoint: undefined },
    IMAGE_1X,
  );
  assert.ok(highlight?.outline);
  assert.equal(highlight?.clickDot, undefined);
});

test('an Action with no element (navigation, key press) has no Highlight', () => {
  const highlight = new HighlightPlanner().plan(
    {
      index: 1,
      action: 'Press **Tab**',
      screenshotMoment: 'action',
      viewport: VIEWPORT,
    },
    IMAGE_1X,
  );
  assert.equal(highlight, undefined);
});

test('a warning step has no Highlight', () => {
  const highlight = new HighlightPlanner().plan(
    { ...click, warning: true },
    IMAGE_1X,
  );
  assert.equal(highlight, undefined);
});

test('a screenshot from after the Action is not highlighted: the page may have moved on', () => {
  const highlight = new HighlightPlanner().plan(
    { ...click, screenshotMoment: 'after' },
    IMAGE_1X,
  );
  assert.equal(highlight, undefined);
});

test('a screenshot from just before the Action is highlighted', () => {
  const highlight = new HighlightPlanner().plan(
    { ...click, screenshotMoment: 'before' },
    IMAGE_1X,
  );
  assert.ok(highlight?.outline);
});

test('an approximate Action gets a dashed outline, scaled with the image', () => {
  const planner = new HighlightPlanner();
  const approximate = { ...click, approximate: true };

  assert.equal(planner.plan(approximate, IMAGE_1X)?.outline?.dash, 6);
  assert.equal(planner.plan(approximate, IMAGE_2X)?.outline?.dash, 12);
  assert.ok(planner.plan(approximate, IMAGE_1X)?.clickDot);
  assert.equal(planner.plan(click, IMAGE_1X)?.outline?.dash, undefined);
});

test('style "none" leaves every screenshot unmarked', () => {
  const planner = new HighlightPlanner('none');
  assert.deepEqual(planner.marks, []);
  assert.equal(planner.plan(click, IMAGE_1X), undefined);
});

test('a single style draws only that mark', () => {
  const highlight = new HighlightPlanner('clickDot').plan(click, IMAGE_1X);
  assert.deepEqual(Object.keys(highlight ?? {}).sort(), ['clickDot', 'color']);
});

test('the step-number badge sits on the outline corner and carries the step number', () => {
  const badge = new HighlightPlanner('badge').plan(click, IMAGE_1X)?.badge;
  assert.deepEqual(badge, {
    x: 35,
    y: 35,
    radius: 11,
    label: '2',
    fontSize: 13,
  });
});

test('the badge is kept inside the image for an element at its edge', () => {
  const badge = new HighlightPlanner('badge').plan(
    { ...click, elementBox: { x: 0, y: 0, width: 50, height: 20 } },
    IMAGE_2X,
  )?.badge;
  assert.equal(badge?.x, 22);
  assert.equal(badge?.y, 22);
});

test('the spotlight dims everything but the element', () => {
  const highlight = new HighlightPlanner('spotlight').plan(click, IMAGE_1X);
  assert.deepEqual(highlight?.spotlight, {
    hole: { x: 38, y: 38, width: 124, height: 44 },
    opacity: 0.55,
  });
  assert.equal(highlight?.outline, undefined);
});

test('styles combine', () => {
  const highlight = new HighlightPlanner(['outline', 'badge']).plan(
    click,
    IMAGE_1X,
  );
  assert.ok(highlight?.outline);
  assert.ok(highlight?.badge);
  assert.equal(highlight?.clickDot, undefined);
});

test('an element partly outside the image is outlined where it shows', () => {
  const highlight = new HighlightPlanner().plan(
    {
      ...click,
      elementBox: { x: 700, y: -30, width: 200, height: 60 },
      clickPoint: undefined,
    },
    IMAGE_1X,
  );
  assert.deepEqual(highlight?.outline?.rect, {
    x: 695,
    y: 0,
    width: 105,
    height: 35,
  });
});

test('an element wholly outside the image has no outline', () => {
  const highlight = new HighlightPlanner().plan(
    {
      ...click,
      elementBox: { x: 100, y: 900, width: 50, height: 20 },
      clickPoint: undefined,
    },
    IMAGE_1X,
  );
  assert.equal(highlight, undefined);
});

/** Records what it was asked to draw; "draws" by tagging the bytes. */
class FakeAnnotator implements ScreenshotAnnotator {
  readonly drawn: { image: string; highlight: Highlight }[] = [];

  constructor(private readonly failOn?: string) {}

  async size(): Promise<QaSize> {
    return IMAGE_2X;
  }

  async draw(image: StepImage, highlight: Highlight): Promise<Buffer> {
    const name = image.data.toString();
    if (name === this.failOn) throw new Error('cannot draw');
    this.drawn.push({ image: name, highlight });
    return Buffer.from(`${name}+highlight`);
  }
}

function recording(): QaRecording {
  const asset = (id: string): QaAssetInput => ({
    id,
    contentType: 'image/png',
    filename: `${id}.png`,
    data: Buffer.from(id),
  });
  const assets = [asset('step-01'), asset('step-02'), asset('step-03')];
  return {
    bundle: {
      version: '1',
      meta: { title: 'Menu', capturedAt: '', status: 'complete' },
      steps: [
        {
          index: 1,
          action: 'Open http://127.0.0.1:4321/store',
          assetIds: ['step-01'],
          screenshotMoment: 'after',
          viewport: VIEWPORT,
        },
        { ...click, index: 2, assetIds: ['step-02'] },
        { ...click, index: 3, assetIds: ['step-03'] },
      ],
      assets: Object.fromEntries(
        assets.map(({ id, contentType, filename }) => [
          id,
          { id, contentType, filename },
        ]),
      ),
    },
    assets,
  };
}

test('each highlighted Step Screenshot replaces the original, scaled to its image', async () => {
  const annotator = new FakeAnnotator();
  const { bundle, assets } = await new StepScreenshotHighlighter(
    annotator,
  ).highlight(recording());

  assert.deepEqual(
    assets.map((a) => a.data.toString()),
    ['step-01', 'step-02+highlight', 'step-03+highlight'],
  );
  assert.equal(annotator.drawn[0].highlight.clickDot?.x, 200);
  // The bundle says which marks each screenshot carries.
  assert.equal(bundle.assets['step-01'].highlight, undefined);
  assert.deepEqual(bundle.assets['step-02'].highlight, ['outline', 'clickDot']);
});

test('a screenshot that cannot be drawn on is kept as it was, and reported', async () => {
  const errors: string[] = [];
  const { bundle, assets } = await new StepScreenshotHighlighter(
    new FakeAnnotator('step-02'),
    new HighlightPlanner(),
    (step, error) => errors.push(`${step.index}: ${String(error)}`),
  ).highlight(recording());

  assert.deepEqual(
    assets.map((a) => a.data.toString()),
    ['step-01', 'step-02', 'step-03+highlight'],
  );
  assert.equal(bundle.assets['step-02'].highlight, undefined);
  assert.deepEqual(errors, ['2: Error: cannot draw']);
});

test('with style "none" no screenshot is touched', async () => {
  const annotator = new FakeAnnotator();
  const { assets } = await new StepScreenshotHighlighter(
    annotator,
    new HighlightPlanner('none'),
  ).highlight(recording());

  assert.deepEqual(annotator.drawn, []);
  assert.deepEqual(
    assets.map((a) => a.data.toString()),
    ['step-01', 'step-02', 'step-03'],
  );
});
