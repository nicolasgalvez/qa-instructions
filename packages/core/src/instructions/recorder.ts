import { createBundleBuilder } from '../bundle/builder.js';
import type {
  ActionEvent,
  ActionKind,
  CheckEvent,
  TestEndEvent,
  TestEvent,
  TestEventSink,
  TestStartEvent,
  UserActionKind,
} from '../events.js';
import type { QaAssetInput, QaRunBundle, QaStepInput } from '../model.js';
import { StepScreenshotPicker } from '../screenshots/picker.js';
import {
  NoScreenshots,
  type ActionCapture,
  type Screenshot,
  type ScreenshotSource,
} from '../screenshots/source.js';
import { StepPhraser } from './phraser.js';
import { ScriptChangeRule } from './script-change-rule.js';
import { SecretMasker } from './secret-masker.js';

const USER_ACTIONS: ReadonlySet<ActionKind> = new Set<UserActionKind>([
  'navigate',
  'click',
  'doubleClick',
  'tap',
  'hover',
  'fill',
  'type',
  'clear',
  'press',
  'check',
  'uncheck',
  'select',
  'upload',
  'goBack',
  'goForward',
  'reload',
]);

/**
 * How the test's own groups (e.g. Playwright `test.step`) are presented:
 * - `sections`: each group's title is a Section heading over its QA Steps.
 * - `collapse`: each outermost group becomes one QA Step named after it.
 * - `ignore`: groups are dropped and QA Steps are listed flat.
 */
export type SectionPresentation = 'sections' | 'collapse' | 'ignore';

export type QaInstructionsRecorderOptions = {
  phraser?: StepPhraser;
  scriptChanges?: ScriptChangeRule;
  /** Default `sections`. */
  sections?: SectionPresentation;
  picker?: StepScreenshotPicker;
  /**
   * Masks configured secrets. Values typed into password fields are always
   * masked as well. Default: password fields only.
   */
  masker?: SecretMasker;
};

/** QA Instructions plus the Step Screenshots their bundle refers to. */
export type QaRecording = {
  bundle: QaRunBundle;
  assets: QaAssetInput[];
};

const FILE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

type UserActionEvent = ActionEvent & { kind: UserActionKind };

/** Actions whose value is text the test typed into a field. */
const TYPING: ReadonlySet<ActionKind> = new Set<UserActionKind>([
  'fill',
  'type',
]);

type PendingStep = {
  /**
   * The step's words, or the Action it describes (a user Action, or for a
   * warning step the script), phrased once the screenshot source says what
   * the Action touched on the page.
   */
  action: string | ActionEvent;
  url?: string;
  section?: string[];
  /**
   * The checks that follow the Action, phrased as its Expected Result once
   * the screenshot source has filled in what they checked.
   */
  checks: CheckEvent[];
  failed?: boolean;
  /**
   * A script that may have changed the page: a warning step, unless what was
   * recorded of the page says it changed nothing.
   */
  warning?: boolean;
  approximate?: boolean;
  /** The Action's ref, for its Step Screenshot. */
  ref?: string;
  /**
   * For a collapsed group's step started after a warning step: the group's
   * earlier step, which it continues if the warning steps between them go.
   */
  resumes?: PendingStep;
};

/**
 * Consumes one test's neutral event stream and produces its QA Instructions:
 * a QA Step per user Action, with the checks that follow it as the step's
 * Expected Result, grouped into Sections by the test's own groups. Test
 * plumbing is dropped, except a script that changed the page, which becomes
 * a warning step. Forced Actions are approximate. Whether a script changed
 * the page, and whether an Action was forced, is decided once the screenshot
 * source says what was recorded of the call (see ScriptChangeRule).
 *
 * A test that does not pass yields incomplete QA Instructions: the QA Steps
 * stop at the first failed Action or check, and the step it belongs to is
 * marked as the failing step.
 *
 * Given a screenshot source, each QA Step also gets the Step Screenshot of
 * its Action, and the element box and click point where known.
 *
 * Secrets never reach the bundle: text typed into a field the screenshot
 * source saw was a password field is masked everywhere it appears (the step
 * tells the tester to type their password), as is anything matching the
 * masker's configured patterns.
 */
export class QaInstructionsRecorder implements TestEventSink {
  private readonly steps: PendingStep[] = [];
  private readonly phraser: StepPhraser;
  private readonly scriptChanges: ScriptChangeRule;
  private readonly picker: StepScreenshotPicker;
  private readonly presentation: SectionPresentation;
  private readonly masker: SecretMasker;
  /** Text the test typed into fields, by the ref of the Action that typed it. */
  private readonly typed: { ref: string; value: string }[] = [];
  /** Titles of the open groups, outermost first. */
  private readonly groups: string[] = [];
  /** The QA Step the open outermost group collapsed into, once it has one. */
  private collapsedStep?: PendingStep;
  /** The open outermost group's QA Step that a warning step interrupted. */
  private interruptedStep?: PendingStep;
  private start?: TestStartEvent;
  private end?: TestEndEvent;
  private stopped = false;

