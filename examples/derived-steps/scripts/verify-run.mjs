import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { PNG } from 'pngjs';

import {
  GOLDENS,
  OUTPUT_DIRS,
  SCREENSHOT_GOLDENS,
  SECRETS,
  normalizeRendered,
  root,
} from './goldens.mjs';

const TOLERANCE = 8;

/**
 * The documented Highlight geometry, in CSS pixels: the outline sits 2px
 * clear of the element and is 3px thick; an approximate outline's dashes are
 * 6px; the step-number badge (radius 11) is centered on the outline's corner.
 * Written out here rather than imported, so the probes check the drawing
 * independently of the code that plans it.
 */
const OUTLINE_GAP = 2;
const OUTLINE_WIDTH = 3;
const OUTLINE_DASH = 6;
const BADGE_RADIUS = 11;

let failed = false;

function fail(message) {
  console.error(`verify-run: ${message}`);
  failed = true;
}

/** The top-left corner of the outline's outer edge, in image pixels. */
function outlineCorner(box, scale) {
  const grow = OUTLINE_GAP + OUTLINE_WIDTH;
  return {
    x: Math.max(0, Math.floor((box.x - grow) * scale)),
    y: Math.max(0, Math.floor((box.y - grow) * scale)),
  };
}

/**
 * Where a probe samples, in image pixels. Absolute probes are in viewport
 * CSS pixels; the rest are relative to the step's element box or click point.
 */
function probePoint(probe, step, scale) {
  const box = step.elementBox;
  const at = (x, y) => ({ x: Math.floor(x * scale), y: Math.floor(y * scale) });
  switch (probe.at) {
    case undefined:
      return at(probe.x, probe.y);
    case 'clickPoint':
      return step.clickPoint && at(step.clickPoint.x, step.clickPoint.y);
  }
  if (!box) return undefined;
  const middleY = box.y + box.height / 2;
  switch (probe.at) {
    case 'elementBoxCenter':
      return at(box.x + box.width / 2, middleY);
    // Inside the element, `dx` from its left edge (from its right if negative).
    case 'inside':
      return at(
        probe.dx >= 0 ? box.x + probe.dx : box.x + box.width + probe.dx,
        middleY,
      );
    // Halfway through the outline's left edge.
    case 'outline':
      return at(box.x - OUTLINE_GAP - OUTLINE_WIDTH / 2, middleY);
    // In the first dash of the outline's top edge, then in the gap after it.
    case 'outlineDash':
    case 'outlineDashGap': {
      const corner = outlineCorner(box, scale);
      const along = probe.at === 'outlineDash' ? 2 : OUTLINE_DASH + 4;
      return {
        x: corner.x + Math.floor(along * scale),
        y: corner.y + Math.floor(scale),
      };
    }
    // Near the top of the badge circle, clear of its number.
    case 'badge': {
      const corner = outlineCorner(box, scale);
      const radius = BADGE_RADIUS * scale;
      return {
        x: Math.max(corner.x, radius),
        y: Math.floor(Math.max(corner.y, radius) - radius + 3 * scale),
      };
    }
    default:
      throw new Error(`unknown probe position "${probe.at}"`);
  }
}

async function verifyScreenshots(goldenFile) {
  const parsed = JSON.parse(
    await readFile(path.join(root, goldenFile), 'utf8'),
  );
  for (const golden of [parsed].flat()) {
    for (const bundleDir of golden.bundleDirs) {
      await verifyBundleScreenshots(golden, bundleDir);
    }
  }
}

