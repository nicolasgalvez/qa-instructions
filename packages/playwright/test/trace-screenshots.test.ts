import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { ActionCapture, Screenshot } from '@qa-instructions/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PNG } from 'pngjs';
import sharp from 'sharp';

import { ActionRef } from '../src/reporter/action-ref.js';
import { TraceScreenshotSource } from '../src/reporter/trace-screenshot-source.js';

/** Sample traces recorded from test/fixtures/traces/scenario.spec.ts. */
const TRACES = {
  9: fixture('v9.zip'),
  10: fixture('v10.zip'),
};

function fixture(name: string): string {
  return fileURLToPath(
    new URL(`../../test/fixtures/traces/${name}`, import.meta.url),
  );
}

// The scenario's reported `pw:api` steps in order: three fixture calls, then
// the test body. Its `textContent()` getter is traced but not reported, so it
// is not numbered.
const NAVIGATE = ActionRef.of(4, 'Navigate');
const FILL = ActionRef.of(5, 'Fill "Ada"');
const CLICK = ActionRef.of(6, 'Click');
const PRESS = ActionRef.of(7, 'Press "Tab"');

const GREEN = { r: 0x00, g: 0xaa, b: 0x00 };
const RED = { r: 0xcc, g: 0x00, b: 0x00 };

function moments(capture: ActionCapture | undefined): string[] {
  return (capture?.screenshots ?? []).map((s) => s.moment).sort();
}

function shot(capture: ActionCapture | undefined, moment: string): Screenshot {
  const screenshot = capture?.screenshots.find((s) => s.moment === moment);
  assert.ok(screenshot, `expected a ${moment} screenshot`);
  return screenshot;
}

function pixel(screenshot: Screenshot, x: number, y: number) {
  const png = PNG.sync.read(screenshot.data);
  const i = (png.width * y + x) * 4;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2] };
}

for (const [version, path] of Object.entries(TRACES)) {
  test(`trace format ${version}: every Action has screenshots from its trace`, async () => {
    const source = await TraceScreenshotSource.open(path);

    assert.deepEqual(moments(source.capture(NAVIGATE)), ['after', 'before']);
    assert.deepEqual(moments(source.capture(FILL)), [
      'action',
      'after',
      'before',
    ]);
    assert.deepEqual(moments(source.capture(CLICK)), [
      'action',
      'after',
      'before',
    ]);
    assert.deepEqual(moments(source.capture(PRESS)), ['action', 'after']);

    const click = source.capture(CLICK);
    const action = shot(click, 'action');
    assert.equal(action.contentType, 'image/png');
    const png = PNG.sync.read(action.data);
    assert.deepEqual([png.width, png.height], [400, 300]);
    // The action-moment image shows the page as it was clicked; after it, the page turned red.
    assert.deepEqual(pixel(action, 10, 10), GREEN);
    assert.deepEqual(pixel(shot(click, 'after'), 10, 10), RED);
  });

  test(`trace format ${version}: element box and click point come from the trace`, async () => {
    const source = await TraceScreenshotSource.open(path);

    const click = source.capture(CLICK);
    assert.deepEqual(click?.box, { x: 40, y: 40, width: 120, height: 40 });
    assert.deepEqual(click?.point, { x: 100, y: 60 });

    const fill = source.capture(FILL);
    assert.equal(fill?.box?.width, 153);
    assert.equal(fill?.point, undefined);

    assert.equal(source.capture(NAVIGATE)?.box, undefined);
    assert.equal(source.capture(PRESS)?.box, undefined);
  });

  test(`trace format ${version}: each capture carries its page's viewport`, async () => {
    const source = await TraceScreenshotSource.open(path);

    for (const ref of [NAVIGATE, FILL, CLICK, PRESS]) {
      assert.deepEqual(source.capture(ref)?.viewport, {
        width: 400,
        height: 300,
      });
    }
  });

  test(`trace format ${version}: Actions the trace has nothing for have no capture`, async () => {
    const source = await TraceScreenshotSource.open(path);

    // Launching the browser happens before the page exists.
    assert.equal(source.capture(ActionRef.of(1, 'Launch browser')), undefined);
    // A ref whose title does not match the trace's step at that position.
    assert.equal(source.capture(ActionRef.of(6, 'Hover')), undefined);
    assert.equal(source.capture(ActionRef.of(99, 'Click')), undefined);
    assert.equal(source.capture('not a ref'), undefined);
  });
}

