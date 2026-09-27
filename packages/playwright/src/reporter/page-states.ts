import { createHash } from 'node:crypto';

/**
 * The attribute a DOM snapshot puts on the element a call acts on. It names
 * the call, so it differs between snapshots of an otherwise unchanged page.
 */
const TARGET_ATTRIBUTE = '__playwright_target__';
/** Where DOM snapshots record an element's scroll offsets. */
const SCROLL_ATTRIBUTES = [
  '__playwright_scroll_top_',
  '__playwright_scroll_left_',
];

/** What one DOM snapshot records of a page, reduced to what can be compared. */
type PageState = {
  /** The page's DOM, form values, and scroll offsets. */
  dom: string;
  /** Every scroll offset in the page, in document order. */
  scroll: string;
};

type NodeState = { dom: string; scroll: string };

/**
 * One frame's DOM snapshots, in the order taken. A snapshot writes out only
 * what changed since the frame's earlier snapshots; everything else is a
 * reference `[[snapshotsAgo, nodeIndex]]` to a node written in an earlier
 * one, numbered as Playwright's trace viewer numbers them (children before
 * their parent, skipping references).
 */
class FrameSnapshots {
  private readonly roots: unknown[] = [];
  private readonly nodeLists = new Map<number, unknown[]>();
  private readonly states = new WeakMap<object, NodeState>();
  private unreadable = 0;

  /** Adds the frame's next snapshot and returns what it records. */
  add(html: unknown): NodeState {
    this.roots.push(html);
    return this.state(html, this.roots.length - 1);
  }

  private state(node: unknown, index: number): NodeState {
    if (typeof node === 'string')
      return { dom: this.hash(`#${node}`), scroll: '' };
    if (!Array.isArray(node)) return this.unknown();
    if (Array.isArray(node[0])) return this.reference(node[0], index);
    const cached = this.states.get(node);
    if (cached) return cached;

    const [name, attributes, ...children] = node as [
      unknown,
      unknown,
      ...unknown[],
    ];
    const attrs = this.isRecord(attributes) ? attributes : {};
    const own = Object.entries(attrs)
      .filter(([key]) => key !== TARGET_ATTRIBUTE)
      .sort(([a], [b]) => a.localeCompare(b));
    const offsets = SCROLL_ATTRIBUTES.map((key) => attrs[key] ?? 0).join(',');
    const scrolled = SCROLL_ATTRIBUTES.some((key) => key in attrs);
    const childStates = children.map((child) => this.state(child, index));
    const state = {
      dom: this.hash(
        JSON.stringify([name, own, childStates.map((child) => child.dom)]),
      ),
      scroll: [scrolled ? offsets : '', ...childStates.map((c) => c.scroll)]
        .filter(Boolean)
        .join(';'),
    };
    this.states.set(node, state);
    return state;
  }

  /** A node written by an earlier snapshot, read as that snapshot wrote it. */
  private reference(ref: unknown[], index: number): NodeState {
    const [ago, nodeIndex] = ref;
    if (typeof ago !== 'number' || typeof nodeIndex !== 'number') {
      return this.unknown();
    }
    const source = index - ago;
    const node = source >= 0 ? this.nodes(source)[nodeIndex] : undefined;
    return node === undefined ? this.unknown() : this.state(node, source);
  }

  /** The nodes a snapshot wrote out, numbered as references number them. */
  private nodes(index: number): unknown[] {
    let list = this.nodeLists.get(index);
    if (list) return list;
    list = [];
    const visit = (node: unknown) => {
      if (typeof node === 'string') {
        list?.push(node);
      } else if (Array.isArray(node) && typeof node[0] === 'string') {
        for (const child of node.slice(2)) visit(child);
        list?.push(node);
      }
    };
    visit(this.roots[index]);
    this.nodeLists.set(index, list);
    return list;
  }

  /** A node that cannot be read: equal to nothing, so never taken as unchanged. */
  private unknown(): NodeState {
    const unique = `?${(this.unreadable += 1)}`;
    return { dom: unique, scroll: unique };
  }

