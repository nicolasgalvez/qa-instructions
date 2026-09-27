import assert from 'node:assert/strict';
import test from 'node:test';

import { StepTitleParser } from '../src/reporter/step-title.js';

const parser = new StepTitleParser();

// Titles as Playwright 1.56 reports them (see test/fixtures/steps/1.56): the
// action's verb, its quoted value, then the locator it acted on.
test('a 1.56 title is split into verb, value, and locator', () => {
  assert.deepEqual(parser.parse('Navigate to "/faq"'), {
    verb: 'Navigate',
    value: '/faq',
  });
  assert.deepEqual(
    parser.parse("Click getByRole('link', { name: 'Sign in' })"),
    { verb: 'Click', locator: "getByRole('link', { name: 'Sign in' })" },
  );
  assert.deepEqual(parser.parse('Fill "demo-user" getByLabel(\'Username\')'), {
    verb: 'Fill',
    value: 'demo-user',
    locator: "getByLabel('Username')",
  });
  assert.deepEqual(parser.parse('Press "Tab"'), {
    verb: 'Press',
    value: 'Tab',
  });
  assert.deepEqual(
    parser.parse(
      "Dispatch \"click\" getByRole('button', { name: 'Show contact details' })",
    ),
    {
      verb: 'Dispatch',
      value: 'click',
      locator: "getByRole('button', { name: 'Show contact details' })",
    },
  );
  assert.deepEqual(parser.parse("Evaluate locator('details')"), {
    verb: 'Evaluate',
    locator: "locator('details')",
  });
  assert.deepEqual(parser.parse('GET "/"'), { verb: 'GET', value: '/' });
  assert.deepEqual(parser.parse('Wait for timeout'), {
    verb: 'Wait for timeout',
  });
  assert.deepEqual(parser.parse("Check getByLabel('Remember me')"), {
    verb: 'Check',
    locator: "getByLabel('Remember me')",
  });
});

test('the longest known verb wins', () => {
  assert.deepEqual(parser.parse("Double click getByText('Row')"), {
    verb: 'Double click',
    locator: "getByText('Row')",
  });
  assert.deepEqual(parser.parse("Select option getByLabel('Size')"), {
    verb: 'Select option',
    locator: "getByLabel('Size')",
  });
});

test('a quoted value may itself contain quotes', () => {
  assert.deepEqual(
    parser.parse('Fill "say "hi" to them" getByLabel(\'Message\')'),
    {
      verb: 'Fill',
      value: 'say "hi" to them',
      locator: "getByLabel('Message')",
    },
  );
  assert.deepEqual(parser.parse('Type "a" b"'), {
    verb: 'Type',
    value: 'a" b',
  });
});

test('a 1.63 title (value only, locator in the subtitle) reads the same way', () => {
  assert.deepEqual(parser.parse('Fill "demo-user"'), {
    verb: 'Fill',
    value: 'demo-user',
  });
  assert.deepEqual(parser.parse('Click'), { verb: 'Click' });
  assert.deepEqual(parser.parse('Navigate'), { verb: 'Navigate' });
});

test('an unknown title is kept whole as its verb', () => {
  assert.deepEqual(parser.parse("Scroll into view getByText('x')"), {
    verb: "Scroll into view getByText('x')",
  });
});
