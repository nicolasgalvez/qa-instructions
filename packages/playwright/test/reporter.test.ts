import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import type { QaRunBundle } from '@qa-instructions/core';

import QaInstructionsReporter from '../src/reporter/index.js';

type StepSpec = {
  category: string;
  title: string;
  subtitle?: string;
  params?: Record<string, unknown>;
  steps?: StepSpec[];
};

function step(spec: StepSpec): TestStep {
  return {
    ...spec,
    steps: (spec.steps ?? []).map(step),
  } as unknown as TestStep;
}

function mockTestCase(tags: string[] = []): TestCase {
  return {
    title: 'Sign in with bad credentials',
    tags,
    location: { file: '/proj/tests/sign-in.spec.ts', line: 1, column: 1 },
    parent: {
      project: () => ({
        name: 'chromium',
        use: { baseURL: 'http://127.0.0.1:4321' },
      }),
    },
  } as unknown as TestCase;
}

async function runReporter(steps: StepSpec[]): Promise<QaRunBundle> {
  const out = await mkdtemp(path.join(tmpdir(), 'qa-reporter-'));
  try {
    const reporter = new QaInstructionsReporter({ outputDir: out });
    await reporter.onTestEnd(mockTestCase(), {
      status: 'passed',
      retry: 0,
      attachments: [],
      steps: steps.map(step),
    } as unknown as TestResult);
    const raw = await readFile(
      path.join(out, 'sign-in--sign-in-with-bad-credentials', 'bundle.json'),
      'utf8',
    );
    return JSON.parse(raw) as QaRunBundle;
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

test('reporter derives QA Steps from an unmodified test run', async () => {
  const bundle = await runReporter([
    {
      category: 'hook',
      title: 'Before Hooks',
      steps: [
        {
          category: 'fixture',
          title: 'Fixture "browser"',
          steps: [{ category: 'pw:api', title: 'Launch browser' }],
        },
        {
          category: 'fixture',
          title: 'Fixture "page"',
          steps: [{ category: 'pw:api', title: 'Create page' }],
        },
      ],
    },
    {
      category: 'pw:api',
      title: 'Navigate',
      subtitle: '/',
      params: { url: '/' },
    },
    {
      category: 'expect',
      title: 'Expect "toHaveText"',
      subtitle: "getByTestId('step-marker')",
      params: { locator: "getByTestId('step-marker')", expected: 'STEP 1' },
    },
    {
      category: 'pw:api',
      title: 'Click',
      subtitle: "getByRole('link', { name: 'Sign in' })",
      params: { locator: "getByRole('link', { name: 'Sign in' })" },
    },
    {
      category: 'pw:api',
      title: 'Wait for timeout',
      params: { timeout: 10 },
    },
    {
      category: 'expect',
      title: 'Expect "toContain"',
      params: { expected: 'LOGIN' },
    },
    { category: 'pw:api', title: 'Evaluate' },
    {
      category: 'pw:api',
      title: 'GET',
      subtitle: '/',
      params: { url: '/', method: 'GET' },
    },
    {
      category: 'test.step',
      title: 'submit the form',
      steps: [
        {
          category: 'pw:api',
          title: 'Fill "demo-user"',
          subtitle: "getByLabel('Username')",
          params: { locator: "getByLabel('Username')", value: 'demo-user' },
        },
        {
          category: 'pw:api',
          title: 'Click',
          subtitle:
            "locator('form').getByRole('button', { name: /submit/i }).first()",
          params: {
            locator:
              "locator('form').getByRole('button', { name: /submit/i }).first()",
          },
        },
      ],
    },
    {
      category: 'expect',
      title: 'Expect "toHaveURL"',
      params: { expected: {} },
    },
    {
      category: 'expect',
      title: 'Expect "not toBeHidden"',
      subtitle: "getByText('It\\'s broken')",
      params: { locator: "getByText('It\\'s broken')" },
    },
    { category: 'pw:api', title: 'Press "Tab"', params: { key: 'Tab' } },
    {
      category: 'hook',
      title: 'After Hooks',
      steps: [{ category: 'pw:api', title: 'Close context' }],
    },
  ]);

  assert.equal(bundle.meta.title, 'Sign in with bad credentials');
  assert.equal(bundle.meta.status, 'complete');
  assert.equal(bundle.meta.source?.project, 'chromium');
  assert.deepEqual(
    bundle.steps.map(({ index, action, expected, url }) => ({
      index,
      action,
      expected,
      url,
    })),
    [
      {
        index: 1,
        action: 'Open http://127.0.0.1:4321/',
        expected: 'The **step marker** element shows **STEP 1**',
        url: 'http://127.0.0.1:4321/',
      },
      {
        index: 2,
        action: 'Click the **Sign in** link',
        expected: undefined,
        url: undefined,
      },
      {
        index: 3,
        action: 'Type **demo-user** into **Username**',
        expected: undefined,
        url: undefined,
      },
      {
        index: 4,
        action: 'Click the **submit** button',
        expected: "**It's broken** is visible",
        url: undefined,
      },
      {
        index: 5,
        action: 'Press **Tab**',
        expected: undefined,
        url: undefined,
      },
    ],
  );
});

async function bundleDirsAfterRun(
  options: ConstructorParameters<typeof QaInstructionsReporter>[0],
  tags: string[],
): Promise<string[]> {
  const out = await mkdtemp(path.join(tmpdir(), 'qa-reporter-'));
  try {
    const reporter = new QaInstructionsReporter({ ...options, outputDir: out });
    await reporter.onTestEnd(mockTestCase(tags), {
      status: 'passed',
      retry: 0,
      attachments: [],
      steps: [
        step({ category: 'pw:api', title: 'Navigate', params: { url: '/' } }),
      ],
    } as unknown as TestResult);
    return await readdir(out);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

test('reporter selects tests by the tags Playwright reports', async () => {
  const select = { tags: ['@qa'] };
  assert.deepEqual(await bundleDirsAfterRun({ select }, ['@qa']), [
    'sign-in--sign-in-with-bad-credentials',
  ]);
  assert.deepEqual(await bundleDirsAfterRun({ select }, ['@slow']), []);
});

test('reporter selects tests by the test file Playwright reports', async () => {
  assert.deepEqual(
    await bundleDirsAfterRun({ select: { files: ['tests/sign-in.*'] } }, []),
    ['sign-in--sign-in-with-bad-credentials'],
  );
  assert.deepEqual(
    await bundleDirsAfterRun({ select: { files: ['**/cart/**'] } }, []),
    [],
  );
});

test('reporter never throws into the test run', async () => {
  const reporter = new QaInstructionsReporter({
    outputDir: '/dev/null/cannot-write-here',
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    await reporter.onTestEnd(mockTestCase(), {
      status: 'passed',
      retry: 0,
      attachments: [],
      steps: [
        step({ category: 'pw:api', title: 'Navigate', params: { url: '/' } }),
      ],
    } as unknown as TestResult);
  } finally {
    console.warn = warn;
  }
});
