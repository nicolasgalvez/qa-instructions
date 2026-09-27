import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { fixtureOrigin } from '@qa-instructions/fixture-site/origin';
import sharp from 'sharp';

import { GOLDENS, derivedSteps, root } from './shared.mjs';

// The derived-steps tests on Playwright 1.56 must read exactly like the 1.63
// goldens, and every QA Step must have a Step Screenshot from the trace's
// screen recording (a JPEG frame). A click whose frame shows the moment it
// was made (moment `action`) has its click point marked; every other frame
// is from after the Action ended (moment `after`) and is left unmarked.

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

/** The Highlight color, written out so the probe checks the drawing independently. */
const HIGHLIGHT = [255, 0, 128];
/** Per channel; the frames are JPEG, so colors drift a little. */
const TOLERANCE = 40;

/** The color at a CSS pixel of the viewport in a Step Screenshot. */
async function colorAt(data, point, viewport) {
  const { data: pixels, info } = await sharp(data)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const x = Math.floor((point.x * info.width) / viewport.width);
  const y = Math.floor((point.y * info.height) / viewport.height);
  const i = (y * info.width + x) * info.channels;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}

let markedClicks = 0;

let failed = false;

function fail(message) {
  console.error(`verify-run: ${message}`);
  failed = true;
}

for (const name of GOLDENS) {
  const golden = await readFile(
    path.join(derivedSteps, 'golden', `${name}.txt`),
    'utf8',
  );
  let actual;
  try {
    actual = fixtureOrigin.canonicalize(
      await readFile(path.join(root, 'qa-steps-out', `${name}.txt`), 'utf8'),
    );
  } catch (error) {
    fail(`missing rendered output for ${name}: ${error.message}`);
    continue;
  }
  if (actual !== golden) {
    fail(`${name} does not match the 1.63 golden`);
    console.error('--- expected ---');
    console.error(golden);
    console.error('--- actual ---');
    console.error(actual);
  }
}

const bundleDirs = await readdir(path.join(root, 'qa-runs'));
for (const name of GOLDENS) {
  if (!bundleDirs.includes(name)) {
    fail(`no bundle for ${name}`);
    continue;
  }
  const dir = path.join(root, 'qa-runs', name);
  const bundle = JSON.parse(
    await readFile(path.join(dir, 'bundle.json'), 'utf8'),
  );
  for (const step of bundle.steps) {
    const label = `${name} step ${step.index}`;
    if (step.assetIds?.length !== 1) {
      fail(`${label}: expected one Step Screenshot, got ${step.assetIds}`);
      continue;
    }
    const atAction = step.screenshotMoment === 'action';
    if (atAction && !step.clickPoint) {
      fail(
        `${label}: screenshot taken at the Action, but it has no click point`,
      );
    } else if (!atAction && step.screenshotMoment !== 'after') {
      fail(
        `${label}: screenshot taken ${step.screenshotMoment}, expected action or after`,
      );
    }
    const asset = bundle.assets[step.assetIds[0]];
    // No element box before 1.63, so a click is marked by its dot alone.
    const expectedMarks = atAction ? ['clickDot'] : undefined;
    if (JSON.stringify(asset?.highlight) !== JSON.stringify(expectedMarks)) {
      fail(
        `${label}: Highlight ${JSON.stringify(asset?.highlight)}, expected ${JSON.stringify(expectedMarks)}`,
      );
    }
    let data;
    try {
      data = await readFile(path.join(dir, 'assets', asset.filename));
      if (!data.subarray(0, 3).equals(JPEG) || data.length < 1000) {
        fail(`${label}: ${asset.filename} is not a screen recording frame`);
      }
    } catch (error) {
      fail(`${label}: missing screenshot ${asset?.filename}: ${error.message}`);
      continue;
    }
    if (!atAction || !step.clickPoint || !step.viewport) continue;
    const color = await colorAt(data, step.clickPoint, step.viewport);
    if (color.some((c, k) => Math.abs(c - HIGHLIGHT[k]) > TOLERANCE)) {
      fail(
        `${label}: click point is rgb(${color}), expected the Highlight rgb(${HIGHLIGHT})`,
      );
    } else {
      markedClicks += 1;
    }
  }
}

// Whether a frame shows the moment of a click depends on the recording's
// timing, so not every click gets one; but most do, and some must.
if (markedClicks === 0) {
  fail('no click step has its click point marked');
}

// The long page: Playwright scrolls to the field before typing and to the
// button before clicking. The fill's screenshot must show the typed value
// (the field turns green); the click is marked only on a frame showing the
// button under the click point, not yet clicked (it turns gray).
const LONG_PAGE = 'long-page--order-boots-from-the-bottom-of-the-page';
const CHANGED_FIELD = [25, 169, 116];
const BUTTON = [31, 79, 216];

function near(color, expected) {
  return color.every((c, k) => Math.abs(c - expected[k]) <= TOLERANCE);
}

/** How many pixels of a Step Screenshot are within tolerance of `rgb`. */
async function countColor(data, rgb) {
  const { data: pixels, info } = await sharp(data)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < pixels.length; i += info.channels) {
    if (near([pixels[i], pixels[i + 1], pixels[i + 2]], rgb)) count += 1;
  }
  return count;
}

if (bundleDirs.includes(LONG_PAGE)) {
  const dir = path.join(root, 'qa-runs', LONG_PAGE);
  const bundle = JSON.parse(
    await readFile(path.join(dir, 'bundle.json'), 'utf8'),
  );
  const image = (step) =>
    readFile(
      path.join(dir, 'assets', bundle.assets[step.assetIds[0]].filename),
    );
  const [, fill, click] = bundle.steps;

  // The field is 140×39 CSS pixels; most of it shows the green.
  const green = await countColor(await image(fill), CHANGED_FIELD);
  if (green < 2000) {
    fail(
      `${LONG_PAGE} step 2: the typed value is not shown (${green} green pixels)`,
    );
  }

  if (click.screenshotMoment === 'action') {
    // Beside the dot (radius 6), inside the 240×51 button.
    const beside = { x: click.clickPoint.x - 20, y: click.clickPoint.y };
    const color = await colorAt(await image(click), beside, click.viewport);
    if (!near(color, BUTTON)) {
      fail(
        `${LONG_PAGE} step 3: the click is marked on rgb(${color}), not on the button`,
      );
    }
  }
}

if (failed) process.exit(1);
console.log(
  `verify-run: ok (${GOLDENS.length} 1.63 golden(s) matched on Playwright 1.56, with Step Screenshots; ${markedClicks} click point(s) marked)`,
);