async function verifyBundleScreenshots(golden, bundleDirName) {
  const bundleDir = path.join(root, 'qa-runs', bundleDirName);
  const bundle = JSON.parse(
    await readFile(path.join(bundleDir, 'bundle.json'), 'utf8'),
  );

  if (golden.highlights) {
    const actual = bundle.steps.map(
      (step) => bundle.assets[step.assetIds?.[0]]?.highlight ?? null,
    );
    if (JSON.stringify(actual) !== JSON.stringify(golden.highlights)) {
      fail(
        `${bundleDirName}: Highlights ${JSON.stringify(actual)}, expected ${JSON.stringify(golden.highlights)}`,
      );
    }
  }

  // Steps listed by `index` are spot checks; otherwise every step is listed.
  const spotChecks = golden.steps.every((s) => s.index !== undefined);
  if (!spotChecks && bundle.steps.length !== golden.steps.length) {
    fail(
      `${bundleDirName}: ${bundle.steps.length} QA Steps, expected ${golden.steps.length}`,
    );
    return;
  }

  for (const [i, expected] of golden.steps.entries()) {
    const index = expected.index ?? i + 1;
    const step = bundle.steps[index - 1];
    const label = `${bundleDirName} step ${index}`;
    if (!step) {
      fail(`${label}: missing`);
      continue;
    }
    if (expected.action !== undefined && step.action !== expected.action) {
      fail(`${label}: action "${step.action}", expected "${expected.action}"`);
    }
    if (step.assetIds?.length !== 1) {
      fail(`${label}: expected one Step Screenshot, got ${step.assetIds}`);
      continue;
    }
    if (
      expected.moment !== undefined &&
      step.screenshotMoment !== expected.moment
    ) {
      fail(
        `${label}: screenshot taken ${step.screenshotMoment}, expected ${expected.moment}`,
      );
    }

    const asset = bundle.assets[step.assetIds[0]];
    let data;
    try {
      data = await readFile(path.join(bundleDir, 'assets', asset.filename));
    } catch (error) {
      fail(`${label}: missing screenshot ${asset?.filename}: ${error.message}`);
      continue;
    }
    if (data.length < golden.minBytes) {
      fail(`${label}: screenshot is only ${data.length} bytes`);
    }

    // A high-DPI screenshot may be a whole multiple of the viewport.
    const png = PNG.sync.read(data);
    const scale = png.width / golden.viewport.width;
    if (
      !Number.isInteger(scale) ||
      png.height !== golden.viewport.height * scale
    ) {
      fail(`${label}: screenshot is ${png.width}x${png.height}`);
    }

    for (const probe of expected.probes) {
      const point = probePoint(probe, step, scale);
      if (!point) {
        fail(
          `${label}: no element box or click point for probe "${probe.name}"`,
        );
        continue;
      }
      const idx = (png.width * point.y + point.x) * 4;
      const actual = [png.data[idx], png.data[idx + 1], png.data[idx + 2]];
      if (actual.some((c, k) => Math.abs(c - probe.rgb[k]) > TOLERANCE)) {
        fail(
          `${label}: probe "${probe.name}" at (${point.x},${point.y}) expected rgb(${probe.rgb}) got rgb(${actual})`,
        );
      }
    }
  }
}

/** The images a rendered page shows, in order: embedded or linked. */
async function renderedImages(rendered, content) {
  if (rendered.endsWith('.html')) {
    return [...content.matchAll(/src="data:image\/png;base64,([^"]+)"/g)].map(
      ([, base64]) => Buffer.from(base64, 'base64'),
    );
  }
  const dir = path.dirname(path.join(root, rendered));
  return Promise.all(
    [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(([, link]) =>
      readFile(path.join(dir, decodeURIComponent(link))),
    ),
  );
}

/** Each rendered image must be the Step Screenshot of its step, in order. */
async function verifyImages(rendered, bundleDir, content) {
  const dir = path.join(root, bundleDir);
  const bundle = JSON.parse(
    await readFile(path.join(dir, 'bundle.json'), 'utf8'),
  );
  const expected = await Promise.all(
    bundle.steps
      .filter((step) => step.assetIds?.length)
      .map((step) =>
        readFile(
          path.join(dir, 'assets', bundle.assets[step.assetIds[0]].filename),
        ),
      ),
  );
  const actual = await renderedImages(rendered, content);
  if (actual.length !== expected.length) {
    fail(
      `${rendered}: shows ${actual.length} images, expected ${expected.length}`,
    );
    return;
  }
  actual.forEach((image, i) => {
    if (!image.equals(expected[i])) {
      fail(`${rendered}: image ${i + 1} is not its step's Step Screenshot`);
    }
  });
}

for (const { rendered, golden, bundleDir } of GOLDENS) {
  const actualPath = path.join(root, rendered);
  const goldenPath = path.join(root, golden);

  let content;
  try {
    content = await readFile(actualPath, 'utf8');
  } catch (error) {
    console.error(
      `verify-run: missing rendered output ${rendered}: ${error.message}`,
    );
    failed = true;
    continue;
  }

  if (bundleDir) {
    try {
      await verifyImages(rendered, bundleDir, content);
    } catch (error) {
      fail(`${rendered}: ${error.message}`);
    }
  }

  const actual = normalizeRendered(rendered, content);
  const expected = await readFile(goldenPath, 'utf8');
  if (actual !== expected) {
    failed = true;
    console.error(`verify-run: ${rendered} does not match ${golden}`);
    console.error('--- expected ---');
    console.error(expected);
    console.error('--- actual ---');
    console.error(actual);
  }
}

for (const goldenFile of SCREENSHOT_GOLDENS) {
  try {
    await verifyScreenshots(goldenFile);
  } catch (error) {
    fail(`${goldenFile}: ${error.message}`);
  }
}

/** Fails if any written file (bundle JSON, assets, rendered text) holds a secret. */
async function verifyNoSecrets() {
  let scanned = 0;
  for (const dir of OUTPUT_DIRS) {
    const entries = await readdir(path.join(root, dir), {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries.filter((e) => e.isFile())) {
      const file = path.join(entry.parentPath, entry.name);
      const text = await readFile(file, 'latin1');
      scanned += 1;
      for (const secret of SECRETS) {
        if (text.includes(secret)) {
          fail(`${path.relative(root, file)} contains the secret "${secret}"`);
        }
      }
    }
  }
  return scanned;
}

const scanned = await verifyNoSecrets();

if (failed) process.exit(1);
console.log(
  `verify-run: ok (${GOLDENS.length} text golden(s), ${SCREENSHOT_GOLDENS.length} screenshot golden(s), no secrets in ${scanned} file(s))`,
);
