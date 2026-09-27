import type {
  ActionCapture,
  QaBox,
  QaPoint,
  QaScreenshotMoment,
  QaSize,
  ScreenshotSource,
} from '@qa-instructions/core';

import { ActionRef } from './action-ref.js';
import { SnapshotTarget } from './snapshot-target.js';
import { TraceArchive, type TraceEvent } from './trace-archive.js';

/**
 * Trace format versions this reader understands: 8 is written by Playwright
 * 1.53–1.62, 9 by 1.63, 10 by later releases. The format is not a
 * documented Playwright API, so anything else yields no screenshots rather
 * than wrong ones.
 */
const SUPPORTED_VERSIONS: ReadonlySet<unknown> = new Set([8, 9, 10]);

/** The test runner's own events; the other `.trace` files are the library's. */
const TEST_TRACE = 'test.trace';

const MOMENTS: ReadonlySet<unknown> = new Set<QaScreenshotMoment>([
  'action',
  'after',
  'before',
]);

/**
 * How old, in milliseconds, the last recorded frame may be at the moment of
 * an Action and still count as showing it. Around each Action, Playwright
 * lets the page send a new frame every 35ms, so a change made since then
 * may not have been recorded yet; an older frame may miss a scroll, a hover,
 * or an animation.
 */
const ACTION_FRAME_AGE = 50;

/** Why a trace gave no screenshots, when it was attached but could not be used. */
export type TraceProblem =
  | { kind: 'unsupportedVersion'; version: unknown }
  | { kind: 'unreadable'; reason: string };

type ImageRef = { moment: QaScreenshotMoment; file: string };

type CallRecord = {
  /** Per-action screen snapshots (`snapshots.screen`, Playwright 1.63+). */
  screenshots: ImageRef[];
  pageId?: string;
  startTime?: number;
  endTime?: number;
  box?: QaBox;
  point?: QaPoint;
  /** The DOM snapshot taken as the input was sent, which dates the Action. */
  inputSnapshot?: string;
  passwordField?: boolean;
  viewport?: QaSize;
};

/** One frame of a page's screen recording. */
type ScreencastFrame = { pageId?: string; timestamp: number; file: string };

/**
 * The page's screen recording, which every trace with screenshots on keeps.
 * Before 1.63 it is the only picture of the page there is.
 */
class Screencast {
  private readonly frames: ScreencastFrame[] = [];

  add(event: TraceEvent): void {
    const file =
      typeof event.file === 'string'
        ? event.file // version 9+: `screencast/<name>`
        : typeof event.sha1 === 'string'
          ? `resources/${event.sha1}` // version 8
          : undefined;
    if (file === undefined || typeof event.timestamp !== 'number') return;
    this.frames.push({
      pageId: typeof event.pageId === 'string' ? event.pageId : undefined,
      timestamp: event.timestamp,
      file,
    });
  }

  /**
   * The frame showing the page when a call ended: the last one painted by
   * then, or the first one after if none was painted yet.
   */
  frameAt(time: number, pageId: string | undefined): string | undefined {
    const frames = this.pageFrames(pageId);
    return (this.lastPaintedBy(frames, time) ?? frames[0])?.file;
  }

  /**
   * The frame showing the page at `time`: the last one painted by then, if
   * it was painted no more than `within` milliseconds earlier. A frame
   * painted after `time` is never used, since the Action may already have
   * changed the page.
   */
  frameShowing(
    time: number,
    pageId: string | undefined,
    within: number,
  ): string | undefined {
    const frame = this.lastPaintedBy(this.pageFrames(pageId), time);
    return frame && time - frame.timestamp <= within ? frame.file : undefined;
  }

