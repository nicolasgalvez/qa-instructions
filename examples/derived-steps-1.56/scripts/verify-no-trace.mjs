import { spawnSync } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { GOLDENS, root, syncSpecs } from './shared.mjs';

// Runs the tests without the trace setting and checks that QA Instructions
// are still written, text only, and that the reporter warns exactly once
// with the setting to add.

const WARNING =
  "no trace was recorded, so QA Instructions have no Step Screenshots. Add this to playwright.config to get them: use: { trace: 'on' }";

const bundlesDir = path.join(root, 'qa-runs-no-trace');
await rm(bundlesDir, { recursive: true, force: true });
await syncSpecs();

const run = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '-c', 'playwright.no-trace.config.ts'],
  { cwd: root, encoding: 'utf8' },
);
const output = `${run.stdout}${run.stderr}`;

let failed = false;
function fail(message) {
  console.error(`verify-no-trace: ${message}`);
  failed = true;
}

if (run.status !== 0) fail(`the test run exited ${run.status}:\n${output}`);

const warnings = output.split('\n').filter((line) => line.includes(WARNING));
if (warnings.length !== 1) {
  fail(`expected the trace warning once, got ${warnings.length}:\n${output}`);
}

for (const name of GOLDENS) {
  try {
    const dir = path.join(bundlesDir, name);
    const bundle = JSON.parse(
      await readFile(path.join(dir, 'bundle.json'), 'utf8'),
    );
    if (bundle.steps.length === 0) fail(`${name}: no QA Steps`);
    if (bundle.steps.some((step) => step.assetIds))
      fail(`${name}: has screenshots`);
    if ((await readdir(path.join(dir, 'assets'))).length > 0) {
      fail(`${name}: has assets`);
    }
  } catch (error) {
    fail(`${name}: ${error.message}`);
  }
}

if (failed) process.exit(1);
console.log(
  'verify-no-trace: ok (text-only QA Instructions, one warning with the trace setting)',
);
