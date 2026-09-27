/**
 * Outbound port: where Step Screenshots come from.
 *
 * An adapter (the Playwright trace reader today) looks up what was captured
 * for an Action by the Action's `ref`. Nothing here may depend on a test
 * runner's or trace format's types.
 */
import type { QaBox, QaPoint, QaScreenshotMoment } from '../model.js';

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
};

export interface ScreenshotSource {
  /** What was captured for the Action with this ref, if anything. */
  capture(ref: string): ActionCapture | undefined;
}

/** A source with no screenshots: QA Instructions are text only. */
export class NoScreenshots implements ScreenshotSource {
  capture(): undefined {
    return undefined;
  }
}
