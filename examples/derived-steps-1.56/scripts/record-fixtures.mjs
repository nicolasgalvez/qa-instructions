import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { SPECS, derivedSteps, root, syncSpecs } from './shared.mjs';

// Re-records the adapter's Playwright-version fixtures in
// packages/qa-instructions/test/playwright/fixtures:
//   steps/1.56/*.json, steps/1.63/*.json  reporter steps per test
//   steps/*.spec.ts                       the sources those steps point at
//   traces/v8.zip                         the sample scenario's 1.56 trace
//   traces/v8-checks.zip                  the cart test's 1.56 trace, whose
//                                         checks the steps do not describe
//   traces/v8-scroll.zip                  the scroll scenario's 1.56 trace
//   traces/v8-scripts.zip                 the scripts scenario's 1.56 trace
//   traces/v8-smooth.zip                  the smooth-scroll scenario's 1.56 trace

const fixtures = path.join(
  root,
  '..',
  '..',
  'packages',
  'qa-instructions',
  'test',
  'playwright',
  'fixtures',
);
/** The adapter's own trace scenarios, recorded by the `trace` project. */
const SCENARIOS = [
  'scenario.spec.ts',
  'scroll.spec.ts',
  'scripts.spec.ts',
  'smooth.spec.ts',
];
/** Each recorded test's results directory prefix and the sample trace it becomes. */
const TRACES = [
  ['scenario-', 'v8.zip'],
  ['scroll-', 'v8-scroll.zip'],
  ['scripts-', 'v8-scripts.zip'],
  ['smooth-', 'v8-smooth.zip'],
  ['cart-', 'v8-checks.zip'],
];

function run(cwd, config) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '-c', config],
    {
      cwd,
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    console.error(
      `record-fixtures: ${config} in ${cwd} exited ${result.status}`,
    );
    process.exit(1);
  }
}

await syncSpecs();
await mkdir(path.join(root, 'trace-scenario'), { recursive: true });
for (const spec of SCENARIOS) {
  await copyFile(
    path.join(fixtures, 'traces', spec),
    path.join(root, 'trace-scenario', spec),
  );
}

await rm(path.join(fixtures, 'steps', '1.56'), {
  recursive: true,
  force: true,
});
await rm(path.join(fixtures, 'steps', '1.63'), {
  recursive: true,
  force: true,
});
run(root, 'playwright.record.config.ts');
run(derivedSteps, 'playwright.record.config.ts');

for (const spec of SPECS) {
  await copyFile(
    path.join(root, 'tests', spec),
    path.join(fixtures, 'steps', spec),
  );
}

const traceDir = path.join(root, 'test-results', 'record');
const recordedTraces = await readdir(traceDir);
for (const [prefix, fixture] of TRACES) {
  const recorded = recordedTraces.find((d) => d.startsWith(prefix));
  await copyFile(
    path.join(traceDir, recorded, 'trace.zip'),
    path.join(fixtures, 'traces', fixture),
  );
}

console.log('record-fixtures: ok');
