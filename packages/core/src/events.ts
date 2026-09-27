/**
 * Inbound port: a runner-neutral stream of test events.
 *
 * Runner adapters (the Playwright reporter today, a Jest adapter later)
 * translate their own step data into these events. Nothing here may depend
 * on a test runner's types.
 */

/** How the test identified an element, in the terms a tester can see. */
export type ElementTarget =
  | { by: 'role'; role: string; name?: string }
  | {
      by:
        | 'label'
        | 'text'
        | 'placeholder'
        | 'altText'
        | 'title'
        | 'testId'
        | 'selector';
      value: string;
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

/** Test plumbing a person cannot repeat by hand. Never an Action. */
export type PlumbingKind =
  'wait' | 'script' | 'read' | 'request' | 'setup' | 'other';

export type ActionKind = UserActionKind | PlumbingKind;

export type TestStartEvent = {
  type: 'testStart';
  title: string;
  runner: 'playwright' | 'jest';
  file?: string;
  project?: string;
  /** Base URL that relative navigation URLs resolve against. */
  baseUrl?: string;
};

export type ActionEvent = {
  type: 'action';
  kind: ActionKind;
  target?: ElementTarget;
  /** Typed text, pressed key, or chosen option. */
  value?: string;
  /** Navigation URL, possibly relative to the test's base URL. */
  url?: string;
};

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
};

export type TestEndEvent = {
  type: 'testEnd';
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
};

export type TestEvent =
  TestStartEvent | ActionEvent | CheckEvent | TestEndEvent;

/** Anything that consumes the neutral test event stream. */
export interface TestEventSink {
  handle(event: TestEvent): void;
}
