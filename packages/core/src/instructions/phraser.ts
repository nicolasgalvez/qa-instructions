import type {
  ActionEvent,
  CheckEvent,
  ElementTarget,
  ExpectedPattern,
  UserActionKind,
} from '../events.js';
import type { RecordedElement, SectionChanges } from '../screenshots/source.js';
import { ElementNamer, ROLE_NOUNS, type ElementName } from './element-namer.js';
import { RegionNamer } from './region-namer.js';

/** Checks about the text an element shows, which therefore cannot name it. */
const TEXT_MATCHERS: ReadonlySet<string> = new Set([
  'toHaveText',
  'toContainText',
]);

/** What the page recorded of the element an Action or check touched. */
export type RecordedFacts = {
  /** The element was a password field. */
  password?: boolean;
  element?: RecordedElement;
  /** The sections a script opened or closed, when that is all it changed. */
  sections?: SectionChanges;
};

type CheckWording = { positive: string; negative: string };

/** Element checks a tester can see, keyed by matcher. `%v` is the expected value. */
const ELEMENT_CHECKS: Record<string, CheckWording> = {
  toBeVisible: { positive: 'is visible', negative: 'is not visible' },
  toBeHidden: { positive: 'is not visible', negative: 'is visible' },
  toBeAttached: { positive: 'is on the page', negative: 'is not on the page' },
  toBeChecked: { positive: 'is checked', negative: 'is not checked' },
  toBeDisabled: { positive: 'is disabled', negative: 'is enabled' },
  toBeEnabled: { positive: 'is enabled', negative: 'is disabled' },
  toBeEditable: { positive: 'is editable', negative: 'is not editable' },
  toBeEmpty: { positive: 'is empty', negative: 'is not empty' },
  toBeFocused: { positive: 'is focused', negative: 'is not focused' },
  toHaveText: { positive: 'shows %v', negative: 'does not show %v' },
  toContainText: { positive: 'contains %v', negative: 'does not contain %v' },
  toHaveValue: { positive: 'shows %v', negative: 'does not show %v' },
  toHaveCount: {
    positive: 'appears %v times',
    negative: 'does not appear %v times',
  },
};

/** Page checks a tester can see; only worded when the expected value is known. */
const PAGE_CHECKS: Record<string, CheckWording> = {
  toHaveURL: {
    positive: 'the page address is %v',
    negative: 'the page address is not %v',
  },
  toHaveTitle: {
    positive: 'the page title is %v',
    negative: 'the page title is not %v',
  },
};

/**
 * Checks of a plain value, keyed by matcher; only worded when the author
 * described the value and the expected value is known.
 */
const VALUE_CHECKS: Record<string, CheckWording> = {
  toBe: { positive: 'is %v', negative: 'is not %v' },
  toEqual: { positive: 'is %v', negative: 'is not %v' },
  toStrictEqual: { positive: 'is %v', negative: 'is not %v' },
  toBeCloseTo: { positive: 'is %v', negative: 'is not %v' },
  toContain: { positive: 'contains %v', negative: 'does not contain %v' },
  toBeGreaterThan: {
    positive: 'is more than %v',
    negative: 'is not more than %v',
  },
  toBeGreaterThanOrEqual: {
    positive: 'is at least %v',
    negative: 'is less than %v',
  },
  toBeLessThan: { positive: 'is less than %v', negative: 'is at least %v' },
  toBeLessThanOrEqual: {
    positive: 'is at most %v',
    negative: 'is more than %v',
  },
};

/**
 * Matchers that can expect a pattern, and what they match it against when
 * the subject is the page. An element's or value's text needs no noun.
 */
const PATTERN_SUBJECTS: Record<
  CheckEvent['subject'],
  Record<string, string>
> = {
  page: { toHaveURL: 'the page address', toHaveTitle: 'the page title' },
  element: { toHaveText: '', toContainText: '', toHaveValue: '' },
  value: { toMatch: '' },
};

const CONTAINS: CheckWording = {
  positive: 'contains %v',
  negative: 'does not contain %v',
};
const MATCHES: CheckWording = {
  positive: 'matches %v',
  negative: 'does not match %v',
};

/** A pattern of plain text: nothing but literal characters and escaped punctuation. */
const PLAIN_PATTERN = /^(?:[^\\^$.*+?()[\]{}|]|\\[^A-Za-z0-9])+$/;

/**
 * Turns neutral Actions and checks into the plain-language sentences a
 * tester reads. Knows nothing about any test runner.
 */
export class StepPhraser {
  constructor(
    private readonly namer = new ElementNamer(),
    private readonly regions = new RegionNamer(namer),
  ) {}