for (const [version, path] of Object.entries(TRACES)) {
  test(`trace format ${version} without DOM snapshots: whether a field is a password field is unknown`, async () => {
    const source = await TraceScreenshotSource.open(path);
    assert.equal(source.capture(FILL)?.passwordField, undefined);
    assert.equal(source.capture(CLICK)?.passwordField, undefined);
  });
}

/** Recorded from test/fixtures/traces/password.spec.ts, with DOM snapshots. */
const DOM_TRACE = fixture('v9-dom.zip');
const DOM_REFS = {
  navigate: ActionRef.of(4, 'Navigate'),
  name: ActionRef.of(5, 'Fill "Ada"'),
  password: ActionRef.of(6, 'Fill "hunter2"'),
  click: ActionRef.of(7, 'Click'),
};

test('with DOM snapshots, the trace says which Action touched a password field', async () => {
  const source = await TraceScreenshotSource.open(DOM_TRACE);

  assert.equal(source.capture(DOM_REFS.password)?.passwordField, true);
  assert.equal(source.capture(DOM_REFS.name)?.passwordField, false);
  assert.equal(source.capture(DOM_REFS.click)?.passwordField, false);
  // A navigation touches no element.
  assert.equal(source.capture(DOM_REFS.navigate)?.passwordField, undefined);
  // Screenshots still come through alongside.
  assert.ok((source.capture(DOM_REFS.password)?.screenshots.length ?? 0) > 0);
});

