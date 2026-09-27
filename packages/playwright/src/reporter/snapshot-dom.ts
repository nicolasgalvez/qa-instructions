import { Document, Element, Text, type ChildNode } from 'domhandler';
import { appendChild } from 'domutils';

/** A node of a DOM snapshot as the trace stores it. */
type SnapshotNode = unknown;

/**
 * The DOM snapshots (`frame-snapshot` events) of one frame, in the order the
 * trace recorded them, rebuilt as documents that can be queried.
 *
 * A snapshot's `html` is a node tree: text is a string, an element is
 * `[tagName, attributes, ...children]`, and a subtree unchanged since an
 * earlier snapshot of the same frame is a reference
 * `[[snapshotsBack, nodeIndex]]`, where `nodeIndex` counts that snapshot's
 * text and element nodes in post-order (children before their parent).
 */
export class FrameSnapshots {
  private readonly snapshots: SnapshotNode[] = [];
  private readonly postOrders = new Map<number, SnapshotNode[]>();

  /** Adds the frame's next snapshot and returns its index. */
  add(html: SnapshotNode): number {
    this.snapshots.push(html);
    return this.snapshots.length - 1;
  }

  /**
   * The snapshot at `index` as a document, with every reference resolved,
   * and the elements the snapshot wrote out itself rather than referring
   * back to (an element whose marks changed is always written out).
   */
  document(index: number): { document: Document; own: Element[] } {
    const document = new Document([]);
    const own: Element[] = [];
    for (const node of this.build(this.snapshots[index], index, (el, from) => {
      if (from === index) own.push(el);
    })) {
      appendChild(document, node);
    }
    return { document, own };
  }

  private build(
    node: SnapshotNode,
    index: number,
    built: (element: Element, snapshot: number) => void,
  ): ChildNode[] {
    if (typeof node === 'string') return [new Text(node)];
    if (!Array.isArray(node)) return [];

    if (Array.isArray(node[0])) {
      const [back, nodeIndex] = node[0] as unknown[];
      if (typeof back !== 'number' || typeof nodeIndex !== 'number') return [];
      // Only ever back to an earlier snapshot.
      const referenced = index - back;
      if (back < 1 || referenced < 0) return [];
      const target = this.postOrder(referenced)[nodeIndex];
      return target === undefined ? [] : this.build(target, referenced, built);
    }

    if (typeof node[0] !== 'string') return [];
    const [tagName, attributes, ...children] = node as unknown[];
    const element = new Element(
      (tagName as string).toLowerCase(),
      FrameSnapshots.isAttributes(attributes)
        ? FrameSnapshots.strings(attributes)
        : {},
    );
    for (const child of children) {
      for (const node of this.build(child, index, built)) {
        appendChild(element, node);
      }
    }
    built(element, index);
    return [element];
  }

  /** A snapshot's own text and element nodes, children before their parent. */
  private postOrder(index: number): SnapshotNode[] {
    let nodes = this.postOrders.get(index);
    if (!nodes) {
      nodes = [];
      const visit = (node: SnapshotNode, into: SnapshotNode[]) => {
        if (typeof node === 'string') {
          into.push(node);
        } else if (Array.isArray(node) && typeof node[0] === 'string') {
          // An element is always `[tagName, attributes, ...children]`
          // here, as Playwright counts it.
          for (const child of node.slice(2)) visit(child, into);
          into.push(node);
        }
      };
      visit(this.snapshots[index], nodes);
      this.postOrders.set(index, nodes);
    }
    return nodes;
  }

  private static isAttributes(
    value: unknown,
  ): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private static strings(
    attributes: Record<string, unknown>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(attributes).map(([name, value]) => [name, String(value)]),
    );
  }
}
