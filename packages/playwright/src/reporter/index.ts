import path from 'node:path';

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import {
  bundleDirName,
  QaInstructionsRecorder,
  TestSelection,
  type TestSelectionOptions,
  writeBundle,
  type SectionPresentation,
} from '@qa-instructions/core';

import { PlaywrightStepTranslator } from './step-translator.js';

export type QaInstructionsReporterOptions = {
  /** Where QA Instructions bundles are written. Default `qa-runs`. */
  outputDir?: string;
  /**
   * Limit which tests produce QA Instructions, by tag and by test file glob.
   * Default: every test. Unselected tests still run and produce nothing.
   */
  select?: TestSelectionOptions;
  /**
   * How the test's own `test.step` groups appear: as Section headings
   * (`sections`, default), each collapsed into one QA Step (`collapse`), or
   * not at all (`ignore`).
   */
  testSteps?: SectionPresentation;
};

/**
 * Playwright reporter that derives QA Instructions from what each test
 * already does. Add it to `reporter` in playwright.config; tests are not
 * changed. Imports Playwright for types only.
 */
export default class QaInstructionsReporter implements Reporter {
  private readonly outputDir: string;
  private readonly selection: TestSelection;
  private readonly testSteps?: SectionPresentation;

  constructor(
    options: QaInstructionsReporterOptions = {},
    private readonly translator = new PlaywrightStepTranslator(),
  ) {
    this.outputDir = options.outputDir ?? 'qa-runs';
    this.selection = new TestSelection(options.select);
    this.testSteps = options.testSteps;
  }

  printsToStdio(): boolean {
    return false;
  }

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    try {
      if (!this.selection.includes(this.translator.testStart(test))) return;

      const recorder = new QaInstructionsRecorder({
        sections: this.testSteps,
      });
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
