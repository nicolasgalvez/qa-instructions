import { BundleDirNamer } from '../bundle/dir-namer.js';
import type { TestEvent, TestEventSink, TestStartEvent } from '../events.js';
import type { QaRunBundle } from '../model.js';
import type { ScreenshotSource } from '../screenshots/source.js';
import { QaInstructionsRecorder, type QaRecording } from './recorder.js';

/** One test's QA Instructions and the directory its bundle belongs in. */
export type QaInstructionsResult = {
  dirName: string;
  /** The test attempt the QA Instructions come from. */
  start: TestStartEvent;
  /** The QA Instructions as text only. */
  bundle: QaRunBundle;
  /** The QA Instructions with Step Screenshots from `screenshots`. */
  record(screenshots: ScreenshotSource): QaRecording;
};

type RecordedTest = {
  start: TestStartEvent;
  recorder: QaInstructionsRecorder;
};

/**
 * Consumes the event streams of a whole test run, one test attempt after
 * another, and keeps one set of QA Instructions per test: the one from its
 * last attempt.
 */
export class QaInstructionsRun implements TestEventSink {
  private readonly tests = new Map<string, RecordedTest>();
  private current?: RecordedTest;

  constructor(
    private readonly createRecorder: () => QaInstructionsRecorder = () =>
      new QaInstructionsRecorder(),
    private readonly namer = new BundleDirNamer(),
  ) {}

  handle(event: TestEvent): void {
    if (event.type === 'testStart') {
      this.current = { start: event, recorder: this.createRecorder() };
    }
    if (!this.current) return;

    this.current.recorder.handle(event);
    if (event.type === 'testEnd') {
      this.keepIfLatest(this.current);
      this.current = undefined;
    }
  }

  /** QA Instructions for every test seen, in the order tests first ended. */
  results(): QaInstructionsResult[] {
    const tests = [...this.tests.values()];
    const names = this.namer.names(
      tests.map(({ start }) => ({
        file: start.file ?? '',
        title: start.title,
        project: start.project,
        line: start.line,
      })),
    );
    return tests.map(({ start, recorder }, index) => ({
      dirName: names[index],
      start,
      bundle: recorder.toBundle(),
      record: (screenshots) => recorder.toRecording(screenshots),
    }));
  }

  private keepIfLatest(test: RecordedTest): void {
    const key = this.key(test.start);
    const kept = this.tests.get(key);
    if (!kept || test.recorder.attempt >= kept.recorder.attempt) {
      this.tests.set(key, test);
    }
  }

  private key(start: TestStartEvent): string {
    return (
      start.id ??
      JSON.stringify([start.file, start.title, start.project, start.line])
    );
  }
}
