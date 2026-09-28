import type { RecordedElement, RecordedRegion } from '../core/index.js';
import { is } from 'css-select';
import type { AnyNode, Document, Element } from 'domhandler';
import {
  findAll,
  findOne,
  getParent,
  isTag,
  isText,
  prevElementSibling,
} from 'domutils';

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

/** `<input>` types a tester reads by their `value`. */
const BUTTON_TYPES = new Set(['button', 'submit', 'reset']);

/** The page itself, which a tester never needs told they are on. */
const PAGE = new Set(['html', 'body']);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Elements that title the part of the page they are in. */
const TITLES = new Set([...HEADINGS, 'legend', 'caption']);

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

  /**
   * What the page showed of the element, what titles it as a part of the
   * page, how many elements on the page looked like it, and the part of the
   * page it sits in. `scope` is the CSS
   * of the element the test narrowed its search to, if any.
   */
  recorded(scope?: string): RecordedElement {
    const lookalikes = this.lookalikes();
    const region = this.region(scope, lookalikes);
    const title = this.title(this.element);
    return {
      tag: this.element.name,
      attributes: this.attributesOf(this.element),
      text: this.textOf(this.element),
      labels: this.labels(this.element),
      lookalikes: lookalikes.length + 1,
      ...(title ? { title } : {}),
      ...(region ? { region } : {}),
    };
  }

  private attributesOf(element: Element): Record<string, string> {
    return Object.fromEntries(
      Object.entries(element.attribs).filter(
        ([name]) => !PLAYWRIGHT_ATTRIBUTE.test(name),
      ),
    );
  }

  /** The other elements on the page a tester could take for this one. */
  private lookalikes(): Element[] {
    const own = this.looks(this.element);
    return findAll(
      (el) =>
        el !== this.element &&
        el.name === this.element.name &&
        this.looks(el) === own,
      this.document.children,
    );
  }

  /** What a tester sees of an element: its kind and its words. */
  private looks(element: Element): string {
    const { attribs, name } = element;
    const buttonValue =
      name === 'input' && BUTTON_TYPES.has(attribs.type?.toLowerCase() ?? '')
        ? attribs.value
        : undefined;
    return JSON.stringify([
      name,
      attribs.type?.toLowerCase(),
      attribs.role,
      attribs['aria-label'],
      attribs.alt,
      attribs.title,
      attribs.placeholder,
      buttonValue,
      this.textOf(element),
      this.labels(element),
    ]);
  }

  /**
   * The part of the page the element sits in: the element the test
   * narrowed its search to, when it is more than the page itself and has a
   * title, else, when the page has lookalikes of the element, the largest
   * titled part around it that holds none of them.
   */
  private region(
    scope: string | undefined,
    lookalikes: Element[],
  ): RecordedRegion | undefined {
    const ancestors = this.ancestors(this.element).filter(
      (el) => !PAGE.has(el.name),
    );
    const scoped = scope
      ? ancestors.find((el) => this.matches(el, scope))
      : undefined;
    const scopeTitle = scoped && this.title(scoped);
    if (scoped && scopeTitle) {
      return this.regionOf(scoped, scopeTitle, true);
    }

    if (lookalikes.length === 0) return undefined;
    const holdsLookalike = (el: Element) =>
      lookalikes.some((other) => this.ancestors(other).includes(el));
    let region: RecordedRegion | undefined;
    for (const ancestor of ancestors) {
      if (holdsLookalike(ancestor)) break;
      const title = this.title(ancestor);
      if (title) region = this.regionOf(ancestor, title, false);
    }
    return region;
  }

  private regionOf(
    element: Element,
    title: string,
    scope: boolean,
  ): RecordedRegion {
    return {
      tag: element.name,
      attributes: this.attributesOf(element),
      title,
      scope,
    };
  }

  private matches(element: Element, css: string): boolean {
    try {
      return is(element, css);
    } catch {
      // Playwright's own CSS extensions (`:has-text`) are not plain CSS.
      return false;
    }
  }

  /**
   * What the page titles a part of it: its label, else the first heading,
   * legend, or caption inside it, else a heading just before it. A heading
   * holding the element itself names the element, not the part.
   */
  private title(part: Element): string | undefined {
    const labelled = this.labelledBy(part)
      .map((label) => this.textOf(label))
      .join(' ')
      .trim();
    const inside = findOne(
      (el) =>
        TITLES.has(el.name) &&
        this.shown(el, false) &&
        !this.ancestors(this.element).includes(el) &&
        this.textOf(el) !== '',
      part.children,
    );
    let before = prevElementSibling(part);
    while (before && !this.shown(before, false)) {
      before = prevElementSibling(before);
    }
    const heading = before && HEADINGS.has(before.name) ? before : undefined;
    return (
      [
        labelled,
        part.attribs['aria-label']?.trim(),
        inside && this.textOf(inside),
        heading && this.textOf(heading),
      ].find((title) => title) || undefined
    );
  }

  /**
   * What labels an element: the elements its `aria-labelledby` names, else
   * any `<label for>` it and the `<label>` around it.
   */
  private labels(element: Element): string[] {
    const labelledBy = this.labelledBy(element);
    // A label can both point at the element and wrap it: once is enough.
    const labels =
      labelledBy.length > 0
        ? labelledBy
        : new Set([
            ...(element.attribs.id ? this.labelsFor(element.attribs.id) : []),
            ...this.ancestors(element).filter((el) => el.name === 'label'),
          ]);
    return [...labels]
      .map((label) => this.textOf(label, { skipControls: true }))
      .filter(Boolean);
  }

  private labelledBy(element: Element): Element[] {
    return (element.attribs['aria-labelledby'] ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .flatMap((id) => this.byId(id));
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

  private ancestors(element: Element): Element[] {
    const ancestors: Element[] = [];
    for (
      let parent = getParent(element);
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