test('the password field type is read case-insensitively', async () => {
  const entries = unzipSync(await readFile(DOM_TRACE));
  for (const [name, data] of Object.entries(entries)) {
    if (!name.endsWith('.trace')) continue;
    entries[name] = strToU8(
      strFromU8(data).replaceAll('"type":"password"', '"type":"PassWord"'),
    );
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-trace-'));
  try {
    const relabeled = path.join(dir, 'trace.zip');
    await writeFile(relabeled, zipSync(entries));
    const source = await TraceScreenshotSource.open(relabeled);
    assert.equal(source.capture(DOM_REFS.password)?.passwordField, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** Writes `entries` as a trace.zip in a temporary directory and opens it. */
async function openEntries(
  entries: Record<string, Uint8Array>,
): Promise<TraceScreenshotSource> {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-trace-'));
  try {
    const file = path.join(dir, 'trace.zip');
    await writeFile(file, zipSync(entries));
    return await TraceScreenshotSource.open(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a trace in an unknown format version gives no screenshots and says why', async () => {
  // The v9 sample, relabeled as a future format.
  const entries = unzipSync(await readFile(TRACES[9]));
  for (const [name, data] of Object.entries(entries)) {
    if (!name.endsWith('.trace')) continue;
    entries[name] = strToU8(
      strFromU8(data).replaceAll('"version":9,', '"version":11,'),
    );
  }
  const source = await openEntries(entries);
  assert.equal(source.capture(CLICK), undefined);
  assert.deepEqual(source.problem, {
    kind: 'unsupportedVersion',
    version: 11,
  });
});

test('a readable trace in a supported version has no problem', async () => {
  const source = await TraceScreenshotSource.open(TRACES[9]);
  assert.equal(source.problem, undefined);
});

test('a missing or unreadable trace gives no screenshots and does not throw', async () => {
  const missing = await TraceScreenshotSource.open('/nonexistent/trace.zip');
  assert.equal(missing.capture(CLICK), undefined);
  assert.equal(missing.problem?.kind, 'unreadable');

  const notAZip = await TraceScreenshotSource.open(
    fileURLToPath(
      new URL('../../test/fixtures/traces/scenario.spec.ts', import.meta.url),
    ),
  );
  assert.equal(notAZip.capture(CLICK), undefined);
  assert.equal(notAZip.problem?.kind, 'unreadable');
});

// Trace format 8, recorded from the same scenario with Playwright 1.56
// (`trace: 'on'`). Before 1.63 there are no per-action screenshots, only the
// page's screen recording; step titles carry the locator.
const V8 = {
  NAVIGATE: ActionRef.of(4, 'Navigate to "data:"'),
  FILL: ActionRef.of(5, `Fill "Ada" getByLabel('Name')`),
  CLICK: ActionRef.of(6, `Click getByRole('button', { name: 'Paint' })`),
  PRESS: ActionRef.of(7, 'Press "Tab"'),
};

/** The screen recording's frames in the v8 sample, in the order recorded. */
async function v8Frames(): Promise<Buffer[]> {
  const entries = unzipSync(await readFile(fixture('v8.zip')));
  return Object.keys(entries)
    .filter((name) => name.startsWith('resources/') && name.endsWith('.jpeg'))
    .sort()
    .map((name) => Buffer.from(entries[name]));
}

test('trace format 8: an Action that touched no point gets a screen recording frame from after its end', async () => {
  const source = await TraceScreenshotSource.open(fixture('v8.zip'));
  assert.equal(source.problem, undefined);
  const frames = await v8Frames();
  assert.equal(frames.length, 4);

  for (const [ref, frame] of [
    // The last frame painted after the Action ended and before the next
    // Action began changing the page: for the navigation, the loaded page
    // (frame 0 is the blank page before it); for the fill, "Ada" typed
    // (frame 2, painted during the fill, shows the field still empty).
    [V8.NAVIGATE, 1],
    [V8.FILL, 3],
    // No frame was painted after the key press: the last one by its end.
    [V8.PRESS, 3],
  ] as const) {
    const screenshots = source.capture(ref)?.screenshots ?? [];
    assert.equal(screenshots.length, 1, ref);
    assert.equal(screenshots[0].moment, 'after', ref);
    assert.equal(screenshots[0].contentType, 'image/jpeg', ref);
    assert.ok(
      screenshots[0].data.equals(frames[frame]),
      `${ref}: frame ${frame}`,
    );
  }
});

test('trace format 8 as Playwright 1.53–1.54 write it (every step method "step") gives the same captures', async () => {
  const entries = unzipSync(await readFile(fixture('v8.zip')));
  entries['test.trace'] = strToU8(
    strFromU8(entries['test.trace']).replace(
      /"method":"[^"]+"/g,
      '"method":"step"',
    ),
  );
  const source = await openEntries(entries);
  const frames = await v8Frames();
  assert.ok(source.capture(V8.FILL)?.screenshots[0].data.equals(frames[3]));
  assert.deepEqual(source.capture(V8.CLICK)?.point, { x: 100, y: 60 });
});

test('trace format 8: the click point comes from the trace, with no element box', async () => {
  const source = await TraceScreenshotSource.open(fixture('v8.zip'));
  assert.deepEqual(source.capture(V8.CLICK)?.point, { x: 100, y: 60 });
  assert.equal(source.capture(V8.CLICK)?.box, undefined);
});

/**
 * The v8 sample with its library trace rewritten. In it the click's input
 * snapshot is taken at 2436.618 and the recording's frames arrive at
 * 2332.608, 2360.165, 2390.372, and 2401.415 (frames 0–3), having been
 * painted about 1–4ms earlier (their `frameSwapWallTime`, on the wall clock
 * the context options pair with the trace's clock: frame 3 at 2399.848).
 * The fill's typed value is first recorded by its `after` snapshot, at
 * 2394.213.
 */
async function v8With(
  edit: (libraryTrace: string) => string,
): Promise<TraceScreenshotSource> {
  const entries = unzipSync(await readFile(fixture('v8.zip')));
  entries['0-trace.trace'] = strToU8(edit(strFromU8(entries['0-trace.trace'])));
  return openEntries(entries);
}

test('trace format 8: a click gets the frame drawn at the moment of the Action', async () => {
  const source = await TraceScreenshotSource.open(fixture('v8.zip'));
  const frames = await v8Frames();

  const screenshots = source.capture(V8.CLICK)?.screenshots ?? [];
  assert.deepEqual(
    screenshots.map((s) => s.moment),
    ['action'],
  );
  assert.equal(screenshots[0].contentType, 'image/jpeg');
  // Frame 3 arrived 35ms before the click's input snapshot.
  assert.ok(screenshots[0].data.equals(frames[3]));
});

test('trace format 8: the moment-of-Action frame is the last one drawn before the input, never one after it', async () => {
  // Input at 2399.000: frame 3 (painted 2399.848) is nearer but was painted
  // after it, when the click may already have changed the page.
  const source = await v8With((trace) =>
    trace.replace('"timestamp":2436.618', '"timestamp":2399.000'),
  );
  const frames = await v8Frames();
  const screenshots = source.capture(V8.CLICK)?.screenshots ?? [];
  assert.deepEqual(
    screenshots.map((s) => s.moment),
    ['action'],
  );
  assert.ok(screenshots[0].data.equals(frames[2]));
});

test('trace format 8: with no frame drawn just before the input, a click keeps the frame from its end, unmarked', async () => {
  // Input at 2461.618: the last frame (3) was painted 62ms earlier, only 6ms
  // after the fill changed the page, so it may not show the page as it was
  // by the input, and the recording can go quiet while the page changes.
  const source = await v8With((trace) =>
    trace
      .replace('"timestamp":2436.618', '"timestamp":2461.618')
      .replace('"endTime":2444.709', '"endTime":2464.709'),
  );
  const frames = await v8Frames();
  const screenshots = source.capture(V8.CLICK)?.screenshots ?? [];
  assert.deepEqual(
    screenshots.map((s) => s.moment),
    ['after'],
  );
  assert.ok(screenshots[0].data.equals(frames[3]));
  // The click point is still reported; the core leaves `after` frames unmarked.
  assert.deepEqual(source.capture(V8.CLICK)?.point, { x: 100, y: 60 });
});

test('trace format 8: without the input snapshot the moment of the Action is unknown, so a click keeps the frame from its end', async () => {
  const source = await v8With((trace) =>
    trace
      .split('\n')
      .filter((line) => !line.includes('"snapshotName":"input@call@16"'))
      .join('\n'),
  );
  assert.deepEqual(
    (source.capture(V8.CLICK)?.screenshots ?? []).map((s) => s.moment),
    ['after'],
  );
});

test('trace format 8: an old frame painted well after the page last changed still shows the moment of a click', async () => {
  // Frame 3 moved to 2455.000, 61ms after the fill's value was recorded, and
  // the input to 2520.000: the frame is 65ms old, but the page (DOM, form
  // values, scroll offsets) was the same from before it was painted until
  // the input.
  const source = await v8With((trace) =>
    trace
      .replace(
        '"timestamp":2401.415,"frameSwapWallTime":1790470191121.614',
        '"timestamp":2456.000,"frameSwapWallTime":1790470191176.766',
      )
      .replace('"timestamp":2436.618', '"timestamp":2520.000')
      .replace('"endTime":2444.709', '"endTime":2528.000'),
  );
  const frames = await v8Frames();
  const screenshots = source.capture(V8.CLICK)?.screenshots ?? [];
  assert.deepEqual(
    screenshots.map((s) => s.moment),
    ['action'],
  );
  assert.ok(screenshots[0].data.equals(frames[3]));
});

/**
 * Trace format 8 of a long page (fixtures/traces/scroll.spec.ts, Playwright
 * 1.56): the fill and the Far click make Playwright scroll; the Add click
 * does not. Viewport 400×300; frames are 400×300 JPEGs.
 */
const V8_SCROLL = {
  FILL: ActionRef.of(5, `Fill "3" getByLabel('Quantity')`),
  ADD: ActionRef.of(7, `Click getByRole('button', { name: 'Add' })`),
  FAR: ActionRef.of(8, `Click getByRole('button', { name: 'Far' })`),
};

const SCROLL_PAGE = {
  yellowBand: { r: 0xff, g: 0xd4, b: 0x00 },
  typedField: { r: 0x00, g: 0x00, b: 0xcc },
  button: { r: 0x1f, g: 0x4f, b: 0xd8 },
  clickedButton: { r: 0xcc, g: 0x00, b: 0x00 },
};

async function jpegPixel(screenshot: Screenshot, x: number, y: number) {
  const { data, info } = await sharp(screenshot.data)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const i = (info.width * y + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

/** Within JPEG noise of `expected`. */
function assertColor(
  actual: { r: number; g: number; b: number },
  expected: { r: number; g: number; b: number },
  what: string,
) {
  const off = Math.max(
    Math.abs(actual.r - expected.r),
    Math.abs(actual.g - expected.g),
    Math.abs(actual.b - expected.b),
  );
  assert.ok(
    off <= 40,
    `${what}: rgb(${actual.r},${actual.g},${actual.b}), expected rgb(${expected.r},${expected.g},${expected.b})`,
  );
}

test('trace format 8: a click Playwright scrolled to just before the input is unmarked, on a frame showing its result', async () => {
  const source = await TraceScreenshotSource.open(fixture('v8-scroll.zip'));
  const far = source.capture(V8_SCROLL.FAR);
  assert.deepEqual(far?.point, { x: 80, y: 150 });
  // The frame painted 0.7ms before the input still shows the page before
  // the scroll, so no frame shows the moment of the click.
  assert.deepEqual(moments(far), ['after']);
  // The frame from after it shows the page scrolled to Far, clicked (probed
  // beside its label, which is at the click point).
  assertColor(
    await jpegPixel(shot(far, 'after'), 20, 140),
    SCROLL_PAGE.clickedButton,
    'Far next to the click point',
  );
});

test('trace format 8: a click on a page that had scrolled earlier is marked, on a frame showing the scroll', async () => {
  const source = await TraceScreenshotSource.open(fixture('v8-scroll.zip'));
  const add = source.capture(V8_SCROLL.ADD);
  assert.deepEqual(add?.point, { x: 100, y: 242 });
  assert.deepEqual(moments(add), ['action']);
  // Under the click point: the Add button, not yet clicked.
  assertColor(
    await jpegPixel(shot(add, 'action'), 100, 250),
    SCROLL_PAGE.button,
    'Add under the click point',
  );
});

test('trace format 8: a fill that scrolls gets a frame showing the typed value where the field is', async () => {
  const source = await TraceScreenshotSource.open(fixture('v8-scroll.zip'));
  const fill = source.capture(V8_SCROLL.FILL);
  assert.deepEqual(moments(fill), ['after']);
  const frame = shot(fill, 'after');
  assertColor(
    await jpegPixel(frame, 300, 250),
    SCROLL_PAGE.yellowBand,
    'scrolled to the band',
  );
  assertColor(
    await jpegPixel(frame, 150, 294),
    SCROLL_PAGE.typedField,
    'the typed field',
  );
});

test('trace format 8: a click is never marked on a frame painted before the page reached its scroll position', async () => {
  // Add's input moved to just after the fill: its scroll offsets were first
  // recorded at 89.6ms into the run (the fill's `after` snapshot), and the
  // last frame before this input was painted too soon after to show them.
  const entries = unzipSync(await readFile(fixture('v8-scroll.zip')));
  const library = strFromU8(entries['0-trace.trace']);
  const fillAfter =
    /"snapshotName":"after@call@10"[^\n]*?"timestamp":([\d.]+)/.exec(
      library,
    )?.[1];
  const addInput =
    /"snapshotName":"input@call@14"[^\n]*?"timestamp":([\d.]+)/.exec(
      library,
    )?.[1];
  assert.ok(fillAfter && addInput);
  entries['0-trace.trace'] = strToU8(
    library.replace(
      `"timestamp":${addInput}`,
      `"timestamp":${(Number(fillAfter) + 10).toFixed(3)}`,
    ),
  );
  const source = await openEntries(entries);
  assert.deepEqual(moments(source.capture(V8_SCROLL.ADD)), ['after']);
});

/**
 * Trace format 8 of a smoothly scrolling long page
 * (fixtures/traces/smooth.spec.ts, Playwright 1.56), as on a store's product
 * page: a check of an already checked radio, a fill whose focus starts a
 * smooth scroll that outlasts it, and at once a click on the same form, which
 * waits for the scroll to settle. Viewport 400×300.
 */
const V8_SMOOTH = {
  CHECK: ActionRef.of(5, `Check getByLabel('One time')`),
  FILL: ActionRef.of(6, `Fill "3" getByLabel('Quantity')`),
};

test('trace format 8: a fill whose smooth scroll outlasts it gets the frame showing the scroll settled', async () => {
  const source = await TraceScreenshotSource.open(fixture('v8-smooth.zip'));
  const fill = source.capture(V8_SMOOTH.FILL);
  assert.deepEqual(moments(fill), ['after']);
  // Frames painted soon after the fill still show the page scrolling from
  // the top (all green); the last one before the click scrolls shows the
  // band, with the typed field at the bottom edge.
  const frame = shot(fill, 'after');
  assertColor(
    await jpegPixel(frame, 300, 250),
    SCROLL_PAGE.yellowBand,
    'scrolled to the band',
  );
  assertColor(
    await jpegPixel(frame, 200, 296),
    SCROLL_PAGE.typedField,
    'the typed field',
  );
});

test('trace format 8: a fill with no frame painted after it gets no screenshot, never one from before its scroll', async () => {
  // The click's scroll moved to 1ms after the fill ended: no frame was
  // painted between, and the last one by the fill's end shows the page top.
  const entries = unzipSync(await readFile(fixture('v8-smooth.zip')));
  const library = strFromU8(entries['0-trace.trace']);
  const fillEnd =
    /"type":"after","callId":"call@12"[^\n]*?"endTime":([\d.]+)/.exec(
      library,
    )?.[1];
  const clickScroll =
    /"callId":"call@14","time":([\d.]+),"message":" *scrolling into view/.exec(
      library,
    )?.[1];
  assert.ok(fillEnd && clickScroll);
  entries['0-trace.trace'] = strToU8(
    library.replace(
      `"time":${clickScroll}`,
      `"time":${(Number(fillEnd) + 1).toFixed(3)}`,
    ),
  );
  const source = await openEntries(entries);
  assert.deepEqual(moments(source.capture(V8_SMOOTH.FILL)), []);
});

test('trace format 8: a check Playwright skipped (already checked) gets no screenshot', async () => {
  // Playwright neither scrolled to the radio nor clicked it, so no frame is
  // known to show it: the only one by its end shows the top of the page.
  const source = await TraceScreenshotSource.open(fixture('v8-smooth.zip'));
  assert.deepEqual(moments(source.capture(V8_SMOOTH.CHECK)), []);
});

test('a later trace without per-action screenshots falls back to the screen recording', async () => {
  // The v9 sample with its per-action screenshots replaced by one recorded
  // frame, as `trace: 'on'` without `snapshots.screen` writes it.
  const entries = unzipSync(await readFile(TRACES[9]));
  const shots = Object.keys(entries).filter((n) =>
    n.startsWith('screenshots/'),
  );
  const frame = entries[shots[0]];
  for (const name of shots) delete entries[name];

  const library = Object.keys(entries).find(
    (name) => name.endsWith('.trace') && name !== 'test.trace',
  ) as string;
  const lines = strFromU8(entries[library])
    .split('\n')
    .filter((line) => !line.includes('"type":"screenshot"'));
  const pageId = /"pageId":"([^"]+)"/.exec(lines.join('\n'))?.[1];
  entries['screencast/frame-1.jpeg'] = frame;
  lines.splice(
    1,
    0,
    JSON.stringify({
      type: 'screencast-frame',
      pageId,
      file: 'screencast/frame-1.jpeg',
      width: 400,
      height: 300,
      timestamp: 0,
    }),
  );
  entries[library] = strToU8(lines.join('\n'));

  const source = await openEntries(entries);
  const click = source.capture(CLICK);
  assert.deepEqual(moments(click), ['after']);
  assert.ok(click?.screenshots[0].data.equals(Buffer.from(frame)));
  assert.deepEqual(click?.box, { x: 40, y: 40, width: 120, height: 40 });
});
