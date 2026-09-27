import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { ActionCapture, Screenshot } from '@qa-instructions/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PNG } from 'pngjs';

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

test('a trace in an unknown format version gives no screenshots', async () => {
  // The v9 sample, relabeled as a future format.
  const entries = unzipSync(await readFile(TRACES[9]));
  for (const [name, data] of Object.entries(entries)) {
    if (!name.endsWith('.trace')) continue;
    entries[name] = strToU8(
      strFromU8(data).replaceAll('"version":9,', '"version":11,'),
    );
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-trace-'));
  try {
    const future = path.join(dir, 'trace.zip');
    await writeFile(future, zipSync(entries));
    const source = await TraceScreenshotSource.open(future);
    assert.equal(source.capture(CLICK), undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a missing or unreadable trace gives no screenshots and does not throw', async () => {
  const missing = await TraceScreenshotSource.open('/nonexistent/trace.zip');
  assert.equal(missing.capture(CLICK), undefined);

  const notAZip = await TraceScreenshotSource.open(
    fileURLToPath(
      new URL('../../test/fixtures/traces/scenario.spec.ts', import.meta.url),
    ),
  );
  assert.equal(notAZip.capture(CLICK), undefined);
});
