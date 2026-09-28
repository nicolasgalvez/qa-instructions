/**
 * The reporter's own output: warnings on stderr, each shown once per run so
 * a setup mistake or a recurring error does not flood the test output.
 */
export class ReporterLog {
  private readonly shown = new Set<string>();

  constructor(
    private readonly write: (message: string) => void = (message) =>
      console.warn(message),
  ) {}

  /** Shows `message` unless a message with the same `key` was shown this run. */
  once(key: string, message: string): void {
    if (this.shown.has(key)) return;
    this.shown.add(key);
    this.write(`qa-instructions: ${message}`);
  }

  /** Shows the run's first reporter error; later ones would repeat it. */
  error(subject: string, error: unknown): void {
    this.once(
      'error',
      `could not write QA Instructions for "${subject}": ${String(error)}. The test run is not affected; further reporter errors in this run are not shown.`,
    );
  }
}
