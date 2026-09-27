import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QaInstructionsRecorder,
  QaInstructionsRun,
  SecretMasker,
  renderJson,
  renderQaSteps,
  type ActionCapture,
  type ActionEvent,
  type CheckEvent,
  type QaInstructionsRecorderOptions,
  type QaRunBundle,
  type ScreenshotSource,
  type TestEvent,
  type TestStartEvent,
} from '../src/index.js';

const PASSWORD = 'correct-horse-battery';
const MASK = SecretMasker.MASK;

/** A screenshot source that only knows which Actions touched a password field. */
class FieldSource implements ScreenshotSource {
  constructor(private readonly passwordFields: Record<string, boolean>) {}

  capture(ref: string): ActionCapture | undefined {
    const passwordField = this.passwordFields[ref];
    return passwordField === undefined
      ? undefined
      : { screenshots: [], passwordField };
  }
}

const start: TestStartEvent = {
  type: 'testStart',
  title: 'Sign in',
  runner: 'playwright',
  file: '/proj/tests/sign-in.spec.ts',
  baseUrl: 'http://127.0.0.1:4321',
};

function record(
  source: ScreenshotSource,
  events: TestEvent[],
  options?: QaInstructionsRecorderOptions,
  testStart: TestStartEvent = start,
): QaRunBundle {
  const recorder = new QaInstructionsRecorder(options);
  for (const event of [
    testStart,
    ...events,
    { type: 'testEnd', status: 'passed' } as TestEvent,
  ]) {
    recorder.handle(event);
  }
  return recorder.toRecording(source).bundle;
}

/** Every format a bundle is written or rendered in. */
function everyOutput(bundle: QaRunBundle): string {
  return [renderJson(bundle), renderQaSteps(bundle)].join('\n');
}

const fill = (label: string, value: string, ref: string): ActionEvent => ({
  type: 'action',
  kind: 'fill',
  target: { by: 'label', value: label },
  value,
  ref,
});

const shows = (label: string, expected: string): CheckEvent => ({
  type: 'check',
  matcher: 'toHaveValue',
  negated: false,
  subject: 'element',
  target: { by: 'label', value: label },
  expected,
});

test('a value typed into a password field is masked, and the step still says to enter the password', () => {
  const bundle = record(new FieldSource({ user: false, pass: true }), [
    fill('Username', 'demo-user', 'user'),
    fill('Password', PASSWORD, 'pass'),
    shows('Password', PASSWORD),
  ]);

  assert.deepEqual(
    bundle.steps.map(({ action, expected }) => ({ action, expected })),
    [
      { action: 'Type **demo-user** into **Username**', expected: undefined },
      {
        action: 'Type your password into **Password**',
        expected: `**Password** shows **${MASK}**`,
      },
    ],
  );
  assert.ok(!everyOutput(bundle).includes(PASSWORD));
});

test('typing a password key by key is masked the same way', () => {
  const bundle = record(new FieldSource({ pass: true }), [
    { ...fill('Password', PASSWORD, 'pass'), kind: 'type' },
  ]);
  assert.equal(bundle.steps[0].action, 'Type your password into **Password**');
});

test('a password is masked wherever else it appears in the test', () => {
  const bundle = record(new FieldSource({ pass: true, again: false }), [
    fill('Password', PASSWORD, 'pass'),
    // Typed again into a plain field, and echoed by a later check and URL.
    fill('Confirm', PASSWORD, 'again'),
    {
      type: 'check',
      matcher: 'toHaveURL',
      negated: false,
      subject: 'page',
      expected: `http://127.0.0.1:4321/login?password=${PASSWORD}`,
    },
    { type: 'action', kind: 'navigate', url: `/welcome?p=${PASSWORD}` },
  ]);

  assert.ok(!everyOutput(bundle).includes(PASSWORD));
  assert.equal(bundle.steps[1].action, `Type **${MASK}** into **Confirm**`);
  assert.equal(bundle.steps[2].url, `http://127.0.0.1:4321/welcome?p=${MASK}`);
});

test('a password typed inside a collapsed group is masked', () => {
  const bundle = record(
    new FieldSource({ user: false, pass: true }),
    [
      { type: 'groupStart', title: 'Sign in' },
      fill('Username', 'demo-user', 'user'),
      fill('Password', PASSWORD, 'pass'),
      shows('Password', PASSWORD),
      { type: 'groupEnd', title: 'Sign in' },
    ],
    { sections: 'collapse' },
  );

  assert.deepEqual(
    bundle.steps.map(({ action, expected }) => ({ action, expected })),
    [{ action: 'Sign in', expected: `**Password** shows **${MASK}**` }],
  );
});

