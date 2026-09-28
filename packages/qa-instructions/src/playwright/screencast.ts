import type { TraceEvent } from './trace-archive.js';

/** One frame of a page's screen recording. */
export type ScreencastFrame = {
  pageId?: string;
  /**
   * When the browser painted it, on the trace's clock. The frame shows the
   * page as it was up to a few milliseconds before this.
   */
  paintedAt: number;
  file: string;
};

/**
 * The page's screen recording, which every trace with screenshots on keeps.
 * Before 1.63 it is the only picture of the page there is.
 */
export class Screencast {
  private readonly frames: ScreencastFrame[] = [];

  /**
   * Adds a `screencast-frame` event. Its `timestamp` is when Playwright
   * received the frame; `frameSwapWallTime` is when the browser painted it,
   * on the wall clock, which `wallClockOffset` (the context's wall time
   * minus its trace time) converts. Without it, the time received stands in.
   */
  add(event: TraceEvent, wallClockOffset: number | undefined): void {
    const file =
      typeof event.file === 'string'
        ? event.file // version 9+: `screencast/<name>`
        : typeof event.sha1 === 'string'
          ? `resources/${event.sha1}` // version 8
          : undefined;
    const received = event.timestamp;
    if (file === undefined || typeof received !== 'number') return;
    const swap = event.frameSwapWallTime;
    const painted =
      typeof swap === 'number' && wallClockOffset !== undefined
        ? swap - wallClockOffset
        : received;
    this.frames.push({
      pageId: typeof event.pageId === 'string' ? event.pageId : undefined,
      // Never later than received: a clock mismatch must not make a frame
      // seem newer than it is.
      paintedAt: Math.min(painted, received),
      file,
    });
  }

  /** The last frame painted at or before `time`. */
  lastPaintedBy(
    pageId: string | undefined,
    time: number,
  ): ScreencastFrame | undefined {
    return this.pageFrames(pageId)
      .filter((frame) => frame.paintedAt <= time)
      .at(-1);
  }

  /** The last frame painted after `from` and before `to`. */
  lastPaintedBetween(
    pageId: string | undefined,
    from: number,
    to: number,
  ): ScreencastFrame | undefined {
    return this.pageFrames(pageId)
      .filter((frame) => frame.paintedAt > from && frame.paintedAt < to)
      .at(-1);
  }

  /** The page's first frame. */
  first(pageId: string | undefined): ScreencastFrame | undefined {
    return this.pageFrames(pageId)[0];
  }

  private pageFrames(pageId: string | undefined): ScreencastFrame[] {
    return this.frames
      .filter((frame) => pageId === undefined || frame.pageId === pageId)
      .sort((a, b) => a.paintedAt - b.paintedAt);
  }
}
