import type { ElementTarget } from '../core/index.js';
import {
  isTraversal,
  parse as parseCss,
  SelectorType,
  type Selector,
} from 'css-what';

/**
 * What a CSS selector requires of the element it ends on: its tag and
 * `type`, read from the last compound of the first selector in a list
 * (`input[type="radio"]` in `label input[type="radio"], …`). A tester is
 * never shown the selector, but can be told it is a button or a field.
 */
export class CssHint {
  /** A selector target for `css`, with what the selector says of its element. */
  target(css: string): ElementTarget {
    return { by: 'selector', value: css, ...this.read(css) };
  }

  private read(css: string): { tag?: string; type?: string } {
    let parsed: Selector[][];
    try {
      parsed = parseCss(css);
    } catch {
      return {};
    }
    const first = parsed[0] ?? [];
    const traversals = first.flatMap((part, i) =>
      isTraversal(part) ? [i] : [],
    );
    const compound = first.slice((traversals.at(-1) ?? -1) + 1);
    const tag = compound.find((part) => part.type === SelectorType.Tag);
    const type = compound.find(
      (part) =>
        part.type === SelectorType.Attribute &&
        part.name === 'type' &&
        part.action === 'equals',
    );
    return {
      ...(tag?.type === SelectorType.Tag
        ? { tag: tag.name.toLowerCase() }
        : {}),
      ...(type?.type === SelectorType.Attribute
        ? { type: type.value.toLowerCase() }
        : {}),
    };
  }
}
