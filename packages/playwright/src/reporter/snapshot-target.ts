/**
 * Playwright marks the element an action touched in its DOM snapshots
 * (`snapshots: { dom: true }`) with this attribute.
 */
const TARGET_ATTRIBUTE = '__playwright_target__';

/**
 * The element an action touched, as recorded in one trace `frame-snapshot`.
 *
 * A snapshot's `html` is a node tree: text is a string, an element is
 * `[tagName, attributes?, ...children]`, and a subtree unchanged since an
 * earlier snapshot is a reference `[[snapshotOffset, nodeIndex]]`. The
 * touched element carries the target attribute, so it is never a reference.
 */
export class SnapshotTarget {
  private constructor(
    private readonly tagName: string,
    private readonly attributes: Record<string, unknown>,
  ) {}

  /** The marked element in a snapshot's `html`, if there is one. */
  static find(html: unknown): SnapshotTarget | undefined {
    const pending: unknown[] = [html];
    while (pending.length > 0) {
      const node = pending.pop();
      if (!Array.isArray(node) || typeof node[0] !== 'string') continue;

      const [tagName, maybeAttributes, ...rest] = node as unknown[];
      const hasAttributes = SnapshotTarget.isAttributes(maybeAttributes);
      if (hasAttributes && TARGET_ATTRIBUTE in maybeAttributes) {
        return new SnapshotTarget(tagName as string, maybeAttributes);
      }
      pending.push(...(hasAttributes ? rest : [maybeAttributes, ...rest]));
    }
    return undefined;
  }

  /** A field whose value the page hides as it is typed. */
  get isPasswordField(): boolean {
    const type = this.attributes.type;
    return (
      this.tagName.toUpperCase() === 'INPUT' &&
      typeof type === 'string' &&
      type.toLowerCase() === 'password'
    );
  }

  private static isAttributes(
    value: unknown,
  ): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
