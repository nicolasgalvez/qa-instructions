/**
 * Inbound port: a runner-neutral stream of test events.
 *
 * Runner adapters (the Playwright reporter today, a Jest adapter later)
 * translate their own step data into these events. Nothing here may depend
 * on a test runner's types.
 */

/**
 * How the test identified an element. Roles, labels, and texts are terms a
 * tester can see; test ids and selectors are not, so a QA Step never shows
 * them and names the element from the page as recorded instead.
 */
export type ElementTarget =
  | { by: 'role'; role: string; name?: string }
  | {
      by: 'label' | 'text' | 'placeholder' | 'altText' | 'title';
      value: string;
    }
  | { by: 'testId'; value: string }
  | {
      by: 'selector';
      value: string;
      /** The tag the selector requires of the element, when it names one. */
      tag?: string;
      /** The `type` attribute the selector requires, e.g. `radio`. */
      type?: string;
    };

/** Things a person can do in a browser. */
export type UserActionKind =
  | 'navigate'
  | 'click'
  | 'doubleClick'
  | 'tap'
  | 'hover'
  | 'fill'
  | 'type'
  | 'clear'
  | 'press'
  | 'check'
  | 'uncheck'
  | 'select'
  | 'upload'
  | 'goBack'
  | 'goForward'
  | 'reload';

/**
 * Test plumbing a person cannot repeat by hand. Never an Action, though a
 * `script` or `dispatch` (an event fired by script, e.g. a synthetic click)
 * may change the page and so become a warning step.
 */
export type PlumbingKind =
  'wait' | 'script' | 'dispatch' | 'read' | 'request' | 'setup' | 'other';

export type ActionKind = UserActionKind | PlumbingKind;

export type TestStartEvent = {
  type: 'testStart';
  /** Stable identity of the test across attempts, when the runner has one. */
  id?: string;
  title: string;
  runner: 'playwright' | 'jest';
  file?: string;
  /** Tags the runner reports for the test, as written (e.g. `@smoke`). */
  tags?: string[];
  /** Line the test is declared on, to tell same-titled tests apart. */
  line?: number;
  project?: string;
  /** 1 for the first run of the test, higher for each retry. Default 1. */
  attempt?: number;
  /** Base URL that relative navigation URLs resolve against. */
  baseUrl?: string;
};

export type ActionEvent = {
  type: 'action';
  kind: ActionKind;
  target?: ElementTarget;
  /** Typed text, pressed key, chosen option, or dispatched event type. */
  value?: string;
  /** Navigation URL, possibly relative to the test's base URL. */
  url?: string;
  /** True when this Action is where the test failed. */
  failed?: boolean;
  /**
   * The runner pushed the Action past its usual checks (visible, stable,
   * not covered), e.g. Playwright's `force: true`.
   */
  forced?: boolean;
  /**
   * Whether the test used the call's result (assigned, awaited into an
   * expression, returned). Undefined when the runner cannot tell.
   */
  resultUsed?: boolean;
  /**
   * The runner adapter's own reference to this Action, opaque to the core.
   * The ScreenshotSource uses it to find the Action's Step Screenshot.
   */
  ref?: string;
};

/** A regular expression the checked text must match, e.g. `/login-error/`. */
export type ExpectedPattern = { source: string; flags: string };

export type CheckEvent = {
  type: 'check';
  /** Matcher name without negation, e.g. `toBeVisible`. */
  matcher: string;
  negated: boolean;
  /** What was checked: an element, the page itself, or a plain value. */
  subject: 'element' | 'page' | 'value';
  target?: ElementTarget;
  /** The expected value, when the runner reports one a person can read. */
  expected?: string;
  /** The pattern the checked text must match, when the check expects one. */
  expectedPattern?: ExpectedPattern;
  /**
   * The test author's own words for what is checked, e.g.
   * `cart line-item quantity` in Playwright's `expect(qty, 'cart line-item quantity')`.
   */
  description?: string;
  /** True when this check is where the test failed. */
  failed?: boolean;
  /**
   * A soft check: when it fails, the test goes on, e.g. Playwright's
   * `expect.soft`.
   */
  soft?: boolean;
  /**
   * The runner adapter's own reference to this check, opaque to the core.
   * The ScreenshotSource may know what the check checked by it.
   */
  ref?: string;
};

export type TestEndEvent = {
  type: 'testEnd';
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
};

/** The test opened a named group of its own (e.g. Playwright `test.step`). Groups nest. */
export type GroupStartEvent = {
  type: 'groupStart';
  title: string;
};

/** The innermost open group closed. */
export type GroupEndEvent = {
  type: 'groupEnd';
  title: string;
};

export type TestEvent =
  | TestStartEvent
  | ActionEvent
  | CheckEvent
  | GroupStartEvent
  | GroupEndEvent
  | TestEndEvent;

/** Anything that consumes the neutral test event stream. */
export interface TestEventSink {
  handle(event: TestEvent): void;
}
