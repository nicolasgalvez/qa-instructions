import type { TestResult } from '@playwright/test/reporter';
import { NoScreenshots, type ScreenshotSource } from '@qa-instructions/core';

import type { ScreenshotProblem } from './trace-advice.js';
import { TraceScreenshotSource } from './trace-screenshot-source.js';

/** An attempt's Step Screenshots, or why it has none. */
export type AttemptScreenshots = {
  source: ScreenshotSource;
  problem?: ScreenshotProblem;
};

/**
 * The trace Playwright attached to each test attempt, so Step Screenshots
 * come from the same attempt as the QA Instructions.
 */
export class AttemptTraces {
  private readonly paths = new Map<string, string>();

  add(
    testId: string,
    attempt: number,
    attachments: TestResult['attachments'],
  ): void {
    const trace = attachments.find(
      (attachment) => attachment.name === 'trace' && attachment.path,
    );
    if (trace?.path) this.paths.set(this.key(testId, attempt), trace.path);
  }

  /** Screenshots from the attempt's trace; none if it had no usable trace. */
  async screenshots(
    testId: string | undefined,
    attempt = 1,
  ): Promise<AttemptScreenshots> {
    const path =
      testId === undefined
        ? undefined
        : this.paths.get(this.key(testId, attempt));
    if (!path) {
      return { source: new NoScreenshots(), problem: { kind: 'missing' } };
    }
    const source = await TraceScreenshotSource.open(path);
    return { source, problem: source.problem };
  }

  private key(testId: string, attempt: number): string {
    return `${testId}#${attempt}`;
  }
}