  private hash(text: string): string {
    return createHash('sha1').update(text).digest('base64');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

/** A page's state at one DOM snapshot moment (e.g. `input@call@12`). */
type Moment = { name: string; time: number; frames: Map<string, NodeState> };

/**
 * What a page's DOM snapshots (`snapshots.dom`, taken before, at the input
 * of, and after each call) record of it over time: its DOM, form values, and
 * scroll offsets. Says since when the page had been as it was at a given
 * snapshot, which tells whether a screen recording frame can show it, and
 * whether a call changed the page.
 */
export class PageStates {
  private readonly frames = new Map<string, FrameSnapshots>();
  private readonly moments = new Map<string, Moment[]>();

  add(snapshot: Record<string, unknown>): void {
    const { pageId, frameId, timestamp, html } = snapshot;
    const snapshotName = PageStates.nameOf(snapshot);
    if (
      typeof pageId !== 'string' ||
      typeof frameId !== 'string' ||
      snapshotName === undefined ||
      typeof timestamp !== 'number'
    ) {
      return;
    }
    let frame = this.frames.get(frameId);
    if (!frame) {
      frame = new FrameSnapshots();
      this.frames.set(frameId, frame);
    }
    const state = frame.add(html);

    let moments = this.moments.get(pageId);
    if (!moments) {
      moments = [];
      this.moments.set(pageId, moments);
    }
    let moment = moments.find((m) => m.name === snapshotName);
    if (!moment) {
      moment = { name: snapshotName, time: timestamp, frames: new Map() };
      moments.push(moment);
    }
    moment.time = Math.max(moment.time, timestamp);
    moment.frames.set(frameId, state);
  }

  /**
   * When the page's scroll offsets were first recorded as they are at the
   * named snapshot, unchanged through it. Undefined without that snapshot.
   */
  scrollSince(
    pageId: string | undefined,
    snapshotName: string,
  ): number | undefined {
    return this.since(pageId, snapshotName, (state) => state.scroll);
  }

  /**
   * When the page's DOM, form values, and scroll offsets were first recorded
   * as they are at the named snapshot, unchanged through it (ignoring which
   * element Playwright marked as a call's target).
   */
  unchangedSince(
    pageId: string | undefined,
    snapshotName: string,
  ): number | undefined {
    return this.since(pageId, snapshotName, (state) => state.dom);
  }

  /**
   * Whether the page's DOM, form values, or scroll offsets differ between
   * before a call (`before@<callId>`) and after it (`after@<callId>`), or,
   * with `untilNext`, the page's next snapshot after that (the next call's
   * `before`), for work the call hands on untraced. Ignores which element
   * Playwright marked as a call's target. Undefined without both snapshots.
   */
  changedBy(callId: string, untilNext = false): boolean | undefined {
    for (const moments of this.moments.values()) {
      const before = moments.find((m) => m.name === `before@${callId}`);
      const at = moments.findIndex((m) => m.name === `after@${callId}`);
      const after = moments[untilNext ? at + 1 : at];
      if (before && at >= 0) {
        return after === undefined
          ? undefined
          : this.pageState(before).dom !== this.pageState(after).dom;
      }
    }
    return undefined;
  }

  /**
   * A snapshot's name, e.g. `before@call@12`. Playwright 1.53–1.62 write it
   * as `snapshotName`; 1.63 writes the call and its `phase` instead.
   */
  private static nameOf(snapshot: Record<string, unknown>): string | undefined {
    const { snapshotName, phase, callId } = snapshot;
    if (typeof snapshotName === 'string') return snapshotName;
    return typeof phase === 'string' && typeof callId === 'string'
      ? `${phase}@${callId}`
      : undefined;
  }

  private since(
    pageId: string | undefined,
    snapshotName: string,
    key: (state: PageState) => string,
  ): number | undefined {
    if (pageId === undefined) return undefined;
    // In the order the snapshots were recorded.
    const moments = this.moments.get(pageId) ?? [];
    const at = moments.findIndex((m) => m.name === snapshotName);
    if (at < 0) return undefined;
    const value = key(this.pageState(moments[at]));
    let first = at;
    while (first > 0 && key(this.pageState(moments[first - 1])) === value) {
      first -= 1;
    }
    return moments[first].time;
  }

  /** A moment's state over all the page's frames snapshotted then. */
  private pageState(moment: Moment): PageState {
    const frames = [...moment.frames].sort(([a], [b]) => a.localeCompare(b));
    return {
      dom: frames.map(([id, state]) => `${id}:${state.dom}`).join('|'),
      scroll: frames.map(([id, state]) => `${id}:${state.scroll}`).join('|'),
    };
  }
}
