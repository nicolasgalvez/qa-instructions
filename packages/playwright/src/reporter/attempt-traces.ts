import type { TestResult } from '@playwright/test/reporter';
import { NoScreenshots, type ScreenshotSource } from '@qa-instructions/core';

import { TraceScreenshotSource } from './trace-screenshot-source.js';

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

  /** Screenshots from the attempt's trace; none if it had no trace. */
  async screenshots(
    testId: string | undefined,
    attempt = 1,
  ): Promise<ScreenshotSource> {
    const path =
      testId === undefined
        ? undefined
        : this.paths.get(this.key(testId, attempt));
    return path ? TraceScreenshotSource.open(path) : new NoScreenshots();
  }

  private key(testId: string, attempt: number): string {
    return `${testId}#${attempt}`;
  }
}
