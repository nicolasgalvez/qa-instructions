import { readFile } from 'node:fs/promises';

import {
  BUNDLE,
  QA_STEPS,
  bundleDirName,
  readNormalizedBundle,
} from './goldens.mjs';

function fail(message) {
  console.error(`verify-run: ${message}`);
  process.exitCode = 1;
}

try {
  const bundle = await readNormalizedBundle(BUNDLE.collected);
  const goldenBundle = await readNormalizedBundle(BUNDLE.golden);
  if (JSON.stringify(bundle) !== JSON.stringify(goldenBundle)) {
    fail(
      'bundle.json does not match golden (after normalizing capturedAt, test path, and host)',
    );
    console.error('expected:', JSON.stringify(goldenBundle, null, 2));
    console.error('actual:', JSON.stringify(bundle, null, 2));
  }
} catch (error) {
  fail(`bundle missing or unreadable: ${error.message}`);
}

try {
  const qaSteps = await readFile(QA_STEPS.rendered, 'utf8');
  const goldenSteps = await readFile(QA_STEPS.golden, 'utf8');
  if (qaSteps !== goldenSteps) {
    fail('qa-steps.txt does not match golden');
    console.error('--- expected ---');
    console.error(goldenSteps);
    console.error('--- actual ---');
    console.error(qaSteps);
  }
} catch (error) {
  fail(`qa-steps output missing or unreadable: ${error.message}`);
}

if (process.exitCode) process.exit(process.exitCode);

console.log(`verify-run: ok (${bundleDirName})`);
