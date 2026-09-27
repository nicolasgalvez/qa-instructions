import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import type {
  ActionEvent,
  ActionKind,
  CheckEvent,
  TestEvent,
  TestStartEvent,
} from '@qa-instructions/core';

import { LocatorParser } from './locator-parser.js';

/** Playwright `pw:api` step titles (the part before any quoted value) → neutral kinds. */
const ACTION_KINDS: Record<string, ActionKind> = {
  Navigate: 'navigate',
  Click: 'click',
  'Double click': 'doubleClick',
  Tap: 'tap',
  Hover: 'hover',
  Fill: 'fill',
  Type: 'type',
  Insert: 'type',
  Press: 'press',
  Check: 'check',
  Uncheck: 'uncheck',
  'Select option': 'select',
  'Set input files': 'upload',
  'Go back': 'goBack',
  'Go forward': 'goForward',
  Reload: 'reload',
  'Wait for timeout': 'wait',
  'Wait for selector': 'wait',
  'Wait for function': 'wait',
  'Wait for state': 'wait',
  'Wait for event': 'wait',
  'Wait for navigation': 'wait',
  'Wait for load state': 'wait',
  'Wait for URL': 'wait',
  Evaluate: 'script',
  'Add init script': 'script',
  'Add script tag': 'script',
  'Dispatch event': 'script',
  Dispatch: 'script',
  'Get text content': 'read',
  'Get inner text': 'read',
  'Get input value': 'read',
  'Get attribute': 'read',
  'Get HTML': 'read',
  'Get content': 'read',
  'Get page title': 'read',
  GET: 'request',
  POST: 'request',
  PUT: 'request',
  PATCH: 'request',
  DELETE: 'request',
  HEAD: 'request',
  'Launch browser': 'setup',
  'Create context': 'setup',
  'Create page': 'setup',
  'Close context': 'setup',
  'Close page': 'setup',
  'Close browser': 'setup',
};

/** Matchers whose subject is the page rather than an element. */
const PAGE_MATCHERS = new Set(['toHaveURL', 'toHaveTitle']);

const EXPECT_TITLE = /^Expect "(not )?([A-Za-z]+)"$/;

/**
 * Playwright adapter for the core's inbound port: translates one test's
 * reporter steps (Playwright 1.63 title, subtitle, params, category) into the
 * neutral test event stream.
 */
export class PlaywrightStepTranslator {
  constructor(private readonly locators = new LocatorParser()) {}

  translate(test: TestCase, result: TestResult): TestEvent[] {
    return [
      this.testStart(test),
      ...this.translateSteps(result.steps),
      { type: 'testEnd', status: result.status },
    ];
  }

  testStart(test: TestCase): TestStartEvent {
    const project = test.parent.project();
    const baseURL = project?.use?.baseURL;

    return {
      type: 'testStart',
      title: test.title,
      runner: 'playwright',
      file: test.location.file,
      tags: [...test.tags],
      project: project?.name || undefined,
      baseUrl: typeof baseURL === 'string' ? baseURL : undefined,
    };
  }

  private translateSteps(steps: TestStep[]): TestEvent[] {
    return steps.flatMap((step): TestEvent[] => {
      switch (step.category) {
        case 'pw:api':
          return [this.action(step)];
        case 'expect': {
          const check = this.check(step);
          return check ? [check] : [];
        }
        case 'test.step':
          return [
            { type: 'groupStart', title: step.title },
            ...this.translateSteps(step.steps),
            { type: 'groupEnd', title: step.title },
          ];
        default:
          // Hook and fixture steps wrap the calls a test makes, including
          // calls made inside helpers and user fixtures.
          return this.translateSteps(step.steps);
      }
    });
  }

  private action(step: TestStep): ActionEvent {
    const params = this.params(step);
    const verb = step.title.split(' "')[0];
    return {
      type: 'action',
      kind: ACTION_KINDS[verb] ?? 'other',
      target: this.locators.parse(this.locator(step)),
      value: this.text(params.value ?? params.text ?? params.key),
      url:
        this.text(params.url) ??
        (verb === 'Navigate' ? step.subtitle : undefined),
    };
  }

  private check(step: TestStep): CheckEvent | undefined {
    const match = EXPECT_TITLE.exec(step.title);
    if (!match) return undefined;

    const [, not, matcher] = match;
    const target = this.locators.parse(this.locator(step));
    return {
      type: 'check',
      matcher,
      negated: Boolean(not),
      subject: target
        ? 'element'
        : PAGE_MATCHERS.has(matcher)
          ? 'page'
          : 'value',
      target,
      expected: this.text(this.params(step).expected),
    };
  }

  private locator(step: TestStep): string | undefined {
    return this.text(this.params(step).locator) ?? step.subtitle;
  }

  private params(step: TestStep): Record<string, unknown> {
    return step.params ?? {};
  }

  /** A value a person can read, or undefined for objects such as regexes. */
  private text(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      return value.join(', ');
    }
    return undefined;
  }
}
