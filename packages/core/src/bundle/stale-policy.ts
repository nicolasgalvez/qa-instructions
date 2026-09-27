import { TestSelection } from '../selection.js';
import type { OwnedBundleDir } from './output-dir.js';

/**
 * Whether a run covered the whole suite (`complete`), or only part of it,
 * so tests it did not run may still exist (`partial`).
 */
export type RunCoverage = 'complete' | 'partial';

/**
 * Decides which bundle directories from earlier runs are stale: after a
 * complete run, every directory this tool wrote that the run did not write
 * again, unless the `select` option now leaves its test out. After a
 * partial run, none, since the tests it skipped may still exist.
 */
export class StaleBundlePolicy {
  constructor(private readonly selection = new TestSelection()) {}

  staleDirs(
    owned: OwnedBundleDir[],
    written: ReadonlySet<string>,
    coverage: RunCoverage,
  ): string[] {
    if (coverage !== 'complete') return [];
    return owned
      .filter(
        ({ name, owner }) =>
          !written.has(name) && this.selection.includes(owner),
      )
      .map(({ name }) => name);
  }
}
