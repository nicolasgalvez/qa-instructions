import { ACTION_KINDS, VERB_ALIASES } from './action-verbs.js';

/** What a `pw:api` step title says: its verb, and any quoted value and locator after it. */
export type StepTitle = {
  verb: string;
  value?: string;
  locator?: string;
};

/** A locator description as Playwright renders one, e.g. `getByRole('link')`. */
const LOCATOR_START = /^[A-Za-z_$][\w$]*\(/;

/**
 * Reads a `pw:api` step title. Before 1.63, Playwright reports no step
 * params or subtitle, and the title carries them instead:
 * `Fill "demo-user" getByLabel('Username')`, `Navigate to "/faq"`,
 * `Click getByRole('link', { name: 'Sign in' })`. A 1.63 title
 * (`Fill "demo-user"`, `Click`) reads the same way, without the locator.
 */
export class StepTitleParser {
  /** Known verbs, longest first, so `Double click` wins over `Click`-like prefixes. */
  private readonly verbs = [
    ...Object.keys(ACTION_KINDS),
    ...Object.keys(VERB_ALIASES),
  ].sort((a, b) => b.length - a.length);

  parse(title: string): StepTitle {
    const written = this.verbs.find(
      (verb) => title === verb || title.startsWith(`${verb} `),
    );
    if (!written) return { verb: title };

    const verb = VERB_ALIASES[written] ?? written;
    const rest = title.slice(written.length).trim();
    if (!rest) return { verb };
    if (!rest.startsWith('"')) return { verb, locator: rest };
    return { verb, ...this.quotedValue(rest) };
  }

  /**
   * `"value" locator` or `"value"`. The value is not escaped, so it ends at
   * the last `" ` followed by a locator, or at the closing quote.
   */
  private quotedValue(rest: string): Omit<StepTitle, 'verb'> {
    for (
      let end = rest.lastIndexOf('" ');
      end > 0;
      end = rest.lastIndexOf('" ', end - 1)
    ) {
      const locator = rest.slice(end + 2);
      if (LOCATOR_START.test(locator)) {
        return { value: rest.slice(1, end), locator };
      }
    }
    return rest.endsWith('"') && rest.length > 1
      ? { value: rest.slice(1, -1) }
      : { value: rest.slice(1) };
  }
}
