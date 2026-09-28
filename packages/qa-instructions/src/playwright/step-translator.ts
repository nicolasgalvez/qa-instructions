import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import type {
  ActionEvent,
  CheckEvent,
  ElementTarget,
  TestEvent,
  TestStartEvent,
} from '../core/index.js';

import { StepRefs } from './action-ref.js';
import { ACTION_KINDS } from './action-verbs.js';
import { CallSiteReader, type CheckSite } from './call-site-reader.js';
import { LocatorParser } from './locator-parser.js';
import { StepTitleParser } from './step-title.js';

/** Matchers whose subject is the page rather than an element. */
const PAGE_MATCHERS = new Set(['toHaveURL', 'toHaveTitle']);

/**
 * Matchers Playwright only has for locators, so their subject is an element
 * even when the source names it by a variable (`expect(form).toBeVisible()`).
 */
const LOCATOR_MATCHERS = new Set([
  'toBeAttached',
  'toBeChecked',
  'toBeDisabled',
  'toBeEditable',
  'toBeEmpty',
  'toBeEnabled',
  'toBeFocused',
  'toBeHidden',
  'toBeInViewport',
  'toBeVisible',
  'toContainClass',
  'toContainText',
  'toHaveAccessibleDescription',
  'toHaveAccessibleErrorMessage',
  'toHaveAccessibleName',
  'toHaveAttribute',
  'toHaveClass',
  'toHaveCount',
  'toHaveCSS',
  'toHaveId',
  'toHaveJSProperty',
  'toHaveRole',
  'toHaveText',
  'toHaveValue',
  'toHaveValues',
  'toMatchAriaSnapshot',
]);

/**
 * A check's title: `Expect "not toBeHidden"`, or `Expect "soft toBeHidden"`
 * for an `expect.soft` check. Playwright 1.53–1.54 write the matcher alone
 * (`not toBeHidden`); 1.57–1.62 add the locator after it
 * (`Expect "toBeVisible" getByText('Saved')`).
 */
const EXPECT_TITLE =
  /^(?:Expect "(?<soft>soft )?(?<not>not )?(?<matcher>[A-Za-z]+)"(?: (?<locator>.+))?|(?<bareSoft>soft )?(?<bareNot>not )?(?<bareMatcher>to[A-Z][A-Za-z]*))$/;

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
      ...this.translateSteps(result.steps, new StepRefs()),
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

  /** `refs` numbers every `pw:api` and `expect` step in order, translated or not. */
  private translateSteps(steps: TestStep[], refs: StepRefs): TestEvent[] {
    return steps.flatMap((step): TestEvent[] => {
      switch (step.category) {
        case 'pw:api': {
          const action = this.action(step, refs.actions.next(step.title));
          this.skipCalls(step.steps, refs);
          return [action];
        }
        case 'expect': {
          const ref = refs.checks.next(step.title);
          this.skipCalls(step.steps, refs);
          const check = this.check(step, ref);
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

  /** Numbers the calls and checks inside a step that is not translated further. */
  private skipCalls(steps: TestStep[], refs: StepRefs): void {
    for (const step of steps) {
      if (step.category === 'pw:api') refs.actions.next(step.title);
      if (step.category === 'expect') refs.checks.next(step.title);
      this.skipCalls(step.steps, refs);
    }
  }

  /**
   * A grouping step's calls, plus a failure marker when the step failed but
   * none of its calls or checks did (e.g. an error thrown in a `test.step`).
   */
  private innerSteps(step: TestStep, refs: StepRefs): TestEvent[] {
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

  /**
   * A check step. Its title names the matcher (`Expect "toBeVisible"`),
   * unless the test gave the check a message (`expect(qty, 'cart
   * quantity')`): then the title is that message, and the matcher is read
   * from the source.
   */
  private check(step: TestStep, ref: string): CheckEvent | undefined {
    const titled = this.titledCheck(step.title);
    const site = this.checkSite(step, titled === undefined);
    const matcher = titled?.matcher ?? site?.matcher;
    if (!matcher) return undefined;

    const target = this.locators.parse(
      this.locator(step) ?? titled?.locator ?? site?.subject,
    );
    const soft = titled?.soft || site?.soft;
    return {
      type: 'check',
      matcher,
      negated: titled?.negated ?? site?.negated ?? false,
      subject: this.checkSubject(matcher, target),
      target,
      expected: this.text(this.params(step).expected) ?? site?.expected,
      ...(titled ? {} : { description: step.title }),
      failed: this.failed(step),
      ...(soft ? { soft } : {}),
      ref,
    };
  }

  /** The matcher, negation, softness, and locator a check's title names, if it names them. */
  private titledCheck(title: string):
    | {
        matcher: string;
        negated: boolean;
        soft: boolean;
        locator?: string;
      }
    | undefined {
    const groups = EXPECT_TITLE.exec(title)?.groups;
    if (!groups) return undefined;
    return {
      matcher: groups.matcher ?? groups.bareMatcher,
      negated: Boolean(groups.not ?? groups.bareNot),
      soft: Boolean(groups.soft ?? groups.bareSoft),
      locator: groups.locator,
    };
  }

  private checkSubject(
    matcher: string,
    target: ElementTarget | undefined,
  ): CheckEvent['subject'] {
    if (target) return 'element';
    if (PAGE_MATCHERS.has(matcher)) return 'page';
    return LOCATOR_MATCHERS.has(matcher) ? 'element' : 'value';
  }

  /**
   * The check as written in the source: read before 1.63, whose check steps
   * have no params, and for a check titled with its message, whose matcher
   * only the source names.
   */
  private checkSite(
    step: TestStep,
    messageTitled: boolean,
  ): CheckSite | undefined {
    const needed = step.params === undefined || messageTitled;
    return needed && step.location
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
