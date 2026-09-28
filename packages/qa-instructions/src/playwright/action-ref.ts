/**
 * How the Playwright adapter refers to one `pw:api` step on both sides of the
 * reporter-to-trace join. Reporter steps carry no id, so a step is identified
 * by its position among the test's `pw:api` steps (in the order they began)
 * and its title; the title guards against pairing a step with the wrong
 * trace entry if the two orders ever disagree.
 */
export class ActionRef {
  static of(ordinal: number, title: string): string {
    return `${ordinal}:${title}`;
  }
}

/**
 * The same join for one `expect` step: its position among the test's
 * `expect` steps, and its title (the matcher, or the check's message).
 */
export class CheckRef {
  static of(ordinal: number, title: string): string {
    return `${ordinal}:${title}`;
  }
}

/** Numbers one test's `pw:api` steps, in the order they began. */
export class ActionRefSequence {
  private count = 0;

  constructor(private readonly ref = ActionRef.of) {}

  next(title: string): string {
    this.count += 1;
    return this.ref(this.count, title);
  }
}

/** Numbers one test's `pw:api` and `expect` steps, each in the order they began. */
export class StepRefs {
  readonly actions = new ActionRefSequence(ActionRef.of);
  readonly checks = new ActionRefSequence(CheckRef.of);
}
