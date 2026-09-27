import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { ActionRef } from '../src/reporter/action-ref.js';
import { TraceScreenshotSource } from '../src/reporter/trace-screenshot-source.js';

/**
 * Sample traces recorded from test/fixtures/traces/scripts.spec.ts: with
 * Playwright 1.63 (format 9, DOM snapshots on) and 1.56 (format 8). Both
 * record a DOM snapshot before and after every script call.
 */
function fixture(name: string): string {
  return fileURLToPath(
    new URL(`../../test/fixtures/traces/${name}`, import.meta.url),
  );
}

// The scenario's reported `pw:api` steps: three fixture calls, then the test
// body. Titles differ by version: 1.56 adds the locator.
const STEPS = {
  '1.63': {
    trace: fixture('v9-scripts.zip'),
    navigate: ActionRef.of(4, 'Navigate'),
    read: ActionRef.of(5, 'Evaluate'),
    scrollToTop: ActionRef.of(6, 'Evaluate'),
    open: ActionRef.of(7, 'Evaluate'),
    openAgain: ActionRef.of(8, 'Evaluate'),
    showNote: ActionRef.of(9, 'Evaluate'),
    click: ActionRef.of(10, 'Click'),
  },
  '1.56': {
    trace: fixture('v8-scripts.zip'),
    navigate: ActionRef.of(4, 'Navigate to "data:"'),
    read: ActionRef.of(5, "Evaluate locator('details')"),
    scrollToTop: ActionRef.of(6, 'Evaluate'),
    open: ActionRef.of(7, "Evaluate locator('details:not([open])')"),
    openAgain: ActionRef.of(8, "Evaluate locator('details:not([open])')"),
    showNote: ActionRef.of(9, "Evaluate locator('#note')"),
    click: ActionRef.of(10, "Click getByRole('button', { name: 'Save' })"),
  },
};

for (const [version, steps] of Object.entries(STEPS)) {
  test(`Playwright ${version}: the trace says which scripts changed the page`, async () => {
    const source = await TraceScreenshotSource.open(steps.trace);
    const changed = (ref: string) => source.capture(ref)?.pageChanged;

    assert.equal(changed(steps.read), false, 'a script that only reads');
    assert.equal(
      changed(steps.scrollToTop),
      false,
      'scrolling a page already at the top',
    );
    assert.equal(changed(steps.open), true, 'opening a collapsed section');
    assert.equal(
      changed(steps.openAgain),
      false,
      'the same script with nothing collapsed',
    );
    assert.equal(
      changed(steps.showNote),
      true,
      'a script whose result is used',
    );
  });

  test(`Playwright ${version}: the trace says which Actions were forced, however their options were built`, async () => {
    const source = await TraceScreenshotSource.open(steps.trace);

    assert.equal(source.capture(steps.click)?.forced, true);
    assert.equal(source.capture(steps.navigate)?.forced, false);
  });
}

test('without DOM snapshots, the trace does not say whether a script changed the page', async () => {
  const source = await TraceScreenshotSource.open(fixture('v9.zip'));
  for (const ref of [
    ActionRef.of(4, 'Navigate'),
    ActionRef.of(5, 'Fill "Ada"'),
  ]) {
    assert.equal(source.capture(ref)?.pageChanged, undefined);
  }
});
