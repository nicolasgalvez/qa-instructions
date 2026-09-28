import assert from 'node:assert/strict';
import test from 'node:test';

import { TestSelection, type TestStartEvent } from '../../src/core/index.js';

function start(overrides: Partial<TestStartEvent> = {}): TestStartEvent {
  return {
    type: 'testStart',
    title: 'Sign in',
    runner: 'playwright',
    file: '/proj/tests/auth/sign-in.spec.ts',
    tags: [],
    ...overrides,
  };
}

test('with no selection configured, every test is selected', () => {
  const selection = new TestSelection();
  assert.equal(selection.includes(start()), true);
  assert.equal(selection.includes(start({ file: undefined })), true);
  assert.equal(new TestSelection({}).includes(start()), true);
  assert.equal(
    new TestSelection({ tags: [], files: [] }).includes(start()),
    true,
  );
});

test('a tag selection selects only tests with one of those tags', () => {
  const selection = new TestSelection({ tags: ['@qa', '@smoke'] });
  assert.equal(selection.includes(start({ tags: ['@qa'] })), true);
  assert.equal(selection.includes(start({ tags: ['@slow', '@smoke'] })), true);
  assert.equal(selection.includes(start({ tags: ['@slow'] })), false);
  assert.equal(selection.includes(start({ tags: [] })), false);
  assert.equal(selection.includes(start({ tags: undefined })), false);
});

test('tags match exactly', () => {
  const selection = new TestSelection({ tags: ['@qa'] });
  assert.equal(selection.includes(start({ tags: ['@qa-later'] })), false);
  assert.equal(selection.includes(start({ tags: ['qa'] })), false);
});

test('a file-pattern selection selects only tests in matching files', () => {
  const selection = new TestSelection({ files: ['**/auth/**'] });
  assert.equal(selection.includes(start()), true);
  assert.equal(
    selection.includes(start({ file: '/proj/tests/cart/checkout.spec.ts' })),
    false,
  );
  assert.equal(selection.includes(start({ file: undefined })), false);
});

test('a relative file pattern matches the end of the test file path', () => {
  const selection = new TestSelection({
    files: ['auth/sign-in.spec.ts', 'cart/*.spec.ts'],
  });
  assert.equal(selection.includes(start()), true);
  assert.equal(
    selection.includes(start({ file: '/proj/tests/cart/checkout.spec.ts' })),
    true,
  );
  assert.equal(
    selection.includes(start({ file: '/proj/tests/unauth/sign-in.spec.ts' })),
    false,
  );
});

test('an absolute file pattern matches the whole path', () => {
  const selection = new TestSelection({ files: ['/proj/tests/auth/*.ts'] });
  assert.equal(selection.includes(start()), true);
  assert.equal(
    selection.includes(start({ file: '/other/proj/tests/auth/sign-in.ts' })),
    false,
  );
});

test('Windows test file paths match forward-slash patterns', () => {
  const selection = new TestSelection({ files: ['auth/*.spec.ts'] });
  assert.equal(
    selection.includes(
      start({ file: 'C:\\proj\\tests\\auth\\sign-in.spec.ts' }),
    ),
    true,
  );
});

test('with tags and files both configured, a test must match both', () => {
  const selection = new TestSelection({
    tags: ['@qa'],
    files: ['auth/**'],
  });
  assert.equal(selection.includes(start({ tags: ['@qa'] })), true);
  assert.equal(selection.includes(start({ tags: [] })), false);
  assert.equal(
    selection.includes(
      start({ tags: ['@qa'], file: '/proj/tests/cart/checkout.spec.ts' }),
    ),
    false,
  );
});
