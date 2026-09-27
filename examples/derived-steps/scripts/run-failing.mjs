import { spawnSync } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { root } from './goldens.mjs';

// Runs the deliberately failing tests (with retries) and asserts the run
// fails as expected, yielding one bundle per test that ran despite the
// retries, and none for the skipped tests.

const bundlesDir = path.join(root, 'qa-runs', 'failing');
const expectedBundles = 5;

await rm(bundlesDir, { recursive: true, force: true });

const run = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'playwright.failing.config.ts'],
  { cwd: root, stdio: 'inherit' },
);

if (run.status !== 1) {
  console.error(
    `run-failing: expected the failing tests to exit 1, got ${run.status}`,
  );
  process.exit(1);
}

const bundles = await readdir(bundlesDir);
if (bundles.length !== expectedBundles) {
  console.error(
    `run-failing: expected ${expectedBundles} bundles (one per test), got ${bundles.length}: ${bundles.join(', ')}`,
  );
  process.exit(1);
}

console.log(`run-failing: ok (failed as expected, ${bundles.length} bundles)`);
