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

type PendingStep = {
  action: string;
  url?: string;
  expectedResults: string[];
};

/**
 * Consumes one test's neutral event stream and produces its QA Instructions:
 * a QA Step per user Action, with the checks that follow it as the step's
 * Expected Result. Test plumbing is dropped.
 */
export class QaInstructionsRecorder implements TestEventSink {
  private readonly steps: PendingStep[] = [];
  private start?: TestStartEvent;
  private end?: TestEndEvent;

  constructor(private readonly phraser: StepPhraser = new StepPhraser()) {}

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
      });
    }
    return builder.toBundle();
  }

  private onAction(event: ActionEvent): void {
    if (!this.isUserAction(event)) return;

    const url =
      event.kind === 'navigate' ? this.resolveUrl(event.url) : undefined;
    this.steps.push({
      action: this.phraser.action(event, url),
      url,
      expectedResults: [],
    });
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
