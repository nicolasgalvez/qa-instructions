import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import type { QaRunBundle } from '@qa-instructions/core';

import QaInstructionsReporter from '../src/reporter/index.js';

/**
 * Reporter steps recorded from the derived-steps example on Playwright 1.56
 * and 1.63 (see test/fixtures/steps/step-dump-reporter.mjs). Their source
 * locations point at the spec copies next to them.
 */
const STEPS = fileURLToPath(
  new URL('../../test/fixtures/steps/', import.meta.url),
);

type DumpedStep = {
  title: string;
  category: string;
  subtitle?: string;
  params?: Record<string, unknown>;
  location?: { file: string; line: number; column: number };
  error?: { message: string };
  steps?: DumpedStep[];
};

function toStep(dumped: DumpedStep): TestStep {
  return {
    ...dumped,
    location: dumped.location && {
      ...dumped.location,
      file: path.join(STEPS, dumped.location.file),
    },
    steps: (dumped.steps ?? []).map(toStep),
  } as unknown as TestStep;
}

/** Playwright 1.53–1.54 title a check with its matcher alone: `toBeVisible`, `not toBeHidden`. */
function as153(dumped: DumpedStep): DumpedStep {
  return {
    ...dumped,
    title:
      dumped.category === 'expect'
        ? dumped.title.replace(/^Expect "(.*)"$/, '$1')
        : dumped.title,
    steps: dumped.steps?.map(as153),
  };
}

async function bundleFrom(
  version: string,
  recording: string,
  rewrite: (step: DumpedStep) => DumpedStep = (step) => step,
): Promise<QaRunBundle> {
  const recorded = JSON.parse(
    await readFile(path.join(STEPS, version, `${recording}.json`), 'utf8'),
  ) as { title: string; steps: DumpedStep[] };
  const dump = { ...recorded, steps: recorded.steps.map(rewrite) };

  const out = await mkdtemp(path.join(tmpdir(), 'qa-versions-'));
  const warn = console.warn;
  console.warn = () => {};
  try {
    const reporter = new QaInstructionsReporter({ outputDir: out });
    reporter.onBegin({ version } as never);
    reporter.onTestEnd(
      {
        id: recording,
        title: dump.title,
        tags: [],
        location: { file: path.join(STEPS, 'x.spec.ts'), line: 1, column: 1 },
        parent: {
          project: () => ({
            name: '',
            use: { baseURL: 'http://127.0.0.1:4321' },
          }),
        },
      } as unknown as TestCase,
      {
        status: 'passed',
        retry: 0,
        attachments: [],
        steps: dump.steps.map(toStep),
      } as unknown as TestResult,
    );
    await reporter.onEnd();
    const [dir] = await readdir(out);
    return JSON.parse(
      await readFile(path.join(out, dir, 'bundle.json'), 'utf8'),
    ) as QaRunBundle;
  } finally {
    console.warn = warn;
    await rm(out, { recursive: true, force: true });
  }
}

const qaSteps = (bundle: QaRunBundle) =>
  bundle.steps.map(
    ({ action, expected, section, warning, approximate, url }) => ({
      action,
      expected,
      section,
      warning,
      approximate,
      url,
    }),
  );

for (const recording of [
  'sign-in-with-bad-credentials',
  'sign-in-with-good-credentials',
  'read-the-faq',
  'subscribe-to-the-newsletter',
]) {
  test(`Playwright 1.56 yields the same QA Steps as 1.63: ${recording}`, async () => {
    assert.deepEqual(
      qaSteps(await bundleFrom('1.56', recording)),
      qaSteps(await bundleFrom('1.63', recording)),
    );
  });
}

test('Playwright 1.53 check titles (matcher alone) give the same QA Steps', async () => {
  assert.deepEqual(
    qaSteps(await bundleFrom('1.56', 'sign-in-with-bad-credentials', as153)),
    qaSteps(await bundleFrom('1.63', 'sign-in-with-bad-credentials')),
  );
});

/** Playwright 1.57–1.62 title a check with its locator after the matcher. */
function as162(dumped: DumpedStep): DumpedStep {
  const locator: Record<string, string> = {
    '15:5': "getByRole('heading', { name: 'Fixture App' })",
    '19:45': "getByLabel('Username')",
    '30:55': "getByText('Invalid credentials')",
    '33:9': "getByRole('heading', { name: 'Login failed' })",
  };
  const at =
    dumped.location && `${dumped.location.line}:${dumped.location.column}`;
  return {
    ...dumped,
    title: at && locator[at] ? `${dumped.title} ${locator[at]}` : dumped.title,
    // The locator is in the title; the source is not needed.
    location:
      dumped.category === 'expect' && at && locator[at]
        ? undefined
        : dumped.location,
    steps: dumped.steps?.map(as162),
  };
}

test('Playwright 1.62 check titles (with the locator) give the same QA Steps', async () => {
  assert.deepEqual(
    qaSteps(await bundleFrom('1.56', 'sign-in-with-bad-credentials', as162)),
    qaSteps(await bundleFrom('1.63', 'sign-in-with-bad-credentials')),
  );
});

test('Playwright 1.56 step titles and call sites give full QA Steps', async () => {
  const bundle = await bundleFrom('1.56', 'sign-in-with-bad-credentials');
  assert.deepEqual(
    bundle.steps.map(({ action, expected }) => ({ action, expected })),
    [
      {
        action: 'Open http://127.0.0.1:4321/',
        expected: 'The **Fixture App** heading is visible',
      },
      {
        action: 'Click the **Sign in** link',
        expected: 'The page title is **Sign in**; **Username** is empty',
      },
      {
        action:
          'The test changed the page with a script instead of a user action. If the page does not match what comes next, you may need to do something by hand to continue.',
        expected: undefined,
      },
      { action: 'Type **demo-user** into **Username**', expected: undefined },
      {
        action: 'Click the **Submit bad credentials** button',
        expected:
          '**Invalid credentials** is visible; the **Login failed** heading is visible',
      },
      { action: 'Press **Tab**', expected: undefined },
    ],
  );
});
