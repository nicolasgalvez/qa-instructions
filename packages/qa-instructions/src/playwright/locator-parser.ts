import type { ElementTarget } from '../core/index.js';

import { CssHint } from './css-hint.js';

type Call = { name: string; args: string };

const BY_METHOD: Record<string, Exclude<ElementTarget['by'], 'role'>> = {
  getByLabel: 'label',
  getByText: 'text',
  getByPlaceholder: 'placeholder',
  getByAltText: 'altText',
  getByTitle: 'title',
  getByTestId: 'testId',
  locator: 'selector',
};

/**
 * The object a locator chain starts from when read from test source, e.g.
 * `page.` or `this.page.` in `page.getByRole('link')`. Locator descriptions
 * Playwright reports have none.
 */
const RECEIVER = /^(?:[A-Za-z_$][\w$]*\s*\??\.\s*)+(?=[A-Za-z_$][\w$]*\s*\()/;

/**
 * Reads a Playwright locator description such as
 * `locator('form').getByRole('button', { name: 'Save' }).first()`, or the
 * same chain as written in a test (`page.getByRole(...)`), and returns the
 * element it ends on as a neutral ElementTarget.
 */
export class LocatorParser {
  constructor(private readonly css = new CssHint()) {}

  parse(locator: string | undefined): ElementTarget | undefined {
    if (!locator) return undefined;

    const calls = this.splitCalls(locator.replace(RECEIVER, ''));
    for (let i = calls.length - 1; i >= 0; i -= 1) {
      const target = this.toTarget(calls[i]);
      if (target) return target;
    }
    return undefined;
  }

  private toTarget({ name, args }: Call): ElementTarget | undefined {
    const literals = this.literals(args);

    if (name === 'getByRole') {
      const role = literals[0];
      if (!role) return undefined;
      const accessibleName = this.namedOption(args, 'name');
      return accessibleName === undefined
        ? { by: 'role', role }
        : { by: 'role', role, name: accessibleName };
    }

    const by = BY_METHOD[name];
    const value = literals[0];
    if (!by || value === undefined) return undefined;
    return by === 'selector' ? this.css.target(value) : { by, value };
  }

  /** Splits a chain into top-level `name(args)` calls. */
  private splitCalls(chain: string): Call[] {
    const calls: Call[] = [];
    let depth = 0;
    let quote: string | undefined;
    let name = '';
    let args = '';

    for (let i = 0; i < chain.length; i += 1) {
      const char = chain[i];

      if (quote) {
        args += char;
        if (char === '\\') {
          args += chain[i + 1] ?? '';
          i += 1;
        } else if (char === quote) {
          quote = undefined;
        }
        continue;
      }

      if (depth === 0) {
        if (char === '(') depth = 1;
        else if (char !== '.') name += char;
        continue;
      }

      if (char === "'" || char === '"' || char === '`') quote = char;
      else if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;

      if (depth === 0) {
        calls.push({ name: name.trim(), args });
        name = '';
        args = '';
      } else {
        args += char;
      }
    }
    return calls;
  }

  /** String and regex literals in an argument list, in order. */
  private literals(args: string): string[] {
    const pattern =
      /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|\/((?:\\.|[^/\\])+)\/[a-z]*/g;
    return [...args.matchAll(pattern)].map((match) =>
      this.unescape(match[1] ?? match[2] ?? match[3] ?? ''),
    );
  }

  private namedOption(args: string, option: string): string | undefined {
    const pattern = new RegExp(
      `\\b${option}:\\s*('(?:\\\\.|[^'\\\\])*'|"(?:\\\\.|[^"\\\\])*"|\\/(?:\\\\.|[^/\\\\])+\\/[a-z]*)`,
    );
    const match = pattern.exec(args);
    return match ? this.literals(match[1])[0] : undefined;
  }

  private unescape(text: string): string {
    return text.replace(/\\(.)/g, '$1');
  }
}
