import type { QaAsset, QaRunBundle, QaStep } from '../model.js';
import { InlineMarkup } from './inline-markup.js';

/** Words every format shows the same way, so the formats never drift apart. */
export const QaWording = {
  incomplete: 'Incomplete',
  warning: 'Warning',
  expected: 'Expected',
  approximate:
    'approximate: the test forced this Action past its usual checks, so its highlight may not line up',
  failed: 'test failed here',
  checkFailed: 'check failed here',
} as const;

/** A QA Step's Step Screenshot, with alt text taken from its Action. */
export type StepScreenshotView = { asset: QaAsset; alt: string };

/** One QA Step as every format shows it. Text fields use inline markup. */
export type QaStepView = {
  number: number;
  action: string;
  expected?: string;
  warning: boolean;
  approximate: boolean;
  /** What failed on this step, worded: the test, or else a soft check. */
  failure?: string;
  screenshot?: StepScreenshotView;
};

/** Consecutive QA Steps in the same Section. */
export type SectionRun = {
  /** Titles of the Section, outermost first; empty outside any Section. */
  section: readonly string[];
  /** How many outer Section titles this run shares with the previous run. */
  shared: number;
  /** How many of the previous run's Sections end before this run. */
  closes: number;
  steps: QaStepView[];
};

/**
 * QA Instructions as every output format shows them: one walk over the
 * bundle, so text, Markdown, and HTML show the same steps, Expected Results,
 * Sections, warnings, and status.
 */
export class QaInstructionsView {
  private constructor(
    readonly title: string,
    readonly prerequisite: string | undefined,
    /** Why later steps are missing, when the test did not pass. */
    readonly incomplete: string | undefined,
    readonly runs: readonly SectionRun[],
  ) {}

  static from(bundle: QaRunBundle): QaInstructionsView {
    return new QaInstructionsView(
      bundle.meta.title,
      bundle.meta.prerequisite,
      bundle.meta.status === 'incomplete'
        ? QaInstructionsView.incompleteNote(bundle.steps)
        : undefined,
      QaInstructionsView.sectionRuns(bundle),
    );
  }

  /** Where an incomplete test stopped, or where its first soft check failed. */
  private static incompleteNote(steps: QaStep[]): string {
    const failing = steps.find((step) => step.failed);
    const checkFailing = steps.find((step) => step.checkFailed);
    const last = steps.at(-1);
    if (failing) {
      return `the test failed at step ${failing.index}, so any later steps are missing.`;
    }
    if (checkFailing) {
      return `a check failed at step ${checkFailing.index}; the test went on, so the later steps are all here.`;
    }
    if (last) {
      return `the test failed after step ${last.index}, so any later steps are missing.`;
    }
    return 'the test failed before its first step.';
  }

  private static sectionRuns(bundle: QaRunBundle): SectionRun[] {
    const runs: SectionRun[] = [];
    let previous: readonly string[] = [];
    for (const step of bundle.steps) {
      const section = step.section ?? [];
      const current = runs.at(-1);
      if (current && QaInstructionsView.sameSection(current.section, section)) {
        current.steps.push(QaInstructionsView.stepView(bundle, step));
        continue;
      }
      const shared = QaInstructionsView.sharedLength(previous, section);
      runs.push({
        section,
        shared,
        closes: previous.length - shared,
        steps: [QaInstructionsView.stepView(bundle, step)],
      });
      previous = section;
    }
    return runs;
  }

  private static stepView(bundle: QaRunBundle, step: QaStep): QaStepView {
    const assetId = step.assetIds?.[0];
    const asset = assetId ? bundle.assets[assetId] : undefined;
    return {
      number: step.index,
      action: step.action,
      expected: step.expected,
      warning: step.warning ?? false,
      approximate: step.approximate ?? false,
      failure: step.failed
        ? QaWording.failed
        : step.checkFailed
          ? QaWording.checkFailed
          : undefined,
      screenshot: asset
        ? {
            asset,
            alt: `Step ${step.index}: ${InlineMarkup.toPlain(step.action)}`,
          }
        : undefined,
    };
  }

  private static sameSection(a: readonly string[], b: readonly string[]) {
    return a.length === b.length && a.every((title, i) => title === b[i]);
  }

  private static sharedLength(a: readonly string[], b: readonly string[]) {
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) {
      shared += 1;
    }
    return shared;
  }
}
