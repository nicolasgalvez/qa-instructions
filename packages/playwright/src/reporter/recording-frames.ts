import type { PageStates } from './page-states.js';
import type { Screencast, ScreencastFrame } from './screencast.js';

/**
 * How long, in milliseconds, a change to the page can take to reach a
 * painted frame of the screen recording. In Playwright 1.56 runs a frame
 * painted up to 15ms after a scroll or a fill had been recorded could still
 * show the page from before it; the margin covers slower machines.
 */
const PAINT_LAG = 50;

/**
 * How old, in milliseconds, the last painted frame may be at the moment of
 * an Action and still count as showing it, when the page changed too
 * recently to know that from its DOM snapshots. Around each Action,
 * Playwright lets the page send a new frame every 35ms, so a change made
 * since then may not have been recorded yet; an older frame may miss a
 * hover or an animation.
 */
const ACTION_FRAME_AGE = 50;

/** One library call, as far as choosing its screen recording frame goes. */
export type RecordedCall = {
  pageId?: string;
  startTime?: number;
  endTime?: number;
  /** The DOM snapshot taken just before the input was sent. */
  inputSnapshot?: string;
  /** When that snapshot was taken, which dates the Action. */
  inputTime?: number;
  /** Whether the call touched a point or element to mark (a click, not a fill). */
  marks: boolean;
  /**
   * When the next call on the page may first have changed it, or
   * `Infinity` if none did.
   */
  nextChange: number;
};

/**
 * Chooses the screen recording frame for a call without a per-action
 * screenshot (before Playwright 1.63). The recording is not a clock-driven
 * video: Playwright takes a frame only when the page repaints and it has
 * acknowledged the last one, and a painted frame can predate a change made
 * just before it. So a frame is used for a moment only when its paint time
 * and the page's DOM snapshots show it can picture that moment.
 */
export class RecordingFrames {
  constructor(
    private readonly screencast: Screencast,
    private readonly pages: PageStates,
  ) {}

  /**
   * The frame showing the page at the moment of the Action, to mark: the
   * last one painted by the time the input was sent (a later one may already
   * show the Action's effect), provided it shows the page scrolled as it
   * was then. That needs the page's scroll offsets to have been recorded at
   * least PAINT_LAG before the frame was painted, so a click Playwright
   * scrolled to just before sending it gets no frame. The frame must also be
   * recent, or else painted at least PAINT_LAG after the page's DOM last
   * changed before the input, so it pictures the page the click met.
   */
  atAction(call: RecordedCall): ScreencastFrame | undefined {
    const { pageId, inputSnapshot, inputTime } = call;
    if (!call.marks || inputSnapshot === undefined || inputTime === undefined) {
      return undefined;
    }
    const frame = this.screencast.lastPaintedBy(pageId, inputTime);
    if (!frame) return undefined;
    const shows = (since: number | undefined) =>
      since !== undefined && since + PAINT_LAG <= frame.paintedAt;

    if (shows(this.pages.unchangedSince(pageId, inputSnapshot))) return frame;
    const recent = inputTime - frame.paintedAt <= ACTION_FRAME_AGE;
    return recent && shows(this.pages.scrollSince(pageId, inputSnapshot))
      ? frame
      : undefined;
  }

  /**
   * The frame showing the page once the call was done, painted after it
   * ended and before the next call began to change the page: the first one
   * painted PAINT_LAG or more after its end, which is sure to show its
   * result, else the last one painted after its end. Without either, the
   * last one painted by its end, or the page's first frame.
   */
  afterAction(call: RecordedCall): ScreencastFrame | undefined {
    const { pageId, nextChange } = call;
    const end = call.endTime ?? call.startTime;
    if (end === undefined) return undefined;
    return (
      this.screencast.firstPaintedBetween(
        pageId,
        end + PAINT_LAG,
        nextChange,
      ) ??
      this.screencast.lastPaintedBetween(pageId, end, nextChange) ??
      this.screencast.lastPaintedBy(pageId, end) ??
      this.screencast.first(pageId)
    );
  }
}
