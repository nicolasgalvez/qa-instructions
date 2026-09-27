import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import type {
  ActionEvent,
  CheckEvent,
  TestEvent,
  TestStartEvent,
} from '@qa-instructions/core';

import { ActionRefSequence } from './action-ref.js';
import { ACTION_KINDS } from './action-verbs.js';
import { CallSiteReader, type CheckSite } from './call-site-reader.js';
import { LocatorParser } from './locator-parser.js';
import { StepTitleParser } from './step-title.js';

/** Matchers whose subject is the page rather than an element. */
const PAGE_MATCHERS = new Set(['toHaveURL', 'toHaveTitle']);

/**
 * A check's title: `Expect "not toBeHidden"`. Playwright 1.53–1.54 write the
 * matcher alone (`not toBeHidden`); 1.57–1.62 add the locator after it
 * (`Expect "toBeVisible" getByText('Saved')`).
 */
const EXPECT_TITLE =
  /^(?:Expect "(?<not>not )?(?<matcher>[A-Za-z]+)"(?: (?<locator>.+))?|(?<bareNot>not )?(?<bareMatcher>to[A-Z][A-Za-z]*))$/;

/**
 * Playwright adapter for the core's inbound port: translates one test's
 * reporter steps into the neutral test event stream.
 *
 * Playwright 1.63+ reports each step's details as `subtitle` and `params`.
 * Earlier releases (1.53–1.62) report neither: a browser call's verb, value,
 * and locator are read from its title, and a check's subject and expected
 * value from the test's source at the check. What no version's step data
 * says (whether a call was forced, whether its result was used) is read from
 * the call site.
 */
export class PlaywrightStepTranslator {
  constructor(
    private readonly locators = new LocatorParser(),
    private readonly callSites = new CallSiteReader(),
    private readonly titles = new StepTitleParser(),
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
    const title = this.titles.parse(step.title);
    const navigate = title.verb === 'Navigate';
    const callSite = step.location
      ? this.callSites.read(step.location)
      : undefined;
    const forced = params.force === true || callSite?.forced === true;
    return {
      type: 'action',
      kind: ACTION_KINDS[title.verb] ?? 'other',
      target: this.locators.parse(this.locator(step) ?? title.locator),
      value:
        this.text(params.value ?? params.text ?? params.key ?? params.type) ??
        (navigate ? undefined : title.value),
      url:
        this.text(params.url) ??
        (navigate
          ? (step.subtitle ?? callSite?.literalArgument ?? title.value)
          : undefined),
      failed: this.failed(step),
      ...(forced ? { forced } : {}),
      ...(callSite ? { resultUsed: callSite.resultUsed } : {}),
      ref,
    };
  }

  private check(step: TestStep): CheckEvent | undefined {
    const match = EXPECT_TITLE.exec(step.title);
    if (!match) return undefined;

    const groups = match.groups ?? {};
    const not = groups.not ?? groups.bareNot;
    const matcher = groups.matcher ?? groups.bareMatcher;
    const site = this.checkSite(step);
    const target = this.locators.parse(
      this.locator(step) ?? groups.locator ?? site?.subject,
    );
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
      expected: this.text(this.params(step).expected) ?? site?.expected,
      failed: this.failed(step),
    };
  }

  /** Before 1.63 a check step has no params: its subject and expected value are in the source. */
  private checkSite(step: TestStep): CheckSite | undefined {
    return step.params === undefined && step.location
      ? this.callSites.readCheck(step.location)
      : undefined;
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
