import type {
  ActionEvent,
  CheckEvent,
  ElementTarget,
  UserActionKind,
} from '../events.js';

/** Words a tester uses for common ARIA roles. */
const ROLE_NOUNS: Record<string, string> = {
  button: 'button',
  link: 'link',
  heading: 'heading',
  textbox: 'field',
  searchbox: 'search field',
  combobox: 'dropdown',
  listbox: 'list',
  option: 'option',
  checkbox: 'checkbox',
  radio: 'option',
  switch: 'switch',
  tab: 'tab',
  menuitem: 'menu item',
  img: 'image',
  dialog: 'dialog',
  alert: 'alert',
  navigation: 'navigation',
  row: 'row',
  cell: 'cell',
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
 * Turns neutral Actions and checks into the plain-language sentences a
 * tester reads. Knows nothing about any test runner.
 */
export class StepPhraser {
  /**
   * The "do this" sentence for a user Action. Text typed into a password
   * field is never repeated: the tester is told to enter their password.
   */
  action(
    event: ActionEvent & { kind: UserActionKind },
    url?: string,
    field: { password?: boolean } = {},
  ): string {
    const target = this.target(event.target);
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
  scriptChange(event: ActionEvent): string {
    const byScript = 'with a script instead of a user action.';
    const byHand =
      'If the page does not match what comes next, you may need to do something by hand to continue.';
    const target = this.target(event.target);

    if (event.kind === 'dispatch') {
      if (event.value === 'click' && event.target) {
        return `The test clicked ${target} ${byScript} Click it yourself to continue.`;
      }
      const type = event.value
        ? `${/^[aeiou]/i.test(event.value) ? 'an' : 'a'} ${this.emphasize(event.value)} event`
        : 'an event';
      return `The test sent ${type} to ${target} ${byScript} ${byHand}`;
    }

    return event.target
      ? `The test changed ${target} ${byScript} If the page does not match what comes next, change it by hand to continue.`
      : `The test changed the page ${byScript} ${byHand}`;
  }

  /**
   * The "you should see" phrase for a check, starting lowercase so several
   * can be joined. Undefined when a tester could not see what was checked.
   */
  check(event: CheckEvent): string | undefined {
    if (event.subject === 'value') return undefined;

    if (event.subject === 'page') {
      const wording = PAGE_CHECKS[event.matcher];
      if (!wording || event.expected === undefined) return undefined;
      return this.fill(wording, event);
    }

    const wording = ELEMENT_CHECKS[event.matcher];
    if (!wording || !event.target) return undefined;
    if (wording.positive.includes('%v') && event.expected === undefined) {
      return undefined;
    }
    return `${this.target(event.target)} ${this.fill(wording, event)}`;
  }

  /** The element as a tester sees it, e.g. `the **Sign in** link`. */
  target(target: ElementTarget | undefined): string {
    if (!target) return 'the page';

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
      case 'testId':
        return `the ${this.emphasize(target.value.replace(/[-_]+/g, ' '))} element`;
      case 'selector':
        return `the ${this.emphasize(target.value)} element`;
      default: {
        const exhaustive: never = target;
        throw new Error(`Unknown target: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  private fill(wording: CheckWording, event: CheckEvent): string {
    const template = event.negated ? wording.negative : wording.positive;
    return template.replace('%v', this.emphasize(event.expected ?? ''));
  }

  private emphasize(text: string): string {
    return `**${text}**`;
  }
}
