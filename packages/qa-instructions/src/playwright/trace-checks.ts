import type {
  CheckCapture,
  ExpectedPattern,
  RecordedElement,
} from '../core/index.js';

import { CheckRef } from './action-ref.js';
import { SelectorParser } from './selector-parser.js';
import type { TraceEvent } from './trace-archive.js';

/**
 * What the browser recorded for a check it ran (`Frame.expect`), and the
 * element it checked as its DOM snapshot recorded it.
 */
export type BrowserCheck = {
  selector?: string;
  expectedText?: unknown;
  element?: RecordedElement;
};

/**
 * The trace's value preview for anything that is not a string, number,
 * boolean, or array: it says nothing about the value.
 */
const OPAQUE_PREVIEW = 'Object';

/**
 * What a trace says each check checked, for the checks whose reporter step
 * does not (Playwright 1.53–1.62 report no step params). The test runner's
 * trace keeps each `expect` step's expected value as a preview, even one
 * the test computed (`toBeCloseTo(qty * price)`); the browser's own call
 * for a locator or page check keeps the selector of the element and the
 * expected text or pattern.
 */
export class TraceChecks {
  private readonly captures = new Map<string, CheckCapture>();

  constructor(
    testEvents: TraceEvent[],
    browserCheck: (stepId: string) => BrowserCheck | undefined,
    private readonly selectors = new SelectorParser(),
  ) {
    TraceChecks.checkSteps(testEvents).forEach((event, i) => {
      const stepId = (event.stepId ?? event.callId) as string;
      const capture = this.capture(event, browserCheck(stepId));
      if (capture) {
        this.captures.set(CheckRef.of(i + 1, event.title as string), capture);
      }
    });
  }

  check(ref: string): CheckCapture | undefined {
    return this.captures.get(ref);
  }

  private capture(
    event: TraceEvent,
    browser: BrowserCheck | undefined,
  ): CheckCapture | undefined {
    const target = this.selectors.parse(browser?.selector);
    const expected =
      this.expectedText(browser?.expectedText) ?? this.preview(event);
    const capture: CheckCapture = {
      ...(target ? { target } : {}),
      ...expected,
      ...(browser?.element ? { element: browser.element } : {}),
    };
    return Object.keys(capture).length > 0 ? capture : undefined;
  }

  /** A single expected text or pattern the browser matched against. */
  private expectedText(
    value: unknown,
  ): Pick<CheckCapture, 'expected' | 'expectedPattern'> | undefined {
    if (!Array.isArray(value) || value.length !== 1) return undefined;
    const [text] = value as Record<string, unknown>[];
    if (typeof text?.string === 'string') return { expected: text.string };
    if (typeof text?.regexSource === 'string') {
      const pattern: ExpectedPattern = {
        source: text.regexSource,
        flags: typeof text.regexFlags === 'string' ? text.regexFlags : '',
      };
      return { expectedPattern: pattern };
    }
    return undefined;
  }

  /** The expected value as the test runner previewed it, when readable. */
  private preview(
    event: TraceEvent,
  ): Pick<CheckCapture, 'expected'> | undefined {
    const params = event.params as Record<string, unknown> | undefined;
    const expected = params?.expected;
    return typeof expected === 'string' && expected !== OPAQUE_PREVIEW
      ? { expected }
      : undefined;
  }

  /**
   * The test's `expect` steps that reporters see, in the order they began.
   * 1.53–1.54 write every step's method as `step`, and only the call id
   * (`expect@<n>`) tells.
   */
  private static checkSteps(testEvents: TraceEvent[]): TraceEvent[] {
    return testEvents.filter(
      (event) =>
        event.type === 'before' &&
        typeof event.callId === 'string' &&
        (event.method === 'expect' ||
          (event.method === 'step' && event.callId.startsWith('expect@'))) &&
        event.group === undefined &&
        typeof event.title === 'string',
    );
  }
}
