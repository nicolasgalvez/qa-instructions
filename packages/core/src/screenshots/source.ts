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
