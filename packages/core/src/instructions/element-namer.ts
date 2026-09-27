import type { ElementTarget } from '../events.js';
import type { RecordedElement } from '../screenshots/source.js';

/** Words a tester uses for common ARIA roles. */
export const ROLE_NOUNS: Record<string, string> = {
  button: 'button',
  link: 'link',
  heading: 'heading',
  textbox: 'field',
  searchbox: 'search field',
  spinbutton: 'number field',
  combobox: 'dropdown',
  listbox: 'list',
  option: 'option',
  checkbox: 'checkbox',
  radio: 'option',
  switch: 'switch',
  slider: 'slider',
  tab: 'tab',
  menuitem: 'menu item',
  img: 'image',
  dialog: 'dialog',
  alert: 'alert',
  navigation: 'navigation',
  row: 'row',
  cell: 'cell',
  listitem: 'item',
  list: 'list',
  table: 'table',
  form: 'form',
};

/** Words for elements whose role says little to a tester. */
const TAG_NOUNS: Record<string, string> = {
  details: 'expandable section',
};

/** The role an element has from its tag alone (HTML-AAM), where a tester would name it. */
const TAG_ROLES: Record<string, string> = {
  a: 'link',
  button: 'button',
  select: 'combobox',
  textarea: 'textbox',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  img: 'img',
  option: 'option',
  nav: 'navigation',
  dialog: 'dialog',
  li: 'listitem',
  ul: 'list',
  ol: 'list',
  tr: 'row',
  td: 'cell',
  th: 'cell',
  table: 'table',
  form: 'form',
};

/** The role of an `<input>` by its `type`; any other type is a text field. */
const INPUT_ROLES: Record<string, string | undefined> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  search: 'searchbox',
  hidden: undefined,
};

/** Fields are named by their label alone: "Type 3 into **Quantity**". */
const FIELD_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'searchbox',
  'spinbutton',
  'combobox',
  'listbox',
]);

/** Roles a person names by the text they show. Elements with no role are too. */
const TEXT_NAMED_ROLES: ReadonlySet<string> = new Set([
  'button',
  'link',
  'heading',
  'option',
  'tab',
  'menuitem',
  'cell',
  'switch',
  'checkbox',
  'radio',
  'listitem',
]);

/**
 * Parts of the page a tester names by their title, as when a later step
 * says an element is "in the **Energy** form".
 */
export const PART_ROLES: ReadonlySet<string> = new Set([
  'form',
  'dialog',
  'row',
  'table',
  'navigation',
]);

/** Text longer than this is content, not a name. */
const MAX_NAME_LENGTH = 80;

/** How a QA Step can refer to an element. Either part may be missing. */
export type ElementName = {
  /** What the page calls it, e.g. `Add to Cart`. */
  name?: string;
  /** What kind of thing a tester sees, e.g. `button`, `number field`. */
  noun?: string;
  /** A field, named by its label alone. */
  field: boolean;
};

export type ElementNameOptions = {
  /**
   * Whether the text inside the element may name it. Not when a check is
   * about that very text: "**3 in cart** shows **3 in cart**" says nothing.
   */
  byOwnText?: boolean;
};

/**
 * Decides how a tester would refer to an element the test found by test id
 * or selector: by what the page showed of it when the test ran (its label,
 * text, or accessible name, and what kind of element it was), or, when the
 * page was not recorded, by the kind of element the selector asks for.
 */
export class ElementNamer {
  name(
    target: ElementTarget | undefined,
    element: RecordedElement | undefined,
    { byOwnText = true }: ElementNameOptions = {},
  ): ElementName {
    const described = element ?? this.fromSelector(target);
    if (!described) return { field: false };

    const role = this.role(described);
    return {
      name: element && this.accessibleName(element, role, byOwnText),
      noun: TAG_NOUNS[described.tag] ?? (role && ROLE_NOUNS[role]),
      field: role !== undefined && FIELD_ROLES.has(role),
    };
  }

  /** The element's ARIA role: its own `role`, or the one its tag implies. */
  role(element: RecordedElement): string | undefined {
    const explicit = element.attributes.role?.trim().split(/\s+/)[0];
    if (explicit) return explicit;
    if (element.tag === 'input') {
      const type = (element.attributes.type ?? '').toLowerCase();
      return type in INPUT_ROLES ? INPUT_ROLES[type] : 'textbox';
    }
    return TAG_ROLES[element.tag];
  }

  /**
   * The name a tester sees, in the order browsers name elements: what
   * labels it (or, for a part of the page, what titles it), then its own
   * words (a button's value, an image's alt text, the text inside it), then
   * its tooltip or placeholder.
   */
  private accessibleName(
    element: RecordedElement,
    role: string | undefined,
    byOwnText: boolean,
  ): string | undefined {
    const { attributes } = element;
    const buttonInput =
      element.tag === 'input' && role === 'button' ? attributes.value : '';
    const text =
      byOwnText &&
      (role === undefined || TEXT_NAMED_ROLES.has(role)) &&
      element.text.length <= MAX_NAME_LENGTH
        ? element.text
        : '';
    const candidates = [
      element.labels.join(' '),
      attributes['aria-label'],
      role !== undefined && PART_ROLES.has(role) ? element.title : undefined,
      buttonInput,
      attributes.alt,
      text,
      attributes.title,
      role !== undefined && FIELD_ROLES.has(role)
        ? attributes.placeholder
        : undefined,
    ];
    return candidates
      .map((candidate) => (candidate ?? '').replace(/\s+/g, ' ').trim())
      .find((candidate) => candidate !== '');
  }

  /** What a selector says of its element, as an element with no name. */
  private fromSelector(
    target: ElementTarget | undefined,
  ): RecordedElement | undefined {
    if (target?.by !== 'selector' || !target.tag) return undefined;
    return {
      tag: target.tag,
      attributes: target.type ? { type: target.type } : {},
      text: '',
      labels: [],
    };
  }
}