  /**
   * The "do this" sentence for a user Action. Text typed into a password
   * field is never repeated: the tester is told to enter their password.
   */
  action(
    event: ActionEvent & { kind: UserActionKind },
    url?: string,
    field: RecordedFacts = {},
  ): string {
    const target = this.target(event.target, field);
    const value = this.emphasize(event.value ?? '');

    switch (event.kind) {
      case 'navigate':
        return `Open ${url ?? event.url ?? 'the page'}`;
      case 'click':
        return event.target ? `Click ${target}` : 'Click on the page';
      case 'doubleClick':
        return `Double-click ${target}`;
      case 'tap':
        return `Tap ${target}`;
      case 'hover':
        return `Hover over ${target}`;
      case 'fill':
      case 'type':
        if (!event.value) return `Clear ${target}`;
        return field.password
          ? `Type your password into ${target}`
          : `Type ${value} into ${target}`;
      case 'clear':
        return `Clear ${target}`;
      case 'press':
        return event.target ? `Press ${value} in ${target}` : `Press ${value}`;
      case 'check':
        return `Check ${target}`;
      case 'uncheck':
        return `Uncheck ${target}`;
      case 'select':
        return `Choose ${value} in ${target}`;
      case 'upload':
        return `Upload a file to ${target}`;
      case 'goBack':
        return 'Go back to the previous page';
      case 'goForward':
        return 'Go forward to the next page';
      case 'reload':
        return 'Reload the page';
      default: {
        const exhaustive: never = event.kind;
        throw new Error(`Unknown action kind: ${exhaustive}`);
      }
    }
  }

  /**
   * The warning a tester reads where the test changed the page with a
   * script instead of a user action.
   */
  scriptChange(event: ActionEvent, recorded: RecordedFacts = {}): string {
    const byScript = 'with a script instead of a user action.';
    const byHand =
      'If the page does not match what comes next, you may need to do something by hand to continue.';
    const target = this.target(event.target, recorded);
    const touched = event.target || recorded.element;

    if (event.kind === 'dispatch') {
      if (event.value === 'click' && touched) {
        return `The test clicked ${target} ${byScript} Click it yourself to continue.`;
      }
      const type = event.value
        ? `${/^[aeiou]/i.test(event.value) ? 'an' : 'a'} ${this.emphasize(event.value)} event`
        : 'an event';
      return `The test sent ${type} to ${target} ${byScript} ${byHand}`;
    }

    const sections = recorded.sections;
    // Only one way: a mix has no single thing to tell the tester to do.
    if (
      sections &&
      (sections.opened.length === 0) !== (sections.closed.length === 0)
    ) {
      return this.sectionChange(sections, byScript);
    }
    return touched
      ? `The test changed ${target} ${byScript} If the page does not match what comes next, change it by hand to continue.`
      : `The test changed the page ${byScript} ${byHand}`;
  }

  /**
   * A script that only opened, or only closed, collapsible sections: each is
   * named by its heading, and the tester clicks it into the same state.
   */
  private sectionChange(sections: SectionChanges, byScript: string): string {
    const opened = sections.opened.length > 0;
    const names = opened ? sections.opened : sections.closed;
    const [verb, want, unless] = opened
      ? ['opened', 'open', 'closed']
      : ['closed', 'close', 'open'];
    const several = names.length > 1;
    return (
      `The test ${verb} the ${this.list(names.map((n) => this.emphasize(n)))} ` +
      `${several ? 'sections' : 'section'} ${byScript} ` +
      `Click ${several ? 'each one' : 'it'} to ${want} it if it is ${unless}.`
    );
  }

  /** Items joined as a person writes a list: `a`, `a and b`, `a, b, and c`. */
  private list(items: string[]): string {
    if (items.length <= 2) return items.join(' and ');
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }

  /**
   * The "you should see" phrase for a check, starting lowercase so several
   * can be joined. Undefined when a tester could not see what was checked.
   */
  check(event: CheckEvent, recorded: RecordedFacts = {}): string | undefined {
    // A check the runner could not trace to the page (e.g. a locator held
    // in a variable) is still about an element if the page recorded one.
    if (event.subject === 'value' && recorded.element) {
      return this.check({ ...event, subject: 'element' }, recorded);
    }

    if (event.expected === undefined && event.expectedPattern) {
      return this.patternCheck(event, event.expectedPattern, recorded);
    }

    if (event.subject === 'value') {
      const wording = VALUE_CHECKS[event.matcher];
      if (!wording || !event.description || event.expected === undefined) {
        return undefined;
      }
      return `${this.emphasize(event.description)} ${this.fill(wording, event)}`;
    }

    if (event.subject === 'page') {
      const wording = PAGE_CHECKS[event.matcher];
      if (!wording || event.expected === undefined) return undefined;
      return this.fill(wording, event);
    }

    const wording = ELEMENT_CHECKS[event.matcher];
    const subject = this.checkedElement(event, recorded);
    if (!wording || !subject) return undefined;
    if (wording.positive.includes('%v') && event.expected === undefined) {
      return undefined;
    }
    return `${subject} ${this.fill(wording, event)}`;
  }

