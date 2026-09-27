import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { GOLDENS, derivedSteps, root } from './shared.mjs';

// The derived-steps tests on Playwright 1.56 must read exactly like the 1.63
// goldens, and every QA Step must have a Step Screenshot from the trace's
// screen recording (a JPEG frame, taken as the Action ended).

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

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
    actual = await readFile(
      path.join(root, 'qa-steps-out', `${name}.txt`),
      'utf8',
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
    if (step.screenshotMoment !== 'after') {
      fail(
        `${label}: screenshot taken ${step.screenshotMoment}, expected after`,
      );
    }
    const asset = bundle.assets[step.assetIds[0]];
    try {
      const data = await readFile(path.join(dir, 'assets', asset.filename));
      if (!data.subarray(0, 3).equals(JPEG) || data.length < 1000) {
        fail(`${label}: ${asset.filename} is not a screen recording frame`);
      }
    } catch (error) {
      fail(`${label}: missing screenshot ${asset?.filename}: ${error.message}`);
    }
  }
}

if (failed) process.exit(1);
console.log(
  `verify-run: ok (${GOLDENS.length} 1.63 golden(s) matched on Playwright 1.56, with Step Screenshots)`,
);
