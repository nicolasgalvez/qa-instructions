import type { RecordedElement } from '@qa-instructions/core';
import type { AnyNode, Document, Element } from 'domhandler';
import { findAll, findOne, getParent, isTag, isText } from 'domutils';

/**
 * Playwright marks the element an action touched in its DOM snapshots
 * (`snapshots: { dom: true }`) with this attribute.
 */
const TARGET_ATTRIBUTE = '__playwright_target__';

/** Attributes Playwright adds to a snapshot for its own use. */
const PLAYWRIGHT_ATTRIBUTE = /^__playwright/;

/** Elements whose content a person never reads as text. */
const UNREAD = new Set(['script', 'style', 'noscript', 'template', 'head']);

/** Form controls, whose options and values are not part of a label's text. */
const CONTROLS = new Set(['select', 'textarea', 'input', 'button']);

/** Elements that sit inside a line of text rather than starting a new one. */
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'cite',
  'code',
  'em',
  'i',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
]);

/**
 * The element an action touched, in a DOM snapshot a trace recorded: what
 * the page showed of it, as a tester would see it.
 */
export class SnapshotTarget {
  private constructor(
    private readonly element: Element,
    private readonly document: Document,
  ) {}

  /**
   * Whether a snapshot's raw `html` marks the touched element. The marked
   * element is always written out in full, never as a reference to an
   * earlier snapshot, so this needs no resolving.
   */
  static isMarkedIn(html: unknown): boolean {
    const pending: unknown[] = [html];
    while (pending.length > 0) {
      const node = pending.pop();
      if (!Array.isArray(node) || typeof node[0] !== 'string') continue;
      const [, attributes, ...children] = node as unknown[];
      if (
        typeof attributes === 'object' &&
        attributes !== null &&
        TARGET_ATTRIBUTE in attributes
      ) {
        return true;
      }
      pending.push(attributes, ...children);
    }
    return false;
  }

  /**
   * The element a call touched, marked in a snapshot of that call, if there
   * is one. Only elements the snapshot wrote out itself count. Before 1.63
   * the mark is the call's id and stays on an element after its call, so a
   * mark in a part referred back to, or naming another call, is stale.
   */
  static find(
    { document, own }: { document: Document; own: Element[] },
    callId: string,
  ): SnapshotTarget | undefined {
    const element = own.find((el) => {
      const mark = el.attribs[TARGET_ATTRIBUTE];
      return mark === '' || mark === callId;
    });
    return element ? new SnapshotTarget(element, document) : undefined;
  }

  /** A field whose value the page hides as it is typed. */
  get isPasswordField(): boolean {
    return (
      this.element.name === 'input' &&
      this.element.attribs.type?.toLowerCase() === 'password'
    );
  }

  /** What the page showed of the element. */
  recorded(): RecordedElement {
    return {
      tag: this.element.name,
      attributes: Object.fromEntries(
        Object.entries(this.element.attribs).filter(
          ([name]) => !PLAYWRIGHT_ATTRIBUTE.test(name),
        ),
      ),
      text: this.textOf(this.element),
      labels: this.labels(),
    };
  }

  /**
   * What labels the element: the elements its `aria-labelledby` names, else
   * any `<label for>` it and the `<label>` around it.
   */
  private labels(): string[] {
    const { attribs } = this.element;
    const labelledBy = (attribs['aria-labelledby'] ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((id) => this.byId(id));
    // A label can both point at the element and wrap it: once is enough.
    const labels =
      labelledBy.length > 0
        ? labelledBy
        : new Set([
            ...(attribs.id ? this.labelsFor(attribs.id) : []),
            ...this.ancestors().filter((el) => el.name === 'label'),
          ]);
    return [...labels]
      .map((label) => this.textOf(label, { skipControls: true }))
      .filter(Boolean);
  }

  private byId(id: string): Element[] {
    const found = findOne((el) => el.attribs.id === id, this.document.children);
    return found ? [found] : [];
  }

  private labelsFor(id: string): Element[] {
    return findAll(
      (el) => el.name === 'label' && el.attribs.for === id,
      this.document.children,
    );
  }

  private ancestors(): Element[] {
    const ancestors: Element[] = [];
    for (
      let parent = getParent(this.element);
      parent && isTag(parent);
      parent = getParent(parent)
    ) {
      ancestors.push(parent);
    }
    return ancestors;
  }

  /** The text a person sees inside a node, whitespace collapsed. */
  private textOf(node: AnyNode, { skipControls = false } = {}): string {
    const parts: string[] = [];
    const visit = (current: AnyNode) => {
      if (isText(current)) {
        parts.push(current.data);
        return;
      }
      if (!isTag(current)) return;
      if (current !== node && !this.shown(current, skipControls)) return;
      const block = !INLINE.has(current.name);
      if (block) parts.push(' ');
      for (const child of current.children) visit(child);
      if (block) parts.push(' ');
    };
    visit(node);
    return parts.join('').replace(/\s+/g, ' ').trim();
  }

  /** Whether an element's content shows on the page, as far as the snapshot says. */
  private shown(element: Element, skipControls: boolean): boolean {
    const { attribs, name } = element;
    return !(
      UNREAD.has(name) ||
      name === 'svg' ||
      (skipControls && CONTROLS.has(name)) ||
      'hidden' in attribs ||
      attribs['aria-hidden'] === 'true' ||
      /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(
        attribs.style ?? '',
      )
    );
  }
}