  /**
   * A check against a pattern. Plain text reads as what the subject must
   * contain; any other pattern is shown as written.
   */
  private patternCheck(
    event: CheckEvent,
    pattern: ExpectedPattern,
    recorded: RecordedFacts,
  ): string | undefined {
    const noun = PATTERN_SUBJECTS[event.subject][event.matcher];
    if (noun === undefined) return undefined;
    const subject =
      event.subject === 'page'
        ? noun
        : event.subject === 'element'
          ? this.checkedElement(event, recorded)
          : event.description && this.emphasize(event.description);
    if (!subject) return undefined;

    const plain = PLAIN_PATTERN.test(pattern.source);
    const text = plain
      ? pattern.source.replace(/\\(.)/g, '$1')
      : `/${pattern.source}/${pattern.flags}`;
    const wording = plain ? CONTAINS : MATCHES;
    const template = event.negated ? wording.negative : wording.positive;
    return `${subject} ${template.replace('%v', this.emphasize(text))}`;
  }

  /**
   * The checked element as a tester sees it: by the readable name the test
   * gave it, else by its name on the page as recorded, else by the author's
   * description of it, else plainly by its kind. A check about an element's
   * text never names it by that text: "The page shows **Saved**".
   */
  private checkedElement(
    event: CheckEvent,
    recorded: RecordedFacts,
  ): string | undefined {
    const { target, description } = event;
    if (!target && !recorded.element) {
      return description && this.emphasize(description);
    }
    if (this.hasReadableName(target)) return this.target(target, recorded);

    const byOwnText = !TEXT_MATCHERS.has(event.matcher);
    const name = this.namer.name(target, recorded.element, { byOwnText });
    if (description && !name.name) return this.emphasize(description);
    return this.target(target, recorded, {
      byOwnText,
      unnamed: byOwnText ? 'the element' : 'the page',
    });
  }

  /** Whether a tester could find the element from how the test named it. */
  private hasReadableName(target: ElementTarget | undefined): boolean {
    if (!target) return false;
    if (target.by === 'role') return target.name !== undefined;
    return target.by !== 'selector' && target.by !== 'testId';
  }

  /**
   * The element as a tester sees it, e.g. `the **Sign in** link`, and the
   * part of the page it is in when that tells it apart (`… in the
   * **Energy** form`). An element the test found by test id or selector is
   * named from the page as recorded (`element`), or plainly by its kind; the
   * selector itself is never shown.
   */
  target(
    target: ElementTarget | undefined,
    recorded: RecordedFacts = {},
    options: { byOwnText?: boolean; unnamed?: string } = {},
  ): string {
    const named = this.element(target, recorded, options);
    const region = this.regions.name(recorded.element);
    return region && named !== 'the page'
      ? `${named} in the ${this.emphasize(region.title)} ${region.noun}`
      : named;
  }

  private element(
    target: ElementTarget | undefined,
    { element }: RecordedFacts,
    { byOwnText = true, unnamed = 'the element' },
  ): string {
    if (!target && !element) return 'the page';
    if (!target || target.by === 'testId' || target.by === 'selector') {
      return (
        this.named(this.namer.name(target, element, { byOwnText })) ?? unnamed
      );
    }

    switch (target.by) {
      case 'role': {
        const noun = ROLE_NOUNS[target.role] ?? target.role;
        return target.name
          ? `the ${this.emphasize(target.name)} ${noun}`
          : `the ${noun}`;
      }
      case 'label':
      case 'text':
      case 'title':
        return this.emphasize(target.value);
      case 'placeholder':
        return `the ${this.emphasize(target.value)} field`;
      case 'altText':
        return `the ${this.emphasize(target.value)} image`;
      default: {
        const exhaustive: never = target;
        throw new Error(`Unknown target: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  /** `**Quantity**`, `the **Add to Cart** button`, or `the button`. */
  private named({ name, noun, field }: ElementName): string | undefined {
    if (name) {
      return field || !noun
        ? this.emphasize(name)
        : `the ${this.emphasize(name)} ${noun}`;
    }
    return noun && `the ${noun}`;
  }

  private fill(wording: CheckWording, event: CheckEvent): string {
    const template = event.negated ? wording.negative : wording.positive;
    return template.replace('%v', this.emphasize(event.expected ?? ''));
  }

  private emphasize(text: string): string {
    return `**${text}**`;
  }
}
