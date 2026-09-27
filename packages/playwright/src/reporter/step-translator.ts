import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import type {
  ActionEvent,
  ActionKind,
  CheckEvent,
  TestEvent,
  TestStartEvent,
} from '@qa-instructions/core';

import { ActionRefSequence } from './action-ref.js';
import { CallSiteReader } from './call-site-reader.js';
import { LocatorParser } from './locator-parser.js';

/** Playwright `pw:api` step titles (the part before any quoted value) → neutral kinds. */
const ACTION_KINDS: Record<string, ActionKind> = {
  Navigate: 'navigate',
  Click: 'click',
  'Double click': 'doubleClick',
  Tap: 'tap',
  Hover: 'hover',
  Fill: 'fill',
  Type: 'type',
  Insert: 'type',
  Press: 'press',
  Check: 'check',
  Uncheck: 'uncheck',
  'Select option': 'select',
  'Set input files': 'upload',
  'Go back': 'goBack',
  'Go forward': 'goForward',
  Reload: 'reload',
  'Wait for timeout': 'wait',
  'Wait for selector': 'wait',
  'Wait for function': 'wait',
  'Wait for state': 'wait',
  'Wait for event': 'wait',
  'Wait for navigation': 'wait',
  'Wait for load state': 'wait',
  'Wait for URL': 'wait',
  Evaluate: 'script',
  'Add init script': 'script',
  'Add script tag': 'script',
  'Dispatch event': 'dispatch',
  Dispatch: 'dispatch',
  'Get text content': 'read',
  'Get inner text': 'read',
  'Get input value': 'read',
  'Get attribute': 'read',
  'Get HTML': 'read',
  'Get content': 'read',
  'Get page title': 'read',
  GET: 'request',
  POST: 'request',
  PUT: 'request',
  PATCH: 'request',
  DELETE: 'request',
  HEAD: 'request',
  'Launch browser': 'setup',
  'Create context': 'setup',
  'Create page': 'setup',
  'Close context': 'setup',
  'Close page': 'setup',
  'Close browser': 'setup',
};

/** Matchers whose subject is the page rather than an element. */
const PAGE_MATCHERS = new Set(['toHaveURL', 'toHaveTitle']);

const EXPECT_TITLE = /^Expect "(not )?([A-Za-z]+)"$/;

/**
 * Playwright adapter for the core's inbound port: translates one test's
 * reporter steps (Playwright 1.63 title, subtitle, params, category) into the
 * neutral test event stream. What the step data leaves out (whether a call
 * was forced, whether its result was used) is read from the call site.
 */
export class PlaywrightStepTranslator {
  constructor(
    private readonly locators = new LocatorParser(),
    private readonly callSites = new CallSiteReader(),
  ) {}

  translate(test: TestCase, result: TestResult): TestEvent[] {
    return [
      { ...this.testStart(test), attempt: result.retry + 1 },
      ...this.translateSteps(result.steps, new ActionRefSequence()),
      { type: 'testEnd', status: result.status },
    ];
  }

  testStart(test: TestCase): TestStartEvent {
    const project = test.parent.project();
    const baseURL = project?.use?.baseURL;

    return {
      type: 'testStart',
      id: test.id,
      title: test.title,
      runner: 'playwright',
      file: test.location.file,
      line: test.location.line,
      tags: [...test.tags],
      project: project?.name || undefined,
      baseUrl: typeof baseURL === 'string' ? baseURL : undefined,
    };
  }

  /** `refs` numbers every `pw:api` step in order, translated or not. */
  private translateSteps(
    steps: TestStep[],
    refs: ActionRefSequence,
  ): TestEvent[] {
    return steps.flatMap((step): TestEvent[] => {
      switch (step.category) {
        case 'pw:api': {
          const action = this.action(step, refs.next(step.title));
          this.skipCalls(step.steps, refs);
          return [action];
        }
        case 'expect': {
          this.skipCalls(step.steps, refs);
          const check = this.check(step);
          if (check) return [check];
          return this.failed(step) ? [this.failureMarker()] : [];
        }
        case 'test.step':
          return [
            { type: 'groupStart', title: step.title },
            ...this.innerSteps(step, refs),
            { type: 'groupEnd', title: step.title },
          ];
        default:
          // Hook and fixture steps wrap the calls a test makes, including
          // calls made inside helpers and user fixtures.
          return this.innerSteps(step, refs);
      }
    });
  }

  /** Numbers the `pw:api` calls inside a step that is not translated further. */
  private skipCalls(steps: TestStep[], refs: ActionRefSequence): void {
    for (const step of steps) {
      if (step.category === 'pw:api') refs.next(step.title);
      this.skipCalls(step.steps, refs);
    }
  }

  /**
   * A grouping step's calls, plus a failure marker when the step failed but
   * none of its calls or checks did (e.g. an error thrown in a `test.step`).
   */
  private innerSteps(step: TestStep, refs: ActionRefSequence): TestEvent[] {
    const events = this.translateSteps(step.steps, refs);
    const failedInside = events.some(
      (event) => 'failed' in event && event.failed,
    );
    return this.failed(step) && !failedInside
      ? [...events, this.failureMarker()]
      : events;
  }

  private failureMarker(): ActionEvent {
    return { type: 'action', kind: 'other', failed: true };
  }

  private action(step: TestStep, ref: string): ActionEvent {
    const params = this.params(step);
    const verb = step.title.split(' "')[0];
    const callSite = step.location
      ? this.callSites.read(step.location)
      : undefined;
    const forced = params.force === true || callSite?.forced === true;
    return {
      type: 'action',
      kind: ACTION_KINDS[verb] ?? 'other',
      target: this.locators.parse(this.locator(step)),
      value: this.text(
        params.value ?? params.text ?? params.key ?? params.type,
      ),
      url:
        this.text(params.url) ??
        (verb === 'Navigate' ? step.subtitle : undefined),
      failed: this.failed(step),
      ...(forced ? { forced } : {}),
      ...(callSite ? { resultUsed: callSite.resultUsed } : {}),
      ref,
    };
  }

  private check(step: TestStep): CheckEvent | undefined {
    const match = EXPECT_TITLE.exec(step.title);
    if (!match) return undefined;

    const [, not, matcher] = match;
    const target = this.locators.parse(this.locator(step));
    return {
      type: 'check',
      matcher,
      negated: Boolean(not),
      subject: target
        ? 'element'
        : PAGE_MATCHERS.has(matcher)
          ? 'page'
          : 'value',
      target,
      expected: this.text(this.params(step).expected),
      failed: this.failed(step),
    };
  }

  /** A browser call or check whose own error failed the test. */
  private failed(step: TestStep): true | undefined {
    return step.error ? true : undefined;
  }

  private locator(step: TestStep): string | undefined {
    return this.text(this.params(step).locator) ?? step.subtitle;
  }

  private params(step: TestStep): Record<string, unknown> {
    return step.params ?? {};
  }

  /** A value a person can read, or undefined for objects such as regexes. */
  private text(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      return value.join(', ');
    }
    return undefined;
  }
}
