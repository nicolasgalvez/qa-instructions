import path from 'node:path';

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import {
  bundleDirName,
  QaInstructionsRecorder,
  writeBundle,
} from '@qa-instructions/core';

import { PlaywrightStepTranslator } from './step-translator.js';

export type QaInstructionsReporterOptions = {
  /** Where QA Instructions bundles are written. Default `qa-runs`. */
  outputDir?: string;
};

/**
 * Playwright reporter that derives QA Instructions from what each test
 * already does. Add it to `reporter` in playwright.config; tests are not
 * changed. Imports Playwright for types only.
 */
export default class QaInstructionsReporter implements Reporter {
  private readonly outputDir: string;

  constructor(
    options: QaInstructionsReporterOptions = {},
    private readonly translator = new PlaywrightStepTranslator(),
  ) {
    this.outputDir = options.outputDir ?? 'qa-runs';
  }

  printsToStdio(): boolean {
    return false;
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    try {
      const recorder = new QaInstructionsRecorder();
      for (const event of this.translator.translate(test, result)) {
        recorder.handle(event);
      }
      const dir = path.join(
        this.outputDir,
        bundleDirName(test.location.file, test.title),
      );
      await writeBundle(dir, recorder.toBundle(), []);
    } catch (error) {
      console.warn(
        `qa-instructions: could not write QA Instructions for "${test.title}": ${String(error)}`,
      );
    }
  }
}
