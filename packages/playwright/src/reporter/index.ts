import path from 'node:path';

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import {
  QaInstructionsRecorder,
  QaInstructionsRun,
  TestSelection,
  type TestSelectionOptions,
  writeBundle,
  type QaInstructionsResult,
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

  constructor(
    options: QaInstructionsReporterOptions = {},
    private readonly translator = new PlaywrightStepTranslator(),
    private readonly run = new QaInstructionsRun(
      () => new QaInstructionsRecorder({ sections: options.testSteps }),
    ),
  ) {
    this.outputDir = options.outputDir ?? 'qa-runs';
    this.selection = new TestSelection(options.select);
  }

  printsToStdio(): boolean {
    return false;
  }

  /** Called once per attempt; the run keeps each test's last attempt. */
  onTestEnd(test: TestCase, result: TestResult): void {
    try {
      if (!this.selection.includes(this.translator.testStart(test))) return;

      for (const event of this.translator.translate(test, result)) {
        this.run.handle(event);
      }
    } catch (error) {
      this.warn(test.title, error);
    }
  }

  /** Writes one bundle per test once every attempt has been seen. */
  async onEnd(): Promise<void> {
    let results: QaInstructionsResult[] = [];
    try {
      results = this.run.results();
    } catch (error) {
      this.warn('this run', error);
    }
    for (const { dirName, bundle } of results) {
      try {
        await writeBundle(path.join(this.outputDir, dirName), bundle, []);
      } catch (error) {
        this.warn(bundle.meta.title, error);
      }
    }
  }

  private warn(subject: string, error: unknown): void {
    console.warn(
      `qa-instructions: could not write QA Instructions for "${subject}": ${String(error)}`,
    );
  }
}
