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
import type { QaRunBundle } from '../model.js';
import { StepPhraser } from './phraser.js';

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
  /** Default `sections`. */
  sections?: SectionPresentation;
};

type PendingStep = {
  action: string;
  url?: string;
  section?: string[];
  expectedResults: string[];
};

/**
 * Consumes one test's neutral event stream and produces its QA Instructions:
 * a QA Step per user Action, with the checks that follow it as the step's
 * Expected Result, grouped into Sections by the test's own groups. Test
 * plumbing is dropped.
 */
export class QaInstructionsRecorder implements TestEventSink {
  private readonly steps: PendingStep[] = [];
  private readonly phraser: StepPhraser;
  private readonly presentation: SectionPresentation;
  /** Titles of the open groups, outermost first. */
  private readonly groups: string[] = [];
  /** The QA Step the open outermost group collapsed into, once it has one. */
  private collapsedStep?: PendingStep;
  private start?: TestStartEvent;
  private end?: TestEndEvent;

  constructor(options: QaInstructionsRecorderOptions = {}) {
    this.phraser = options.phraser ?? new StepPhraser();
    this.presentation = options.sections ?? 'sections';
  }

  handle(event: TestEvent): void {
    switch (event.type) {
      case 'testStart':
        this.start = event;
        break;
      case 'action':
        this.onAction(event);
        break;
      case 'check':
        this.onCheck(event);
        break;
      case 'groupStart':
        if (this.groups.length === 0) this.collapsedStep = undefined;
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

  toBundle(): QaRunBundle {
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
      !this.end || this.end.status === 'passed' ? 'complete' : 'failed',
    );

    for (const step of this.steps) {
      builder.addStep({
        action: step.action,
        url: step.url,
        expected: this.expectedResult(step.expectedResults),
        section: step.section,
      });
    }
    return builder.toBundle();
  }

  private onAction(event: ActionEvent): void {
    if (!this.isUserAction(event)) return;

    const url =
      event.kind === 'navigate' ? this.resolveUrl(event.url) : undefined;
    if (this.presentation === 'collapse' && this.groups.length > 0) {
      this.collapseInto(this.groups[0], url);
      return;
    }
    this.steps.push({
      action: this.phraser.action(event, url),
      url,
      section: this.currentSection(),
      expectedResults: [],
    });
  }

  /** Folds an Action into the one QA Step named after its outermost group. */
  private collapseInto(title: string, url: string | undefined): void {
    if (!this.collapsedStep) {
      this.collapsedStep = { action: title, expectedResults: [] };
      this.steps.push(this.collapsedStep);
    }
    this.collapsedStep.url ??= url;
  }

  private currentSection(): string[] | undefined {
    if (this.presentation !== 'sections' || this.groups.length === 0) {
      return undefined;
    }
    return [...this.groups];
  }

  private onCheck(event: CheckEvent): void {
    const current = this.steps.at(-1);
    if (!current) return;

    const phrase = this.phraser.check(event);
    if (phrase) current.expectedResults.push(phrase);
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

  private expectedResult(phrases: string[]): string | undefined {
    if (phrases.length === 0) return undefined;
    const joined = phrases.join('; ');
    return joined.charAt(0).toUpperCase() + joined.slice(1);
  }
}
