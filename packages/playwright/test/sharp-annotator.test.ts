import assert from 'node:assert/strict';
import test from 'node:test';

import type { Highlight, StepImage } from '@qa-instructions/core';
import { PNG } from 'pngjs';
import sharp from 'sharp';

import { SharpScreenshotAnnotator } from '../src/reporter/sharp-screenshot-annotator.js';

const GRAY = { r: 128, g: 128, b: 128 };
const PINK = { r: 255, g: 0, b: 128 };
const WHITE = { r: 255, g: 255, b: 255 };
const TOLERANCE = 3;

async function grayImage(
  width = 200,
  height = 100,
  format: 'png' | 'jpeg' = 'png',
): Promise<StepImage> {
  const data = await sharp({
    create: { width, height, channels: 3, background: GRAY },
  })
    .toFormat(format)
    .toBuffer();
  return { contentType: `image/${format}`, data };
}

type Rgb = { r: number; g: number; b: number };

function pixel(data: Buffer, x: number, y: number): Rgb {
  const png = PNG.sync.read(data);
  const i = (png.width * y + x) * 4;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2] };
}

function assertColor(
  actual: Rgb,
  expected: Rgb,
  label: string,
  tolerance = TOLERANCE,
): void {
  const close = (['r', 'g', 'b'] as const).every(
    (c) => Math.abs(actual[c] - expected[c]) <= tolerance,
  );
  assert.ok(
    close,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const annotator = new SharpScreenshotAnnotator();

const outline: Highlight = {
  color: '#ff0080',
  outline: { rect: { x: 20, y: 20, width: 60, height: 30 }, strokeWidth: 3 },
};

test('reports the image size', async () => {
  assert.deepEqual(await annotator.size(await grayImage(320, 240)), {
    width: 320,
    height: 240,
  });
});

test('an outline is drawn inside its rect, stroke-width thick, leaving the element clear', async () => {
  const drawn = await annotator.draw(await grayImage(), outline);

  const png = PNG.sync.read(drawn);
  assert.deepEqual([png.width, png.height], [200, 100]);
  for (const [x, y] of [
    [20, 35],
    [22, 35],
    [79, 35],
    [50, 20],
    [50, 49],
  ]) {
    assertColor(pixel(drawn, x, y), PINK, `outline at ${x},${y}`);
  }
  assertColor(pixel(drawn, 19, 35), GRAY, 'just outside the outline');
  assertColor(pixel(drawn, 23, 35), GRAY, 'just inside the outline');
  assertColor(pixel(drawn, 50, 35), GRAY, 'the element');
});

test('an approximate outline is dashed', async () => {
  const drawn = await annotator.draw(await grayImage(), {
    ...outline,
    outline: { ...outline.outline!, dash: 6 },
  });

  const top = Array.from({ length: 40 }, (_, i) => pixel(drawn, 22 + i, 21));
  const pink = top.filter((c) => c.r > 200 && c.g < 60).length;
  assert.ok(pink > 10 && pink < 30, `${pink} of 40 top-edge pixels are pink`);
  assertColor(pixel(drawn, 23, 21), PINK, 'the dash starting at the corner');
});

test('a click dot is filled, ringed in white', async () => {
  const drawn = await annotator.draw(await grayImage(), {
    color: '#ff0080',
    clickDot: { x: 100, y: 50, radius: 6, ringWidth: 2 },
  });

  assertColor(pixel(drawn, 100, 50), PINK, 'dot center');
  assertColor(pixel(drawn, 104, 50), PINK, 'inside the dot');
  // A 2px ring on a circle is antialiased on both edges.
  assertColor(pixel(drawn, 107, 50), WHITE, 'the ring', 12);
  assertColor(pixel(drawn, 110, 50), GRAY, 'past the ring');
});

test('a badge is a filled circle', async () => {
  const drawn = await annotator.draw(await grayImage(), {
    color: '#ff0080',
    badge: { x: 30, y: 30, radius: 11, label: '4', fontSize: 13 },
  });

  assertColor(pixel(drawn, 30, 21), PINK, 'top of the badge');
  assertColor(pixel(drawn, 21, 30), PINK, 'left of the badge');
  assertColor(pixel(drawn, 30, 43), GRAY, 'below the badge');
});

test('a spotlight darkens everything but its hole', async () => {
  const drawn = await annotator.draw(await grayImage(), {
    color: '#ff0080',
    spotlight: { hole: { x: 20, y: 20, width: 60, height: 30 }, opacity: 0.5 },
  });

  assertColor(pixel(drawn, 50, 35), GRAY, 'inside the hole');
  assertColor(pixel(drawn, 150, 80), { r: 64, g: 64, b: 64 }, 'outside');
  assertColor(pixel(drawn, 19, 35), { r: 64, g: 64, b: 64 }, 'at the edge');
});

test('the image keeps its format', async () => {
  const drawn = await annotator.draw(
    await grayImage(200, 100, 'jpeg'),
    outline,
  );
  const { format } = await sharp(drawn).metadata();
  assert.equal(format, 'jpeg');
});

test('an image without transparency gains none', async () => {
  const drawn = await annotator.draw(await grayImage(), outline);
  const { hasAlpha, channels } = await sharp(drawn).metadata();
  assert.deepEqual({ hasAlpha, channels }, { hasAlpha: false, channels: 3 });
});
