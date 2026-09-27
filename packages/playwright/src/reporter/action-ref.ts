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

/** Numbers one test's `pw:api` steps, in the order they began. */
export class ActionRefSequence {
  private count = 0;

  next(title: string): string {
    this.count += 1;
    return ActionRef.of(this.count, title);
  }
}
