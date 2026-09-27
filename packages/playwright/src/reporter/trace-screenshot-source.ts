import type {
  ActionCapture,
  CheckCapture,
  QaBox,
  QaPoint,
  QaScreenshotMoment,
  QaSize,
  RecordedElement,
  ScreenshotSource,
} from '@qa-instructions/core';

import { ActionRef } from './action-ref.js';
import { PageStates } from './page-states.js';
import { RecordingFrames, type RecordedCall } from './recording-frames.js';
import { Screencast } from './screencast.js';
import { SelectorParser } from './selector-parser.js';
import { FrameSnapshots } from './snapshot-dom.js';
import { SnapshotTarget } from './snapshot-target.js';
import { TraceArchive, type TraceEvent } from './trace-archive.js';
import { TraceChecks } from './trace-checks.js';

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
 * Library calls that only read or wait, so a screen recording frame painted
 * during one still shows the result of the call before it.
 */
const PASSIVE_METHODS: ReadonlySet<unknown> = new Set([
  'expect',
  'waitForTimeout',
  'waitForSelector',
  'textContent',
  'innerText',
  'innerHTML',
  'inputValue',
  'getAttribute',
  'isChecked',
  'isDisabled',
  'isEditable',
  'isEnabled',
  'isHidden',
  'isVisible',
  'queryCount',
  'querySelector',
  'querySelectorAll',
  'ariaSnapshot',
  'title',
  'content',
]);

/** The log line a pointer action writes as it starts scrolling to its element. */
const SCROLL_LOG = /scrolling into view/;

/** Why a trace gave no screenshots, when it was attached but could not be used. */
export type TraceProblem =
  | { kind: 'unsupportedVersion'; version: unknown }
  | { kind: 'unreadable'; reason: string };

type ImageRef = { moment: QaScreenshotMoment; file: string };

type CallRecord = {
  /** Per-action screen snapshots (`snapshots.screen`, Playwright 1.63+). */
  screenshots: ImageRef[];
  method?: unknown;
  /** The selector the call looked its element up by. */
  selector?: string;
  pageId?: string;
  startTime?: number;
  endTime?: number;
  /** When the call logged that it began scrolling to its element. */
  scrollTime?: number;
  box?: QaBox;
  point?: QaPoint;
  /** The DOM snapshot taken as the input was sent, which dates the Action. */
  inputSnapshot?: string;
  passwordField?: boolean;
  /** The element the call touched, from the first DOM snapshot marking it. */
  element?: RecordedElement;
  viewport?: QaSize;
  /** For a check the browser ran (`Frame.expect`): what it checked and expected. */
  expect?: { selector?: string; expectedText?: unknown };
};

/**
 * What the browser library recorded for each call: the per-action screen
 * snapshots, the element box and point of input actions, and when and on
 * which page the call ran, plus the link from the test runner's step ids to
 * library calls, the pages' screen recording, and what their DOM snapshots
 * record. Each library trace file is one browser context, whose options give
 * the viewport of every call in it and pair its clock with the wall clock.
 */
class TraceCalls {
  readonly screencast = new Screencast();
  readonly pages = new PageStates();
  private readonly callByStep = new Map<string, string>();
  private readonly records = new Map<string, CallRecord>();
  /** When each DOM snapshot was taken, by snapshot name. */
  private readonly snapshotTimes = new Map<string, number>();
  /** Each frame's DOM snapshots, by frame id. */
  private readonly frames = new Map<string, FrameSnapshots>();
  private readonly selectors = new SelectorParser();
  private viewport?: QaSize;
  /** The context's wall-clock time minus its trace-clock time. */
  private wallClockOffset?: number;

  constructor(contexts: TraceEvent[][]) {
    for (const events of contexts) {
      this.viewport = undefined;
      this.wallClockOffset = undefined;
      for (const event of events) this.add(event);
    }
  }

  /** The library call made for a test runner step. */
  forStep(stepId: string): CallRecord | undefined {
    const callId = this.callByStep.get(stepId);
    return callId === undefined ? undefined : this.records.get(callId);
  }

  /** A call as the screen recording frame choice sees it. */
  recorded(record: CallRecord): RecordedCall {
    return {
      pageId: record.pageId,
      startTime: record.startTime,
      endTime: record.endTime,
      inputSnapshot: record.inputSnapshot,
      inputTime: this.inputTime(record),
      marks: record.point !== undefined || record.box !== undefined,
      nextChange: this.nextChange(record),
    };
  }

  /**
   * When the call sent its input: the time of the DOM snapshot Playwright
   * takes just before (`input@<callId>`), on the same clock as the screen
   * recording. Unknown without DOM snapshots.
   */
  private inputTime(record: CallRecord): number | undefined {
    return record.inputSnapshot === undefined
      ? undefined
      : this.snapshotTimes.get(record.inputSnapshot);
  }

  /**
   * When a later call on the same page may first have changed it. Calls
   * that only read or wait change nothing. One that acts on an element first
   * waits for it, so it changes the page only once it scrolls to it or
   * sends its input; any other call may change the page as it starts.
   */
  private nextChange(record: CallRecord): number {
    const { startTime, pageId } = record;
    if (startTime === undefined || pageId === undefined) return Infinity;
    const changes = [...this.records.values()]
      .filter(
        (other) =>
          other !== record &&
          other.pageId === pageId &&
          other.startTime !== undefined &&
          other.startTime >= startTime &&
          !PASSIVE_METHODS.has(other.method),
      )
      .map((other) => {
        const input = this.inputTime(other);
        if (other.scrollTime === undefined && input === undefined) {
          return other.startTime as number;
        }
        return Math.min(other.scrollTime ?? Infinity, input ?? Infinity);
      });
    return Math.min(Infinity, ...changes);
  }