  private pageFrames(pageId: string | undefined): ScreencastFrame[] {
    return this.frames
      .filter((frame) => pageId === undefined || frame.pageId === pageId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private lastPaintedBy(
    frames: ScreencastFrame[],
    time: number,
  ): ScreencastFrame | undefined {
    return frames.filter((frame) => frame.timestamp <= time).at(-1);
  }
}

/**
 * What the browser library recorded for each call: the per-action screen
 * snapshots, the element box and point of input actions, and when and on
 * which page the call ran, plus the link from the test runner's step ids to
 * library calls and the pages' screen recording. Each library trace file is
 * one browser context, whose options give the viewport of every call in it.
 */
class TraceCalls {
  readonly screencast = new Screencast();
  private readonly callByStep = new Map<string, string>();
  private readonly records = new Map<string, CallRecord>();
  /** When each DOM snapshot was taken, by snapshot name. */
  private readonly snapshotTimes = new Map<string, number>();
  private viewport?: QaSize;

  constructor(contexts: TraceEvent[][]) {
    for (const events of contexts) {
      this.viewport = undefined;
      for (const event of events) this.add(event);
    }
  }

  /** The library call made for a test runner step. */
  forStep(stepId: string): CallRecord | undefined {
    const callId = this.callByStep.get(stepId);
    return callId === undefined ? undefined : this.records.get(callId);
  }

  /**
   * When the call sent its input: the time of the DOM snapshot Playwright
   * takes just before (`input@<callId>`), on the same clock as the screen
   * recording. Unknown without DOM snapshots.
   */
  inputTime(record: CallRecord): number | undefined {
    return record.inputSnapshot === undefined
      ? undefined
      : this.snapshotTimes.get(record.inputSnapshot);
  }

  private add(event: TraceEvent): void {
    if (event.type === 'frame-snapshot') {
      this.addSnapshot(event.snapshot);
      return;
    }
    if (event.type === 'context-options') {
      const options = this.isRecord(event.options) ? event.options : {};
      this.viewport = this.size(options.viewport);
      return;
    }
    if (event.type === 'screencast-frame') {
      this.screencast.add(event);
      return;
    }
    const callId = event.callId;
    if (typeof callId !== 'string') return;

    switch (event.type) {
      case 'before':
        // Versions 8 and 9 link a call to its step through `stepId`;
        // version 10 uses the step id as the call id.
        this.callByStep.set(
          typeof event.stepId === 'string' ? event.stepId : callId,
          callId,
        );
        Object.assign(this.record(callId), {
          pageId: typeof event.pageId === 'string' ? event.pageId : undefined,
          startTime: this.number(event.startTime),
        });
        break;
      case 'after':
        this.record(callId).endTime = this.number(event.endTime);
        break;
      case 'input':
        Object.assign(this.record(callId), {
          box: this.box(event.box),
          point: this.point(event.point),
          inputSnapshot:
            typeof event.inputSnapshot === 'string'
              ? event.inputSnapshot
              : undefined,
        });
        break;
      case 'screenshot':
        if (MOMENTS.has(event.phase) && typeof event.file === 'string') {
          this.record(callId).screenshots.push({
            moment: event.phase as QaScreenshotMoment,
            file: event.file,
          });
        }
        break;
    }
  }

  /**
   * A DOM snapshot (`snapshots.dom`) marks the element the call touched, so
   * the page as recorded says whether it was a password field. Its time is
   * kept too: the input snapshot's time dates the Action.
   */
  private addSnapshot(snapshot: unknown): void {
    if (!this.isRecord(snapshot) || typeof snapshot.callId !== 'string') {
      return;
    }
    const { snapshotName, timestamp } = snapshot;
    if (
      typeof snapshotName === 'string' &&
      typeof timestamp === 'number' &&
      !this.snapshotTimes.has(snapshotName)
    ) {
      this.snapshotTimes.set(snapshotName, timestamp);
    }
    const record = this.record(snapshot.callId);
    if (record.passwordField !== undefined) return;
    const target = SnapshotTarget.find(snapshot.html);
    if (target) record.passwordField = target.isPasswordField;
  }

  private record(callId: string): CallRecord {
    let record = this.records.get(callId);
    if (!record) {
      record = { screenshots: [], viewport: this.viewport };
      this.records.set(callId, record);
    }
    return record;
  }

  private size(value: unknown): QaSize | undefined {
    if (!this.isRecord(value)) return undefined;
    const { width, height } = value;
    return typeof width === 'number' && typeof height === 'number'
      ? { width, height }
      : undefined;
  }

  private number(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  private box(value: unknown): QaBox | undefined {
    if (!this.isRecord(value)) return undefined;
    const { x, y, width, height } = value;
    return [x, y, width, height].every((n) => typeof n === 'number')
      ? ({ x, y, width, height } as QaBox)
      : undefined;
  }

  private point(value: unknown): QaPoint | undefined {
    if (!this.isRecord(value)) return undefined;
    const { x, y } = value;
    return typeof x === 'number' && typeof y === 'number'
      ? { x, y }
      : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}

/**
 * Screenshot-source adapter over a Playwright trace (`trace.zip`). Joins each
 * `pw:api` step in the test runner's trace to the library call it made, and
 * returns that call's screen snapshots (or, without them, a frame of the
 * screen recording), element box, and click point.
 * Never throws: an unreadable or unsupported trace gives no screenshots and
 * says why in `problem`.
 */
export class TraceScreenshotSource implements ScreenshotSource {
  private constructor(
    private readonly captures: ReadonlyMap<string, ActionCapture>,
    readonly problem?: TraceProblem,
  ) {}

  static empty(problem?: TraceProblem): TraceScreenshotSource {
    return new TraceScreenshotSource(new Map(), problem);
  }

  static async open(tracePath: string): Promise<TraceScreenshotSource> {
    try {
      return TraceScreenshotSource.read(await TraceArchive.open(tracePath));
    } catch (error) {
      return TraceScreenshotSource.empty({
        kind: 'unreadable',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  static read(archive: TraceArchive): TraceScreenshotSource {
    const eventFiles = archive.eventFiles();
    const testEvents = eventFiles.get(TEST_TRACE);
    if (!testEvents) {
      return TraceScreenshotSource.empty({
        kind: 'unreadable',
        reason: `no ${TEST_TRACE} in the trace`,
      });
    }
    const unsupported = TraceScreenshotSource.unsupportedVersion(eventFiles);
    if (unsupported !== undefined) {
      return TraceScreenshotSource.empty({
        kind: 'unsupportedVersion',
        version: unsupported.version,
      });
    }

    const calls = new TraceCalls(
      [...eventFiles]
        .filter(([name]) => name !== TEST_TRACE)
        .map(([, events]) => events),
    );
    const records = TraceScreenshotSource.actionSteps(testEvents).flatMap(
      ({ ref, stepId }) => {
        const record = calls.forStep(stepId);
        return record
          ? [{ ref, record, images: this.images(record, calls) }]
          : [];
      },
    );

    const wanted = new Set(
      records.flatMap(({ images }) => images.map((image) => image.file)),
    );
    const files = archive.files((name) => wanted.has(name));

    const captures = new Map<string, ActionCapture>();
    for (const { ref, record, images } of records) {
      captures.set(ref, {
        screenshots: images.flatMap(({ moment, file }) => {
          const data = files.get(file);
          return data
            ? [{ moment, contentType: this.contentType(file), data }]
            : [];
        }),
        box: record.box,
        point: record.point,
        passwordField: record.passwordField,
        viewport: record.viewport,
      });
    }
    return new TraceScreenshotSource(captures);
  }

  capture(ref: string): ActionCapture | undefined {
    return this.captures.get(ref);
  }

  /**
   * A call's per-action screenshots; without them (before 1.63, or without
   * `snapshots.screen`), a frame of the screen recording: the one showing
   * the moment of the Action when there is one, else the one from when the
   * call ended.
   */
  private static images(record: CallRecord, calls: TraceCalls): ImageRef[] {
    if (record.screenshots.length > 0) return record.screenshots;
    const action = this.actionFrame(record, calls);
    if (action) return [{ moment: 'action', file: action }];
    const time = record.endTime ?? record.startTime;
    const frame =
      time === undefined
        ? undefined
        : calls.screencast.frameAt(time, record.pageId);
    return frame ? [{ moment: 'after', file: frame }] : [];
  }

  /**
   * The recording's frame showing the page as an Action touched it, for an
   * Action with a point or box to mark there. One that touched no point
   * (a fill) keeps the frame from its end, which shows its result.
   */
  private static actionFrame(
    record: CallRecord,
    calls: TraceCalls,
  ): string | undefined {
    if (!record.point && !record.box) return undefined;
    const time = calls.inputTime(record);
    return time === undefined
      ? undefined
      : calls.screencast.frameShowing(time, record.pageId, ACTION_FRAME_AGE);
  }

  private static contentType(file: string): string {
    return /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png';
  }

  /** Every trace file declares its format version on its first line. */
  private static unsupportedVersion(
    eventFiles: Map<string, TraceEvent[]>,
  ): { version: unknown } | undefined {
    for (const events of eventFiles.values()) {
      for (const event of events) {
        if (
          event.type === 'context-options' &&
          !SUPPORTED_VERSIONS.has(event.version)
        ) {
          return { version: event.version };
        }
      }
    }
    return undefined;
  }

  /**
   * A `pw:api` step: its method names the category from Playwright 1.55;
   * 1.53–1.54 write every step's method as `step`, and only its call id
   * (`pw:api@<n>`) tells.
   */
  private static isApiCall(event: TraceEvent): boolean {
    return (
      typeof event.callId === 'string' &&
      (event.method === 'pw:api' ||
        (event.method === 'step' && event.callId.startsWith('pw:api@')))
    );
  }

  /**
   * The test's `pw:api` steps that reporters see, in the order they began,
   * with their refs. Steps in a group (getters, configuration fixtures) are
   * traced but never reported, so they are not numbered.
   */
  private static actionSteps(
    testEvents: TraceEvent[],
  ): { ref: string; stepId: string }[] {
    return testEvents
      .filter(
        (event) =>
          event.type === 'before' &&
          TraceScreenshotSource.isApiCall(event) &&
          event.group === undefined &&
          typeof event.title === 'string',
      )
      .map((event, i) => ({
        ref: ActionRef.of(i + 1, event.title as string),
        stepId: (event.stepId ?? event.callId) as string,
      }));
  }
}
