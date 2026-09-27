import path from 'node:path';

import type {
  FullConfig,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import {
  HighlightPlanner,
  QaInstructionsRecorder,
  QaInstructionsRun,
  SecretMasker,
  StepScreenshotHighlighter,
  TestSelection,
  type HighlightStyle,
  type MaskPattern,
  type TestSelectionOptions,
  writeBundle,
  type QaInstructionsResult,
  type SectionPresentation,
} from '@qa-instructions/core';

import { AttemptTraces } from './attempt-traces.js';
import { ReporterLog } from './reporter-log.js';
import { SharpScreenshotAnnotator } from './sharp-screenshot-annotator.js';
import { PlaywrightStepTranslator } from './step-translator.js';
import { TraceAdvice } from './trace-advice.js';

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
  /**
   * More secrets to mask wherever they would appear (API keys, emails): exact
   * strings, or regular expressions. Values typed into password fields are
   * always masked when the trace records DOM snapshots.
   */
  mask?: MaskPattern[];
  /**
   * How each Step Screenshot marks the element acted on: `outline`,
   * `clickDot`, `badge` (the step number), `spotlight`, a list of these, or
   * `none`. Default `['outline', 'clickDot']`.
   */
  highlight?: HighlightStyle;
};

/**
 * Playwright reporter that derives QA Instructions from what each test
 * already does. Add it to `reporter` in playwright.config; tests are not
 * changed. Imports Playwright for types only.
 *
 * Nothing it does can fail the test run: every hook catches its own errors
 * and reports them once on stderr, along with any setup advice (such as the
 * trace setting Step Screenshots need).
 */
export default class QaInstructionsReporter implements Reporter {
  private readonly outputDir: string;
  private readonly selection: TestSelection;
  private advice = new TraceAdvice();

  constructor(
    options: QaInstructionsReporterOptions = {},
    private readonly translator = new PlaywrightStepTranslator(),
    masker = new SecretMasker(options.mask),
    private readonly run = new QaInstructionsRun(
      () => new QaInstructionsRecorder({ sections: options.testSteps, masker }),
      undefined,
      masker,
    ),
    private readonly traces = new AttemptTraces(),
    private readonly highlighter = new StepScreenshotHighlighter(
      new SharpScreenshotAnnotator(),
      new HighlightPlanner(options.highlight),
      (step, error) => this.warnHighlight(step.action, error),
    ),
    private readonly log = new ReporterLog(),
  ) {
    this.outputDir = options.outputDir ?? 'qa-runs';
    this.selection = this.selectionOf(options.select);
  }

  printsToStdio(): boolean {
    return false;
  }

  /** Learns the project's Playwright version, for version-specific advice. */
  onBegin(config: FullConfig): void {
    try {
      this.advice = new TraceAdvice(config?.version);
    } catch (error) {
      this.log.error('this run', error);
    }
  }

  /** Called once per attempt; the run keeps each test's last attempt. */
  onTestEnd(test: TestCase, result: TestResult): void {
    try {
      if (!this.selection.includes(this.translator.testStart(test))) return;

      for (const event of this.translator.translate(test, result)) {
        this.run.handle(event);
      }
      this.traces.add(test.id, result.retry + 1, result.attachments);
    } catch (error) {
      this.log.error(test?.title, error);
    }
  }

  /**
   * Writes one bundle per test once every attempt has been seen, with Step
   * Screenshots from the trace of the attempt it came from, highlighted.
   */
  async onEnd(): Promise<void> {
    let results: QaInstructionsResult[] = [];
    try {
      results = this.run.results();
    } catch (error) {
      this.log.error('this run', error);
    }
    for (const result of results) {
      try {
        await this.write(result);
      } catch (error) {
        this.log.error(result.bundle.meta.title, error);
      }
    }
  }

  private async write(result: QaInstructionsResult): Promise<void> {
    const { source, problem } = await this.traces.screenshots(
      result.start.id,
      result.start.attempt,
    );
    if (problem) {
      this.log.once(this.advice.key(problem), this.advice.message(problem));
    }
    const { bundle, assets } = await this.highlighter.highlight(
      result.record(source),
    );
    await writeBundle(
      path.join(this.outputDir, result.dirName),
      bundle,
      assets,
    );
  }

  private warnHighlight(step: string, error: unknown): void {
    console.warn(
      `qa-instructions: could not highlight the screenshot for "${step}"; kept it unmarked: ${String(error)}`,
    );
  }

  /** An unusable `select` option is ignored, with a warning, rather than stopping the run. */
  private selectionOf(select: TestSelectionOptions | undefined): TestSelection {
    try {
      return new TestSelection(select);
    } catch (error) {
      this.log.once(
        'select',
        `ignoring the "select" option (${String(error)}); every test produces QA Instructions.`,
      );
      return new TestSelection();
    }
  }
}
