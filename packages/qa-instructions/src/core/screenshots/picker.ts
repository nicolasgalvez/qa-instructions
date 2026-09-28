import type { QaScreenshotMoment } from '../model.js';
import type { Screenshot } from './source.js';

/** Most faithful first: the moment of the Action, then its result, then the page before it. */
const PREFERENCE: readonly QaScreenshotMoment[] = ['action', 'after', 'before'];

/** Chooses the Step Screenshot for an Action from what was captured. */
export class StepScreenshotPicker {
  pick(screenshots: readonly Screenshot[]): Screenshot | undefined {
    for (const moment of PREFERENCE) {
      const screenshot = screenshots.find((s) => s.moment === moment);
      if (screenshot) return screenshot;
    }
    return undefined;
  }
}
