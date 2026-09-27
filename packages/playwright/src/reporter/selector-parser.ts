import type { ElementTarget } from '@qa-instructions/core';

/** `internal:attr=[<name>=…]` engines and the target each stands for. */
const ATTRIBUTES: Record<string, 'placeholder' | 'altText' | 'title'> = {
  placeholder: 'placeholder',
  alt: 'altText',
  title: 'title',
};

/** A quoted value (`"Save"i`, `"Save"s`) or a pattern (`/Save/i`). */
const VALUE = String.raw`"(?:\\.|[^"\\])*"[is]?|\/(?:\\.|[^/\\])+\/[a-z]*`;

/** An engine name before `=`: `internal:role`, `nth`, `css`. */
const ENGINE = /^[a-z][\w:-]*$/i;

/**
 * Reads a selector as Playwright records it in a trace, e.g.
 * `#purchase_1174 >> internal:role=button[name="Purchase"i] >> nth=0`, and
 * returns the element it ends on as a neutral ElementTarget: the same one
 * LocatorParser gives for the locator that made it. Parts that only narrow
 * the match (`nth=`, `visible=`, `internal:has-text=`) name nothing.
 */
export class SelectorParser {
  parse(selector: string | undefined): ElementTarget | undefined {
    if (!selector) return undefined;
    const parts = this.split(selector);
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const target = this.toTarget(parts[i]);
      if (target) return target;
    }
    return undefined;
  }

  private toTarget(part: string): ElementTarget | undefined {
    const eq = part.indexOf('=');
    const engine =
      eq > 0 && ENGINE.test(part.slice(0, eq)) ? part.slice(0, eq) : undefined;
    const body = engine === undefined ? part : part.slice(eq + 1);

    switch (engine) {
      case undefined:
      case 'css':
        return body ? { by: 'selector', value: body } : undefined;
      case 'internal:role': {
        const role = /^[\w-]+/.exec(body)?.[0];
        if (!role) return undefined;
        const name = this.attribute(body, 'name');
        return name === undefined
          ? { by: 'role', role }
          : { by: 'role', role, name };
      }
      case 'internal:text':
      case 'internal:label': {
        const value = this.value(body);
        const by = engine === 'internal:text' ? 'text' : 'label';
        return value === undefined ? undefined : { by, value };
      }
      case 'internal:attr': {
        const match = new RegExp(String.raw`^\[([\w-]+)=(${VALUE})\]$`).exec(
          body,
        );
        if (!match) return undefined;
        const by = ATTRIBUTES[match[1]];
        const value = this.value(match[2]);
        return by && value !== undefined ? { by, value } : undefined;
      }
      case 'internal:testid': {
        const match = new RegExp(String.raw`^\[[\w-]+=(${VALUE})\]$`).exec(
          body,
        );
        const value = match && this.value(match[1]);
        return value ? { by: 'testId', value } : undefined;
      }
      default:
        return undefined;
    }
  }

  /** The value of `[<name>=…]` in a role selector's options. */
  private attribute(body: string, name: string): string | undefined {
    const match = new RegExp(String.raw`\[${name}=(${VALUE})\]`).exec(body);
    return match ? this.value(match[1]) : undefined;
  }

  /** A quoted value's text, or a pattern's source. */
  private value(written: string): string | undefined {
    const quoted = /^("(?:\\.|[^"\\])*")[is]?$/.exec(written);
    if (quoted) {
      try {
        return JSON.parse(quoted[1]) as string;
      } catch {
        return undefined;
      }
    }
    const pattern = /^\/((?:\\.|[^/\\])+)\/[a-z]*$/.exec(written);
    return pattern?.[1];
  }

  /** Splits on ` >> ` outside quoted values. */
  private split(selector: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let quoted = false;
    for (let i = 0; i < selector.length; i += 1) {
      const c = selector[i];
      if (quoted) {
        if (c === '\\') i += 1;
        else if (c === '"') quoted = false;
      } else if (c === '"') {
        quoted = true;
      } else if (selector.startsWith('>>', i)) {
        parts.push(selector.slice(start, i).trim());
        start = i + 2;
        i += 1;
      }
    }
    parts.push(selector.slice(start).trim());
    return parts.filter((part) => part !== '');
  }
}
