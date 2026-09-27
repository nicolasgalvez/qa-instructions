import type { FullConfig, FullResult } from '@playwright/test/reporter';
import type { RunCoverage } from '@qa-instructions/core';

/** Options that run only part of the suite. */
const NARROWING_OPTIONS = new Set([
  '-g',
  '--grep',
  '--grep-invert',
  '--project',
  '--last-failed',
  '--only-changed',
  '--shard',
  '--list',
  '--ui',
  '--test-list',
  '--test-list-invert',
]);

/** Options known to take a separate value, which is not a test filter. */
const VALUE_OPTIONS = new Set([
  '-c',
  '--config',
  '-j',
  '--workers',
  '--reporter',
  '--retries',
  '--timeout',
  '--global-timeout',
  '--trace',
  '--output',
  '--repeat-each',
  '--max-failures',
  '--browser',
  '--tsconfig',
  '--update-source-method',
]);

/** `-u`/`--update-snapshots` take an optional mode. */
const UPDATE_OPTIONS = new Set(['-u', '--update-snapshots']);
const UPDATE_MODES = new Set(['all', 'changed', 'missing', 'none']);

/**
 * Tells whether a Playwright run covered the whole suite. Playwright does not
 * report its command-line test filters to reporters, so it reads them from
 * the `playwright test` command line. Anything it does not recognize (an
 * unknown option's value, a run not started as `playwright test`) counts as
 * partial, so a doubt never removes QA Instructions.
 */
export class PlaywrightRunCoverage {
  constructor(private readonly argv: readonly string[] = process.argv) {}

  of(
    config: FullConfig | undefined,
    result: FullResult | undefined,
  ): RunCoverage {
    const finished =
      result?.status === 'passed' ||
      (result?.status === 'failed' && !config?.maxFailures);
    return finished && config && !config.shard && this.unfilteredCommand()
      ? 'complete'
      : 'partial';
  }

  private unfilteredCommand(): boolean {
    const start = this.argv.indexOf('test', 1);
    if (start === -1) return false;

    const args = this.argv.slice(start + 1);
    for (let i = 0; i < args.length; i++) {
      const [name, value] = args[i].split('=', 2);
      if (NARROWING_OPTIONS.has(name)) return false;
      if (!name.startsWith('-')) return false;
      if (value !== undefined) continue;
      if (VALUE_OPTIONS.has(name)) i++;
      else if (UPDATE_OPTIONS.has(name) && UPDATE_MODES.has(args[i + 1])) i++;
    }
    return true;
  }
}
