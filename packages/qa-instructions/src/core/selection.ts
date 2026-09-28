import { minimatch } from 'minimatch';

import type { TestStartEvent } from './events.js';

/**
 * Which tests produce QA Instructions. An empty or missing list places no
 * limit, so with nothing configured every test is selected.
 */
export type TestSelectionOptions = {
  /** Select tests carrying any of these tags, matched exactly (e.g. `@qa`). */
  tags?: string[];
  /**
   * Select tests whose file matches any of these glob patterns. A relative
   * pattern matches the end of the test file path (`auth/*.spec.ts`); an
   * absolute one, or one starting with `**`, matches the whole path.
   */
  files?: string[];
};

/**
 * Decides from a test's start event whether it produces QA Instructions.
 * When tags and files are both configured, a test must match both.
 */
export class TestSelection {
  private readonly tags: ReadonlySet<string>;
  private readonly filePatterns: readonly string[];

  constructor(options: TestSelectionOptions = {}) {
    this.tags = new Set(options.tags ?? []);
    this.filePatterns = (options.files ?? []).map((pattern) =>
      this.anchor(pattern),
    );
  }

  includes(test: Pick<TestStartEvent, 'file' | 'tags'>): boolean {
    return this.matchesTags(test.tags) && this.matchesFile(test.file);
  }

  private matchesTags(tags: string[] = []): boolean {
    return this.tags.size === 0 || tags.some((tag) => this.tags.has(tag));
  }

  private matchesFile(file: string | undefined): boolean {
    if (this.filePatterns.length === 0) return true;
    if (file === undefined) return false;

    const normalized = file.replaceAll('\\', '/');
    return this.filePatterns.some((pattern) =>
      minimatch(normalized, pattern, { dot: true }),
    );
  }

  /** Lets a relative pattern match at any depth, like `**` before it. */
  private anchor(pattern: string): string {
    return pattern.startsWith('/') || pattern.startsWith('**')
      ? pattern
      : `**/${pattern}`;
  }
}