test('non-secret typed values are shown as-is', () => {
  const bundle = record(new FieldSource({ user: false }), [
    fill('Username', 'demo-user', 'user'),
    shows('Username', 'demo-user'),
  ]);
  assert.equal(bundle.steps[0].action, 'Type **demo-user** into **Username**');
  assert.equal(bundle.steps[0].expected, '**Username** shows **demo-user**');
});

test('pressing a key in a password field is not a secret', () => {
  const bundle = record(new FieldSource({ pass: true, enter: true }), [
    fill('Password', PASSWORD, 'pass'),
    {
      type: 'action',
      kind: 'press',
      target: { by: 'label', value: 'Password' },
      value: 'Enter',
      ref: 'enter',
    },
  ]);
  assert.equal(bundle.steps[1].action, 'Press **Enter** in **Password**');
});

test('values matching configured mask patterns are masked wherever they would appear', () => {
  const masker = new SecretMasker(['sk-live-123', /[\w.+-]+@example\.com/]);
  const bundle = record(
    new FieldSource({}),
    [
      { type: 'groupStart', title: 'Sign in as qa@example.com' },
      fill('Email', 'qa@example.com', 'email'),
      fill('API key', 'sk-live-123', 'key'),
      shows('API key', 'sk-live-123'),
      { type: 'action', kind: 'navigate', url: '/keys/sk-live-123' },
      { type: 'groupEnd', title: 'Sign in as qa@example.com' },
    ],
    { masker },
    { ...start, title: 'Sign in as qa@example.com' },
  );

  const output = everyOutput(bundle);
  assert.ok(!output.includes('sk-live-123'));
  assert.ok(!output.includes('qa@example.com'));
  assert.equal(bundle.meta.title, `Sign in as ${MASK}`);
  assert.equal(bundle.meta.source?.testTitle, `Sign in as ${MASK}`);
  assert.deepEqual(bundle.steps[0].section, [`Sign in as ${MASK}`]);
  assert.equal(bundle.steps[0].action, `Type **${MASK}** into **Email**`);
  assert.equal(bundle.steps[1].expected, `**API key** shows **${MASK}**`);
  assert.equal(bundle.steps[2].url, `http://127.0.0.1:4321/keys/${MASK}`);
});

test('if the field type cannot be determined, configured patterns still apply', () => {
  const masker = new SecretMasker([/sk-\w+/]);
  const events: TestEvent[] = [
    fill('Password', PASSWORD, 'pass'),
    fill('API key', 'sk-abc', 'key'),
  ];
  // No capture at all (no trace), and a capture without DOM snapshots.
  for (const source of [
    new FieldSource({}),
    {
      capture: (): ActionCapture => ({ screenshots: [] }),
    } satisfies ScreenshotSource,
  ]) {
    const bundle = record(source, events, { masker });
    assert.deepEqual(
      bundle.steps.map((step) => step.action),
      [
        `Type **${PASSWORD}** into **Password**`,
        `Type **${MASK}** into **API key**`,
      ],
    );
  }
});

test('text-only QA Instructions apply configured patterns too', () => {
  const recorder = new QaInstructionsRecorder({
    masker: new SecretMasker(['hunter2']),
  });
  for (const event of [
    start,
    fill('Password', 'hunter2', 'pass'),
    { type: 'testEnd', status: 'passed' } as TestEvent,
  ]) {
    recorder.handle(event);
  }
  assert.equal(
    recorder.toBundle().steps[0].action,
    `Type **${MASK}** into **Password**`,
  );
});

test('a bundle directory is not named after a configured secret', () => {
  const masker = new SecretMasker([/[\w.+-]+@example\.com/]);
  const run = new QaInstructionsRun(
    () => new QaInstructionsRecorder({ masker }),
    undefined,
    masker,
  );
  for (const event of [
    { ...start, title: 'Sign in as qa@example.com' },
    { type: 'testEnd', status: 'passed' } as TestEvent,
  ]) {
    run.handle(event);
  }
  const [result] = run.results();
  assert.ok(!result.dirName.includes('example'), result.dirName);
});

test('SecretMasker masks every occurrence, longest value first', () => {
  const masker = new SecretMasker(['abc', /x\d/]).withValues(['abcdef', '']);
  assert.equal(
    masker.mask('abcdef abc x1 x2 y'),
    `${MASK} ${MASK} ${MASK} ${MASK} y`,
  );
});

test('SecretMasker ignores patterns that match empty text', () => {
  const masker = new SecretMasker([/z*/]);
  assert.equal(masker.mask('plain zz text'), `plain ${MASK} text`);
});

test('SecretMasker with nothing configured leaves text alone', () => {
  assert.equal(new SecretMasker().mask('anything'), 'anything');
});
