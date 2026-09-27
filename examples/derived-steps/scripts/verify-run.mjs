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

let failed = false;

function fail(message) {
  console.error(`verify-run: ${message}`);
  failed = true;
}

function probePoint(probe, step) {
  if (probe.at !== 'elementBoxCenter') return { x: probe.x, y: probe.y };
  const box = step.elementBox;
  if (!box) return undefined;
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

async function verifyScreenshots(goldenFile) {
  const golden = JSON.parse(
    await readFile(path.join(root, goldenFile), 'utf8'),
  );
  const bundleDir = path.join(root, 'qa-runs', golden.bundleDir);
  const bundle = JSON.parse(
    await readFile(path.join(bundleDir, 'bundle.json'), 'utf8'),
  );

  if (bundle.steps.length !== golden.steps.length) {
    fail(
      `${golden.bundleDir}: ${bundle.steps.length} QA Steps, expected ${golden.steps.length}`,
    );
    return;
  }

  for (const [i, expected] of golden.steps.entries()) {
    const step = bundle.steps[i];
    const label = `${golden.bundleDir} step ${i + 1}`;
    if (step.action !== expected.action) {
      fail(`${label}: action "${step.action}", expected "${expected.action}"`);
    }
    if (step.assetIds?.length !== 1) {
      fail(`${label}: expected one Step Screenshot, got ${step.assetIds}`);
      continue;
    }
    if (step.screenshotMoment !== expected.moment) {
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

    const png = PNG.sync.read(data);
    if (
      png.width !== golden.viewport.width ||
      png.height !== golden.viewport.height
    ) {
      fail(`${label}: screenshot is ${png.width}x${png.height}`);
    }

    for (const probe of expected.probes) {
      const point = probePoint(probe, step);
      if (!point) {
        fail(`${label}: no element box for probe "${probe.name}"`);
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
