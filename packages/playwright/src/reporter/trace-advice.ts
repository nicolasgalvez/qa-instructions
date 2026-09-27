import type { TraceProblem } from './trace-screenshot-source.js';

/** Why a test's QA Instructions have no Step Screenshots. */
export type ScreenshotProblem = TraceProblem | { kind: 'missing' };

/** First release whose trace records a screenshot per action (`snapshots.screen`). */
const SCREEN_SNAPSHOTS = [1, 63] as const;

/**
 * Tells the developer how to get Step Screenshots, in the terms of the
 * Playwright version the project runs: the trace setting to add when no
 * trace was recorded, or why a recorded trace could not be used.
 */
export class TraceAdvice {
  private readonly screenSnapshots: boolean;

  /** `version` is Playwright's own (`FullConfig.version`); unknown means current. */
  constructor(version?: string) {
    const [major, minor] = (version ?? '').split('.').map(Number);
    this.screenSnapshots =
      !Number.isFinite(major) ||
      !Number.isFinite(minor) ||
      major > SCREEN_SNAPSHOTS[0] ||
      (major === SCREEN_SNAPSHOTS[0] && minor >= SCREEN_SNAPSHOTS[1]);
  }

  /** The config line that turns on the trace Step Screenshots come from. */
  get traceSetting(): string {
    return this.screenSnapshots
      ? "use: { trace: { mode: 'on', snapshots: { screen: true, dom: true } } }"
      : "use: { trace: 'on' }";
  }

  /** One key per kind of advice, so each is given once per run. */
  key(problem: ScreenshotProblem): string {
    return problem.kind === 'unsupportedVersion'
      ? `${problem.kind}:${String(problem.version)}`
      : problem.kind;
  }

  message(problem: ScreenshotProblem): string {
    switch (problem.kind) {
      case 'missing':
        return `no trace was recorded, so QA Instructions have no Step Screenshots. Add this to playwright.config to get them: ${this.traceSetting}`;
      case 'unsupportedVersion':
        return `trace format version ${String(problem.version)} is not supported (supported: 8, 9, 10), so QA Instructions have no Step Screenshots.`;
      case 'unreadable':
        return `could not read a trace (${problem.reason}), so some QA Instructions have no Step Screenshots.`;
    }
  }
}
