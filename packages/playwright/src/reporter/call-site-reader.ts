import { readFileSync } from 'node:fs';

/** Where Playwright says a step was called: 1-based line and column of the method name. */
export type SourceLocation = { file: string; line: number; column: number };

/** What the test's own source says about one call. */
export type CallSite = {
  /** The test did something with the call's result (assigned, checked, returned, passed on). */
  resultUsed: boolean;
  /** The call's options include `force: true`. */
  forced: boolean;
};

/** Words that end an expression when reading backward from a call. */
const PREFIX_KEYWORDS = new Set([
  'await',
  'void',
  'return',
  'yield',
  'throw',
  'typeof',
  'new',
  'delete',
  'case',
  'in',
  'of',
  'else',
  'do',
]);

/** Keywords after which a call starts a statement of its own. */
const STATEMENT_KEYWORDS = new Set(['else', 'do']);

const FORCE_OPTION = /\bforce\s*:\s*true\b/;

function defaultReadSource(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * Test source with string and comment contents blanked out (same length),
 * so brackets and words inside them are never mistaken for code.
 */
class MaskedSource {
  readonly text: string;
  private readonly lineStarts: number[] = [0];

  constructor(source: string) {
    this.text = this.mask(source);
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] === '\n') this.lineStarts.push(i + 1);
    }
  }

  offsetOf(line: number, column: number): number | undefined {
    const start = this.lineStarts[line - 1];
    if (start === undefined) return undefined;
    const offset = start + column - 1;
    return offset < this.text.length ? offset : undefined;
  }

  private mask(source: string): string {
    const out = source.split('');
    let i = 0;
    const blank = (from: number, to: number) => {
      for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' ';
    };

    while (i < source.length) {
      const c = source[i];
      const next = source[i + 1];
      if (c === '/' && next === '/') {
        const end = source.indexOf('\n', i);
        const stop = end === -1 ? source.length : end;
        blank(i, stop);
        i = stop;
      } else if (c === '/' && next === '*') {
        const end = source.indexOf('*/', i + 2);
        const stop = end === -1 ? source.length : end + 2;
        blank(i, stop);
        i = stop;
      } else if (c === "'" || c === '"' || c === '`') {
        let j = i + 1;
        while (j < source.length && source[j] !== c) {
          j += source[j] === '\\' ? 2 : 1;
        }
        blank(i + 1, j);
        i = j + 1;
      } else {
        i += 1;
      }
    }
    return out.join('');
  }
}

/**
 * Reads a Playwright call site in the test's own source to learn what the
 * step data does not say: whether the test used the call's result, and
 * whether it forced the call. A lexical reading, not a parser: it follows
 * the member chain back to the start of the expression and looks at what
 * comes before it.
 */
export class CallSiteReader {
  private readonly sources = new Map<string, MaskedSource | undefined>();

  constructor(
    private readonly readSource: (
      file: string,
    ) => string | undefined = defaultReadSource,
  ) {}

  read(location: SourceLocation): CallSite | undefined {
    const source = this.source(location.file);
    const offset = source?.offsetOf(location.line, location.column);
    if (!source || offset === undefined) return undefined;

    return {
      resultUsed: this.resultUsed(source.text, offset),
      forced: FORCE_OPTION.test(this.argumentsOf(source.text, offset)),
    };
  }

  private source(file: string): MaskedSource | undefined {
    if (!this.sources.has(file)) {
      const text = this.readSource(file);
      this.sources.set(
        file,
        text === undefined ? undefined : new MaskedSource(text),
      );
    }
    return this.sources.get(file);
  }

  private resultUsed(text: string, methodStart: number): boolean {
    let start = this.expressionStart(text, methodStart);

    let before = this.skipSpaceBack(text, start);
    const word = this.wordBefore(text, before);
    if (word === 'await' || word === 'void') {
      start = before - word.length;
      before = this.skipSpaceBack(text, start);
    }

    if (before === 0) return false;
    const c = text[before - 1];
    if (';{})'.includes(c)) return false;

    const newlineBetween = text.slice(before, start).includes('\n');
    if (this.isIdentifierChar(c)) {
      const previous = this.wordBefore(text, before);
      if (STATEMENT_KEYWORDS.has(previous)) return false;
      return !newlineBetween || PREFIX_KEYWORDS.has(previous);
    }
    // A value closing the previous line, then a new statement (no semicolon).
    if ((c === ']' || c === "'" || c === '"' || c === '`') && newlineBetween) {
      return false;
    }
    return true;
  }

  /** Start of the member chain the call at `methodStart` belongs to, e.g. `page` in `page.locator(x).evaluate`. */
  private expressionStart(text: string, methodStart: number): number {
    let i = methodStart;
    for (;;) {
      let j = this.skipSpaceBack(text, i);
      if (text[j - 1] !== '.') return i;
      j -= 1;
      if (text[j - 1] === '?') j -= 1;
      i = this.primaryStart(text, j);
    }
  }

  /** Start of the callee, call, or index expression ending just before `end`. */
  private primaryStart(text: string, end: number): number {
    let i = end;
    for (;;) {
      const j = this.skipSpaceBack(text, i);
      const c = text[j - 1];
      if (c === ')' || c === ']') {
        i = this.openerOf(text, j - 1);
      } else if (this.isIdentifierChar(c)) {
        const word = this.wordBefore(text, j);
        return PREFIX_KEYWORDS.has(word) ? i : j - word.length;
      } else {
        return i;
      }
    }
  }

  /** Text inside the call's parentheses, e.g. `{ force: true }`. */
  private argumentsOf(text: string, methodStart: number): string {
    let i = methodStart;
    while (i < text.length && this.isIdentifierChar(text[i])) i += 1;
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (text[i] !== '(') return '';
    return text.slice(i + 1, this.closerOf(text, i));
  }

  private openerOf(text: string, close: number): number {
    let depth = 0;
    for (let i = close; i >= 0; i -= 1) {
      if (')]}'.includes(text[i])) depth += 1;
      else if ('([{'.includes(text[i])) depth -= 1;
      if (depth === 0) return i;
    }
    return 0;
  }

  private closerOf(text: string, open: number): number {
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if ('([{'.includes(text[i])) depth += 1;
      else if (')]}'.includes(text[i])) depth -= 1;
      if (depth === 0) return i;
    }
    return text.length;
  }

  private skipSpaceBack(text: string, end: number): number {
    let i = end;
    while (i > 0 && /\s/.test(text[i - 1])) i -= 1;
    return i;
  }

  private wordBefore(text: string, end: number): string {
    let i = end;
    while (i > 0 && this.isIdentifierChar(text[i - 1])) i -= 1;
    return text.slice(i, end);
  }

  private isIdentifierChar(c: string | undefined): boolean {
    return c !== undefined && /[\w$]/.test(c);
  }
}
