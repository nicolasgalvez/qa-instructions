import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRun,
  type TestEndEvent,
  type TestEvent,
  type TestStartEvent,
} from '../src/index.js';

const signIn: TestStartEvent = {
  type: 'testStart',
  id: 'sign-in-1',
  title: 'Sign in',
  runner: 'playwright',
  file: '/proj/tests/sign-in.spec.ts',
  line: 3,
  project: 'chromium',
  baseUrl: 'http://127.0.0.1:4321',
};

function attempt(
  startEvent: TestStartEvent,
  attemptNumber: number,
  status: TestEndEvent['status'],
  ...events: TestEvent[]
): TestEvent[] {
  return [
    { ...startEvent, attempt: attemptNumber },
    ...events,
    { type: 'testEnd', status },
  ];
}

function feed(run: QaInstructionsRun, ...streams: TestEvent[][]): void {
  for (const event of streams.flat()) run.handle(event);
}

test('a retried test yields one set of QA Instructions, from its last attempt', () => {
  const run = new QaInstructionsRun();
  feed(
    run,
    attempt(
      signIn,
      1,
      'failed',
      { type: 'action', kind: 'navigate', url: '/' },
      { type: 'action', kind: 'reload', failed: true },
    ),
    attempt(
      signIn,
      2,
      'passed',
      { type: 'action', kind: 'navigate', url: '/login' },
      { type: 'action', kind: 'reload' },
    ),
  );

  const results = run.results();
  assert.equal(results.length, 1);
  assert.equal(results[0].dirName, 'sign-in--sign-in');
  assert.equal(results[0].bundle.meta.status, 'complete');
  assert.deepEqual(
    results[0].bundle.steps.map((step) => step.action),
    ['Open http://127.0.0.1:4321/login', 'Reload the page'],
  );
});

test('an earlier attempt reported late never replaces a later one', () => {
  const run = new QaInstructionsRun();
  feed(
    run,
    attempt(signIn, 3, 'failed', {
      type: 'action',
      kind: 'reload',
      failed: true,
    }),
    attempt(signIn, 2, 'passed', { type: 'action', kind: 'reload' }),
  );

  const [result] = run.results();
  assert.equal(result.bundle.meta.status, 'incomplete');
});

test('different tests each yield their own QA Instructions', () => {
  const run = new QaInstructionsRun();
  feed(
    run,
    attempt(signIn, 1, 'passed'),
    attempt(
      { ...signIn, id: 'sign-out-1', title: 'Sign out', line: 9 },
      1,
      'passed',
    ),
  );

  assert.deepEqual(
    run.results().map((result) => result.dirName),
    ['sign-in--sign-in', 'sign-in--sign-out'],
  );
});

test('tests that share a title get distinct directories', () => {
  const run = new QaInstructionsRun();
  feed(
    run,
    // The same test in two projects.
    attempt(signIn, 1, 'passed'),
    attempt({ ...signIn, id: 'sign-in-2', project: 'firefox' }, 1, 'passed'),
    // Another test with the same title in the same file (another describe).
    attempt({ ...signIn, id: 'sign-in-3', line: 20 }, 1, 'passed'),
  );

  assert.deepEqual(
    run.results().map((result) => result.dirName),
    [
      'sign-in--sign-in--chromium--line-3',
      'sign-in--sign-in--firefox',
      'sign-in--sign-in--chromium--line-20',
    ],
  );
});

test('a skipped test yields no QA Instructions', () => {
  const run = new QaInstructionsRun();
  feed(
    run,
    // Skipped before it ran.
    attempt({ ...signIn, id: 'skipped', title: 'Sign up' }, 1, 'skipped'),
    // Skipped at runtime, after an Action.
    attempt(
      { ...signIn, id: 'skipped-at-runtime', title: 'Sign out' },
      1,
      'skipped',
      { type: 'action', kind: 'navigate', url: '/' },
    ),
    // Skipped on its retry: the last attempt decides.
    attempt({ ...signIn, id: 'retried' }, 1, 'failed', {
      type: 'action',
      kind: 'reload',
      failed: true,
    }),
    attempt({ ...signIn, id: 'retried' }, 2, 'skipped'),
    // The same title in another project: named as if alone.
    attempt({ ...signIn, id: 'kept', project: 'firefox' }, 1, 'passed'),
  );

  assert.deepEqual(
    run.results().map((result) => result.dirName),
    ['sign-in--sign-in'],
  );
});

test('events before any test start are ignored', () => {
  const run = new QaInstructionsRun();
  run.handle({ type: 'action', kind: 'reload' });
  run.handle({ type: 'testEnd', status: 'passed' });
  assert.deepEqual(run.results(), []);
});
