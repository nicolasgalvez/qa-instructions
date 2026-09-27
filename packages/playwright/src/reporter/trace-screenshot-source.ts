import type {
  ActionCapture,
  QaBox,
  QaPoint,
  QaScreenshotMoment,
  ScreenshotSource,
} from '@qa-instructions/core';

import { ActionRef } from './action-ref.js';
import { TraceArchive, type TraceEvent } from './trace-archive.js';

/**
 * Trace format versions this reader understands. 9 is written by Playwright
 * 1.63; 10 by later releases. The format is not a documented Playwright API,
 * so anything else yields no screenshots rather than wrong ones.
 */
const SUPPORTED_VERSIONS: ReadonlySet<unknown> = new Set([9, 10]);

/** The test runner's own events; the other `.trace` files are the library's. */
const TEST_TRACE = 'test.trace';

const MOMENTS: ReadonlySet<unknown> = new Set<QaScreenshotMoment>([
  'action',
  'after',
  'before',
]);

type CallRecord = {
  screenshots: { moment: QaScreenshotMoment; file: string }[];
  box?: QaBox;
  point?: QaPoint;
};

/**
 * What the browser library recorded for each call: the per-action screen
 * snapshots (`snapshots.screen`) and the element box and point of input
 * actions, plus the link from the test runner's step ids to library calls.
 */
class TraceCalls {
  private readonly callByStep = new Map<string, string>();
  private readonly records = new Map<string, CallRecord>();

  constructor(events: TraceEvent[]) {
    for (const event of events) this.add(event);
  }

  /** The library call made for a test runner step. */
  forStep(stepId: string): CallRecord | undefined {
    const callId = this.callByStep.get(stepId);
    return callId === undefined ? undefined : this.records.get(callId);
  }

  private add(event: TraceEvent): void {
    const callId = event.callId;
    if (typeof callId !== 'string') return;

    switch (event.type) {
      case 'before':
        // Version 9 links a call to its step through `stepId`; version 10
        // uses the step id as the call id.
        this.callByStep.set(
          typeof event.stepId === 'string' ? event.stepId : callId,
          callId,
        );
        break;
      case 'input':
        Object.assign(this.record(callId), {
          box: this.box(event.box),
          point: this.point(event.point),
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

  private record(callId: string): CallRecord {
    let record = this.records.get(callId);
    if (!record) {
      record = { screenshots: [] };
      this.records.set(callId, record);
    }
    return record;
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
 * returns that call's screen snapshots, element box, and click point. Never
 * throws: an unreadable or unsupported trace gives no screenshots.
 */
export class TraceScreenshotSource implements ScreenshotSource {
  private constructor(
    private readonly captures: ReadonlyMap<string, ActionCapture>,
  ) {}

  static empty(): TraceScreenshotSource {
    return new TraceScreenshotSource(new Map());
  }

  static async open(tracePath: string): Promise<TraceScreenshotSource> {
    try {
      return TraceScreenshotSource.read(await TraceArchive.open(tracePath));
    } catch {
      return TraceScreenshotSource.empty();
    }
  }

  static read(archive: TraceArchive): TraceScreenshotSource {
    const eventFiles = archive.eventFiles();
    const testEvents = eventFiles.get(TEST_TRACE);
    if (!testEvents || !TraceScreenshotSource.isSupported(eventFiles)) {
      return TraceScreenshotSource.empty();
    }

    const calls = new TraceCalls(
      [...eventFiles]
        .filter(([name]) => name !== TEST_TRACE)
        .flatMap(([, events]) => events),
    );
    const records = TraceScreenshotSource.actionSteps(testEvents).map(
      ({ ref, stepId }) => ({ ref, record: calls.forStep(stepId) }),
    );

    const wanted = new Set(
      records
        .flatMap(({ record }) => record?.screenshots ?? [])
        .map((s) => s.file),
    );
    const images = archive.files((name) => wanted.has(name));

    const captures = new Map<string, ActionCapture>();
    for (const { ref, record } of records) {
      if (!record) continue;
      captures.set(ref, {
        screenshots: record.screenshots.flatMap(({ moment, file }) => {
          const data = images.get(file);
          return data ? [{ moment, contentType: 'image/png', data }] : [];
        }),
        box: record.box,
        point: record.point,
      });
    }
    return new TraceScreenshotSource(captures);
  }

  capture(ref: string): ActionCapture | undefined {
    return this.captures.get(ref);
  }

  /** Every trace file declares its format version on its first line. */
  private static isSupported(eventFiles: Map<string, TraceEvent[]>): boolean {
    return [...eventFiles.values()].every((events) =>
      events
        .filter((event) => event.type === 'context-options')
        .every((event) => SUPPORTED_VERSIONS.has(event.version)),
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
          event.method === 'pw:api' &&
          event.group === undefined &&
          typeof event.callId === 'string' &&
          typeof event.title === 'string',
      )
      .map((event, i) => ({
        ref: ActionRef.of(i + 1, event.title as string),
        stepId: (event.stepId ?? event.callId) as string,
      }));
  }
}