  constructor(options: QaInstructionsRecorderOptions = {}) {
    this.phraser = options.phraser ?? new StepPhraser();
    this.scriptChanges = options.scriptChanges ?? new ScriptChangeRule();
    this.presentation = options.sections ?? 'sections';
    this.picker = options.picker ?? new StepScreenshotPicker();
    this.masker = options.masker ?? new SecretMasker();
  }

  /** Which attempt of the test this recorder saw; 1 unless retried. */
  get attempt(): number {
    return this.start?.attempt ?? 1;
  }

  handle(event: TestEvent): void {
    switch (event.type) {
      case 'testStart':
        this.start = event;
        break;
      case 'action':
        if (!this.stopped) this.onAction(event);
        this.stopAt(event);
        break;
      case 'check':
        if (!this.stopped) this.onCheck(event);
        this.stopAt(event);
        break;
      case 'groupStart':
        if (this.groups.length === 0) {
          this.collapsedStep = undefined;
          this.interruptedStep = undefined;
        }
        this.groups.push(event.title);
        break;
      case 'groupEnd':
        this.groups.pop();
        break;
      case 'testEnd':
        this.end = event;
        break;
      default: {
        const exhaustive: never = event;
        throw new Error(`Unknown test event: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  /** The QA Instructions as text only. */
  toBundle(): QaRunBundle {
    return this.toRecording().bundle;
  }

  /** The QA Instructions with Step Screenshots from `screenshots`. */
  toRecording(
    screenshots: ScreenshotSource = new NoScreenshots(),
  ): QaRecording {
    const builder = createBundleBuilder();
    const title = this.start?.title ?? '';
    builder.guide({ title });
    if (this.start) {
      builder.setSource({
        runner: this.start.runner,
        testFile: this.start.file,
        testTitle: title,
        project: this.start.project,
      });
    }
    builder.setStatus(
      !this.end || this.end.status === 'passed' ? 'complete' : 'incomplete',
    );

    this.resolvedSteps(screenshots).forEach(({ step, capture }, i) => {
      const screenshot = this.picker.pick(capture?.screenshots ?? []);
      const asset = screenshot && this.screenshotAsset(i + 1, screenshot);
      if (asset) builder.addAsset(asset);
      const checks = this.seenChecks(step.checks, screenshots);
      builder.addStep({
        action: this.phrase(step, capture),
        url: step.url,
        expected: this.expectedResult(checks.map(({ phrase }) => phrase)),
        section: step.section,
        failed:
          step.failed ?? (checks.some(({ failed }) => failed) || undefined),
        warning: step.warning,
        approximate: step.approximate,
        ...this.captureFields(capture, screenshot, asset),
      });
    });
    const masker = this.masker.withValues(this.passwords(screenshots));
    return {
      bundle: masker.maskBundle(builder.toBundle()),
      assets: builder.pendingAssets(),
    };
  }

  /**
   * The QA Steps as the screenshot source's recording decides them: a
   * warning step stays only if its script changed the page, and hands its
   * checks to the step before it otherwise; a collapsed group's step it no
   * longer interrupts joins the group's earlier step; an Action the
   * recording says was forced is approximate. The pending steps are left
   * as they are.
   */
  private resolvedSteps(
    screenshots: ScreenshotSource,
  ): { step: PendingStep; capture?: ActionCapture }[] {
    const kept: { step: PendingStep; capture?: ActionCapture }[] = [];
    const copies = new Map<PendingStep, PendingStep>();
    for (const pending of this.steps) {
      const capture =
        pending.ref === undefined
          ? undefined
          : screenshots.capture(pending.ref);
      const previous = kept.at(-1)?.step;
      if (
        pending.warning &&
        !this.scriptChanges.changesPage(pending.action as ActionEvent, capture)
      ) {
        previous?.checks.push(...pending.checks);
        continue;
      }
      if (
        pending.resumes &&
        previous &&
        previous === copies.get(pending.resumes)
      ) {
        previous.url ??= pending.url;
        if (pending.failed) previous.failed = true;
        previous.checks.push(...pending.checks);
        continue;
      }
      const step = { ...pending, checks: [...pending.checks] };
      if (typeof step.action !== 'string' && !step.warning) {
        step.approximate = capture?.forced ?? step.approximate;
      }
      copies.set(pending, step);
      kept.push({ step, capture });
    }
    return kept;
  }

  /** What the test typed into fields the screenshot source saw were password fields. */
  private passwords(screenshots: ScreenshotSource): string[] {
    return this.typed
      .filter(({ ref }) => screenshots.capture(ref)?.passwordField === true)
      .map(({ value }) => value);
  }

  private phrase(step: PendingStep, capture: ActionCapture | undefined) {
    if (typeof step.action === 'string') return step.action;
    const recorded = { element: capture?.element };
    if (step.warning) {
      return this.phraser.scriptChange(step.action, {
        ...recorded,
        sections: capture?.sectionChanges,
      });
    }
    return this.phraser.action(step.action as UserActionEvent, step.url, {
      ...recorded,
      password: capture?.passwordField === true,
    });
  }

  /** Nothing after the first failure is a QA Step: the tester stops there. */
  private stopAt(event: ActionEvent | CheckEvent): void {
    if (event.failed) this.stopped = true;
  }

  private onAction(event: ActionEvent): void {
    if (!this.isUserAction(event)) {
      if (this.scriptChanges.mayChangePage(event)) this.warn(event);
      return;
    }

    if (TYPING.has(event.kind) && event.value && event.ref !== undefined) {
      this.typed.push({ ref: event.ref, value: event.value });
    }
    const url =
      event.kind === 'navigate' ? this.resolveUrl(event.url) : undefined;
    if (this.presentation === 'collapse' && this.groups.length > 0) {
      this.collapseInto(this.groups[0], url, event);
      return;
    }
    this.steps.push({
      action: event,
      url,
      section: this.currentSection(),
      checks: [],
      failed: event.failed,
      approximate: event.forced === true,
      ref: event.ref,
    });
  }

  /**
   * Adds a warning step where the test changed the page by script. It is
   * never folded into a collapsed group: the group's later Actions start a
   * new step after it, so the order stays true. Its screenshot shows the
   * page the script left.
   */
  private warn(event: ActionEvent): void {
    this.interruptedStep = this.collapsedStep ?? this.interruptedStep;
    this.collapsedStep = undefined;
    this.steps.push({
      action: event,
      section: this.currentSection(),
      checks: [],
      warning: true,
      ref: event.ref,
    });
  }

  /**
   * Folds an Action into the one QA Step named after its outermost group.
   * The step's screenshot is the group's first Action.
   */
  private collapseInto(
    title: string,
    url: string | undefined,
    event: ActionEvent,
  ): void {
    if (!this.collapsedStep) {
      this.collapsedStep = {
        action: title,
        checks: [],
        resumes: this.interruptedStep,
      };
      this.interruptedStep = undefined;
      this.steps.push(this.collapsedStep);
    }
    this.collapsedStep.url ??= url;
    this.collapsedStep.ref ??= event.ref;
    if (event.failed) this.collapsedStep.failed = true;
  }

  private currentSection(): string[] | undefined {
    if (this.presentation !== 'sections' || this.groups.length === 0) {
      return undefined;
    }
    return [...this.groups];
  }

  private onCheck(event: CheckEvent): void {
    this.steps.at(-1)?.checks.push(event);
  }

  /**
   * The checks a tester can see, phrased, after filling in from the source
   * what the runner did not report (the element checked, the value
   * expected). What the runner reported wins.
   */
  private seenChecks(
    checks: CheckEvent[],
    source: ScreenshotSource,
  ): { phrase: string; failed?: boolean }[] {
    return checks.flatMap((event) => {
      const element =
        event.ref === undefined
          ? undefined
          : source.check?.(event.ref)?.element;
      const phrase = this.phraser.check(this.completed(event, source), {
        element,
      });
      return phrase ? [{ phrase, failed: event.failed }] : [];
    });
  }

  private completed(event: CheckEvent, source: ScreenshotSource): CheckEvent {
    const recorded =
      event.ref === undefined ? undefined : source.check?.(event.ref);
    if (!recorded) return event;
    const expectsSomething =
      event.expected !== undefined || event.expectedPattern !== undefined;
    return {
      ...event,
      target: event.target ?? recorded.target,
      ...(expectsSomething
        ? {}
        : {
            expected: recorded.expected,
            expectedPattern: recorded.expectedPattern,
          }),
    };
  }

  private isUserAction(
    event: ActionEvent,
  ): event is ActionEvent & { kind: UserActionKind } {
    return USER_ACTIONS.has(event.kind);
  }

  private resolveUrl(url: string | undefined): string | undefined {
    if (url === undefined) return undefined;
    try {
      return new URL(url, this.start?.baseUrl).href;
    } catch {
      return url;
    }
  }

  private screenshotAsset(
    stepIndex: number,
    screenshot: Screenshot,
  ): QaAssetInput {
    const id = `step-${String(stepIndex).padStart(2, '0')}`;
    const extension = FILE_EXTENSIONS[screenshot.contentType] ?? 'bin';
    return {
      id,
      contentType: screenshot.contentType,
      filename: `${id}.${extension}`,
      data: screenshot.data,
    };
  }

  private captureFields(
    capture: ActionCapture | undefined,
    screenshot: Screenshot | undefined,
    asset: QaAssetInput | undefined,
  ): Partial<QaStepInput> {
    return {
      assetIds: asset && [asset.id],
      screenshotMoment: screenshot?.moment,
      elementBox: capture?.box,
      clickPoint: capture?.point,
      viewport: screenshot && capture?.viewport,
    };
  }

  private expectedResult(phrases: string[]): string | undefined {
    if (phrases.length === 0) return undefined;
    const joined = phrases.join('; ');
    return joined.charAt(0).toUpperCase() + joined.slice(1);
  }
}
