import assert from 'node:assert/strict';
import test from 'node:test';

import type { FullConfig, FullResult } from '@playwright/test/reporter';

import { PlaywrightRunCoverage } from '../src/reporter/run-coverage.js';

const cli = ['node', '/proj/node_modules/playwright/cli.js', 'test'];
const config = { shard: null, maxFailures: 0 } as unknown as FullConfig;
const passed = { status: 'passed' } as FullResult;

function coverage(
  args: string[],
  runConfig: FullConfig | undefined = config,
  result: FullResult | undefined = passed,
) {
  return new PlaywrightRunCoverage([...cli, ...args]).of(runConfig, result);
}

test('a plain playwright test run is complete, whatever options it sets', () => {
  assert.equal(coverage([]), 'complete');
  assert.equal(
    coverage(['--workers', '4', '-c', 'e2e.config.ts', '--reporter=list']),
    'complete',
  );
  assert.equal(coverage(['-u', 'all', '--headed']), 'complete');
});

test('test filters on the command line make a run partial', () => {
  for (const args of [
    ['tests/sign-in.spec.ts'],
    ['sign-in:12'],
    ['-g', 'Sign in'],
    ['--grep-invert=@slow'],
    ['--project', 'chromium'],
    ['--last-failed'],
    ['--only-changed'],
    ['--shard=1/2'],
    ['--list'],
    ['--workers', '4', 'cart'],
    ['--some-new-option', 'value'],
  ]) {
    assert.equal(coverage(args), 'partial', args.join(' '));
  }
});

test('an unknown invocation, sharding, early stop, or interruption makes a run partial', () => {
  assert.equal(
    new PlaywrightRunCoverage(['node', 'runner.js']).of(config, passed),
    'partial',
  );
  assert.equal(new PlaywrightRunCoverage(cli).of(undefined, passed), 'partial');
  assert.equal(new PlaywrightRunCoverage(cli).of(config, undefined), 'partial');
  assert.equal(
    coverage([], { ...config, shard: { current: 1, total: 2 } } as FullConfig),
    'partial',
  );
  assert.equal(
    coverage(
      [],
      { ...config, maxFailures: 1 } as FullConfig,
      {
        status: 'failed',
      } as FullResult,
    ),
    'partial',
  );
  assert.equal(
    coverage([], { ...config, maxFailures: 1 } as FullConfig),
    'complete',
  );
  assert.equal(
    coverage([], config, { status: 'timedout' } as FullResult),
    'partial',
  );
  assert.equal(
    coverage([], config, { status: 'failed' } as FullResult),
    'complete',
  );
});