  private add(event: TraceEvent): void {
    if (event.type === 'frame-snapshot') {
      this.addSnapshot(event.snapshot);
      return;
    }
    if (event.type === 'context-options') {
      const options = this.isRecord(event.options) ? event.options : {};
      this.viewport = this.size(options.viewport);
      const { wallTime, monotonicTime } = event;
      this.wallClockOffset =
        typeof wallTime === 'number' &&
        typeof monotonicTime === 'number' &&
        wallTime > 0
          ? wallTime - monotonicTime
          : undefined;
      return;
    }
    if (event.type === 'screencast-frame') {
      this.screencast.add(event, this.wallClockOffset);
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
          method: event.method,
          pageId: typeof event.pageId === 'string' ? event.pageId : undefined,
          startTime: this.number(event.startTime),
          selector:
            this.isRecord(event.params) &&
            typeof event.params.selector === 'string'
              ? event.params.selector
              : undefined,
          expect: this.expectParams(event),
        });
        break;
      case 'after':
        this.record(callId).endTime = this.number(event.endTime);
        break;
      case 'log': {
        const record = this.record(callId);
        const time = this.number(event.time);
        if (
          time !== undefined &&
          record.scrollTime === undefined &&
          typeof event.message === 'string' &&
          SCROLL_LOG.test(event.message)
        ) {
          record.scrollTime = time;
        }
        break;
      }
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
    if (!this.isRecord(snapshot)) return;
    // Every snapshot of a frame is kept: later ones refer back to them.
    const frame = this.frame(snapshot.frameId);
    const index = frame.add(snapshot.html);
    if (typeof snapshot.callId !== 'string') return;
    this.pages.add(snapshot);

    const { snapshotName, timestamp } = snapshot;
    if (
      typeof snapshotName === 'string' &&
      typeof timestamp === 'number' &&
      !this.snapshotTimes.has(snapshotName)
    ) {
      this.snapshotTimes.set(snapshotName, timestamp);
    }
    const record = this.record(snapshot.callId);
    if (record.element || !SnapshotTarget.isMarkedIn(snapshot.html)) return;
    const target = SnapshotTarget.find(frame.document(index), snapshot.callId);
    if (target) {
      record.passwordField = target.isPasswordField;
      record.element = target.recorded(this.selectors.scope(record.selector));
    }
  }

  private frame(frameId: unknown): FrameSnapshots {
    const key = typeof frameId === 'string' ? frameId : '';
    let frame = this.frames.get(key);
    if (!frame) {
      frame = new FrameSnapshots();
      this.frames.set(key, frame);
    }
    return frame;
  }

  private expectParams(event: TraceEvent): CallRecord['expect'] {
    if (event.method !== 'expect' || !this.isRecord(event.params)) {
      return undefined;
    }
    const { selector, expectedText } = event.params;
    return {
      selector: typeof selector === 'string' ? selector : undefined,
      expectedText,
    };
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
 * screen recording), element box, and click point. Also says what each
 * check checked (see TraceChecks).
 * Never throws: an unreadable or unsupported trace gives no screenshots and
 * says why in `problem`.
 */
export class TraceScreenshotSource implements ScreenshotSource {
  private constructor(
    private readonly captures: ReadonlyMap<string, ActionCapture>,
    private readonly checks?: TraceChecks,
    readonly problem?: TraceProblem,
  ) {}

  static empty(problem?: TraceProblem): TraceScreenshotSource {
    return new TraceScreenshotSource(new Map(), undefined, problem);
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
    const frames = new RecordingFrames(calls.screencast, calls.pages);
    const records = TraceScreenshotSource.actionSteps(testEvents).flatMap(
      ({ ref, stepId }) => {
        const record = calls.forStep(stepId);
        return record
          ? [{ ref, record, images: this.images(record, calls, frames) }]
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
        element: record.element,
        viewport: record.viewport,
      });
    }
    const checks = new TraceChecks(testEvents, (stepId) => {
      const record = calls.forStep(stepId);
      return record?.expect && { ...record.expect, element: record.element };
    });
    return new TraceScreenshotSource(captures, checks);
  }

  capture(ref: string): ActionCapture | undefined {
    return this.captures.get(ref);
  }

  check(ref: string): CheckCapture | undefined {
    return this.checks?.check(ref);
  }

  /**
   * A call's per-action screenshots; without them (before 1.63, or without
   * `snapshots.screen`), a frame of the screen recording: the one showing
   * the moment of the Action when there is one it can be marked on, else
   * one showing the page once the call was done. An Action that touched no
   * point (a fill) gets the latter, which shows its result.
   */
  private static images(
    record: CallRecord,
    calls: TraceCalls,
    frames: RecordingFrames,
  ): ImageRef[] {
    if (record.screenshots.length > 0) return record.screenshots;
    const call = calls.recorded(record);
    const action = frames.atAction(call);
    if (action) return [{ moment: 'action', file: action.file }];
    const after = frames.afterAction(call);
    return after ? [{ moment: 'after', file: after.file }] : [];
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
