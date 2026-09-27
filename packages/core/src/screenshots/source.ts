/**
 * Outbound port: where Step Screenshots come from.
 *
 * An adapter (the Playwright trace reader today) looks up what was captured
 * for an Action by the Action's `ref`. Nothing here may depend on a test
 * runner's or trace format's types.
 */
import type { ElementTarget, ExpectedPattern } from '../events.js';
import type { QaBox, QaPoint, QaScreenshotMoment, QaSize } from '../model.js';

export type Screenshot = {
  moment: QaScreenshotMoment;
  contentType: string;
  data: Buffer;
};

/**
 * An element as the page showed it when the test touched it, read from a
 * recording of the page rather than from the test code.
 */
export type RecordedElement = {
  /** Lowercase tag name, e.g. `button`. */
  tag: string;
  /** Its attributes as recorded, e.g. `type`, `role`, `aria-label`, `value`. */
  attributes: Record<string, string>;
  /** The text inside it a person can see, whitespace collapsed. */
  text: string;
  /**
   * The text of what labels it: the elements its `aria-labelledby` names, or
   * a `<label>` for it or around it.
   */
  labels: string[];
  /**
   * How many elements on the page looked like it (same kind, same visible
   * words), itself included. More than one means its name alone does not
   * tell a tester which one.
   */
  lookalikes?: number;
  /** The part of the page it sits in, as the page showed it. */
  region?: RecordedRegion;
};

/**
 * A part of the page an element sits in, e.g. one product's form among
 * several: the part the test narrowed its search to, or else the nearest
 * titled part that holds no lookalike of the element.
 */
export type RecordedRegion = {
  /** Lowercase tag name, e.g. `form`. */
  tag: string;
  /** Its attributes as recorded, e.g. `role`. */
  attributes: Record<string, string>;
  /**
   * What the page titles it: its label, or the heading, legend, or caption
   * inside it or just before it. Undefined when it has none.
   */
  title?: string;
  /** The test found the element inside this part (e.g. `form.locator(…)`). */
  scope: boolean;
};

/** What was captured for one Action. Any part may be missing. */
export type ActionCapture = {
  /** The page around the Action, at each moment that was captured. */
  screenshots: Screenshot[];
  /** The element the Action touched, in viewport CSS pixels. */
  box?: QaBox;
  /** Where the Action clicked or tapped, in viewport CSS pixels. */
  point?: QaPoint;
  /**
   * Whether the element the Action touched was a password field, as the page
   * was recorded (not as the test code suggests). Undefined when unknown.
   */
  passwordField?: boolean;
  /** The element the Action touched, as the page was recorded. */
  element?: RecordedElement;
  /** The page's viewport when the screenshots were taken, in CSS pixels. */
  viewport?: QaSize;
};

/**
 * What was recorded for one check (e.g. in a trace): the element it
 * checked and the value it expected. Fills in what the runner's own step
 * data did not say. Any part may be missing.
 */
export type CheckCapture = {
  target?: ElementTarget;
  expected?: string;
  expectedPattern?: ExpectedPattern;
  /** The element the check looked at, as the page was recorded. */
  element?: RecordedElement;
};

export interface ScreenshotSource {
  /** What was captured for the Action with this ref, if anything. */
  capture(ref: string): ActionCapture | undefined;
  /** What was recorded for the check with this ref, if anything. */
  check?(ref: string): CheckCapture | undefined;
}

/** A source with no screenshots: QA Instructions are text only. */
export class NoScreenshots implements ScreenshotSource {
  capture(): undefined {
    return undefined;
  }

  check(): undefined {
    return undefined;
  }
}
