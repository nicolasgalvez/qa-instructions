import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import type { QaRunBundle } from '@qa-instructions/core';

import QaInstructionsReporter, {
  type QaInstructionsReporterOptions,
} from '../src/reporter/index.js';

type StepSpec = {
  category: string;
  title: string;
  subtitle?: string;
  params?: Record<string, unknown>;
  error?: { message: string };
  location?: { file: string; line: number; column: number };
  steps?: StepSpec[];
};

type Attempt = {
  status?: TestResult['status'];
  retry?: number;
  steps: StepSpec[];
  attachments?: TestResult['attachments'];
};

function step(spec: StepSpec): TestStep {
  return {
    ...spec,
    steps: (spec.steps ?? []).map(step),
  } as unknown as TestStep;
}

function mockTestCase(tags: string[] = []): TestCase {
  return {
    id: 'test-1',
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

async function runAttempts(
  attempts: Attempt[],
  options: QaInstructionsReporterOptions = {},
): Promise<{
  dirs: string[];
  bundle: QaRunBundle;
  assetFiles: string[];
}> {
  const out = await mkdtemp(path.join(tmpdir(), 'qa-reporter-'));
  try {
    const reporter = new QaInstructionsReporter({ ...options, outputDir: out });
    for (const {
      status = 'passed',
      retry = 0,
      steps,
      attachments = [],
    } of attempts) {
      await reporter.onTestEnd(mockTestCase(), {
        status,
        retry,
        attachments,
        steps: steps.map(step),
      } as unknown as TestResult);
    }
    await reporter.onEnd();
    const dir = path.join(out, 'sign-in--sign-in-with-bad-credentials');
    const raw = await readFile(path.join(dir, 'bundle.json'), 'utf8');
    return {
      dirs: await readdir(out),
      bundle: JSON.parse(raw) as QaRunBundle,
      assetFiles: (await readdir(path.join(dir, 'assets'))).sort(),
    };
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

async function runReporter(
  steps: StepSpec[],
  options: QaInstructionsReporterOptions = {},
): Promise<QaRunBundle> {
  return (await runAttempts([{ steps }], options)).bundle;
}

const navigate: StepSpec = {
  category: 'pw:api',
  title: 'Navigate',
  subtitle: '/',
  params: { url: '/' },
};
const clickSignIn: StepSpec = {
  category: 'pw:api',
  title: 'Click',
  subtitle: "getByRole('link', { name: 'Sign in' })",
  params: { locator: "getByRole('link', { name: 'Sign in' })" },
};
const closeContext: StepSpec = {
  category: 'hook',
  title: 'After Hooks',
  steps: [{ category: 'pw:api', title: 'Close context' }],
};

test('a failed test yields QA Steps up to the failing step, marked incomplete', async () => {
  const { bundle } = await runAttempts([
    {
      status: 'failed',
      steps: [
        navigate,
        {
          category: 'test.step',
          title: 'sign in',
          error: { message: 'Timeout' },
          steps: [{ ...clickSignIn, error: { message: 'Timeout' } }],
        },
        closeContext,
      ],
    },
  ]);
  assert.equal(bundle.meta.status, 'incomplete');
  assert.deepEqual(
    bundle.steps.map(({ index, action, failed }) => ({
      index,
      action,
      failed,
    })),
    [
      { index: 1, action: 'Open http://127.0.0.1:4321/', failed: undefined },
      { index: 2, action: 'Click the **Sign in** link', failed: true },
    ],
  );
});

test('a failed check marks its QA Step as the failing step', async () => {
  const { bundle } = await runAttempts([
    {
      status: 'failed',
      steps: [
        navigate,
        {
          category: 'expect',
          title: 'Expect "toHaveTitle"',
          params: { expected: 'Home' },
          error: { message: 'Expected Home' },
        },
        clickSignIn,
      ],
    },
  ]);
  assert.deepEqual(
    bundle.steps.map(({ expected, failed }) => ({ expected, failed })),
    [{ expected: 'The page title is **Home**', failed: true }],
  );
});

test('an error thrown outside any browser call still ends the QA Steps', async () => {
  const { bundle } = await runAttempts([
    {
      status: 'failed',
      steps: [
        {
          category: 'test.step',
          title: 'open the app',
          error: { message: 'boom' },
          steps: [navigate],
        },
        {
          category: 'hook',
          title: 'After Hooks',
          steps: [clickSignIn],
        },
      ],
    },
  ]);
  assert.equal(bundle.meta.status, 'incomplete');
  assert.deepEqual(
    bundle.steps.map(({ action, failed }) => ({ action, failed })),
    [{ action: 'Open http://127.0.0.1:4321/', failed: undefined }],
  );
});

test('a retried test yields one set of QA Instructions from its last attempt', async () => {
  const { dirs, bundle } = await runAttempts([
    {
      status: 'failed',
      retry: 0,
      steps: [{ ...navigate, error: { message: 'net::ERR' } }],
    },
    { status: 'passed', retry: 1, steps: [navigate, clickSignIn] },
  ]);
  assert.deepEqual(dirs, ['sign-in--sign-in-with-bad-credentials']);
  assert.equal(bundle.meta.status, 'complete');
  assert.equal(bundle.steps.length, 2);
});

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
        // No call site to tell whether the script only read the page.
        index: 3,
        action:
          'The test changed the page with a script instead of a user action. If the page does not match what comes next, you may need to do something by hand to continue.',
        expected: undefined,
        url: undefined,
      },
      {
        index: 4,
        action: 'Type **demo-user** into **Username**',
        expected: undefined,
        url: undefined,
      },
      {
        index: 5,
        action: 'Click the **submit** button',
        expected: "**It's broken** is visible",
        url: undefined,
      },
      {
        index: 6,
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
    await reporter.onEnd();
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

const groupedSteps: StepSpec[] = [
  {
    category: 'hook',
    title: 'Before Hooks',
    steps: [
      {
        category: 'fixture',
        title: 'Fixture "page"',
        steps: [{ category: 'pw:api', title: 'Create page' }],
      },
    ],
  },
  {
    category: 'test.step',
    title: 'Open the sign-in form',
    steps: [
      { category: 'pw:api', title: 'Navigate', params: { url: '/login' } },
      {
        category: 'test.step',
        title: 'Enter credentials',
        steps: [
          {
            category: 'pw:api',
            title: 'Fill "demo-user"',
            params: { locator: "getByLabel('Username')", value: 'demo-user' },
          },
        ],
      },
    ],
  },
  { category: 'pw:api', title: 'Reload' },
];

const sectionsOf = (bundle: QaRunBundle) =>
  bundle.steps.map(({ action, section }) => ({ action, section }));

test('reporter turns test.step groups into Sections by default', async () => {
  assert.deepEqual(sectionsOf(await runReporter(groupedSteps)), [
    {
      action: 'Open http://127.0.0.1:4321/login',
      section: ['Open the sign-in form'],
    },
    {
      action: 'Type **demo-user** into **Username**',
      section: ['Open the sign-in form', 'Enter credentials'],
    },
    { action: 'Reload the page', section: undefined },
  ]);
});

test('reporter passes the testSteps presentation option to the core', async () => {
  assert.deepEqual(
    sectionsOf(await runReporter(groupedSteps, { testSteps: 'collapse' })),
    [
      { action: 'Open the sign-in form', section: undefined },
      { action: 'Reload the page', section: undefined },
    ],
  );
  assert.equal(
    (await runReporter(groupedSteps, { testSteps: 'ignore' })).steps.length,
    3,
  );
});

test('reporter warns where the test changed the page by script and marks forced Actions', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-spec-'));
  const file = path.join(dir, 'faq.spec.ts');
  const lines = [
    `test('FAQ', async ({ page }) => {`,
    `  await page.locator('details:not([open])').evaluateAll((els) => els.forEach((d) => (d.open = true)));`,
    `  const count = await page.locator('details').evaluateAll((els) => els.length);`,
    `  await page.getByRole('button', { name: 'Show contact details' }).dispatchEvent('click');`,
    `  await page.getByRole('button', { name: 'Subscribe' }).click({ force: true });`,
    `});`,
  ];
  await writeFile(file, lines.join('\n'));
  const at = (line: number, method: string) => ({
    file,
    line,
    column: lines[line - 1].indexOf(`${method}(`) + 1,
  });

  try {
    const bundle = await runReporter([
      {
        category: 'pw:api',
        title: 'Evaluate',
        subtitle: "locator('details:not([open])')",
        params: { locator: "locator('details:not([open])')" },
        location: at(2, 'evaluateAll'),
      },
      {
        category: 'pw:api',
        title: 'Evaluate',
        subtitle: "locator('details')",
        params: { locator: "locator('details')" },
        location: at(3, 'evaluateAll'),
      },
      {
        category: 'pw:api',
        title: 'Dispatch "click"',
        subtitle: "getByRole('button', { name: 'Show contact details' })",
        params: {
          locator: "getByRole('button', { name: 'Show contact details' })",
          type: 'click',
        },
        location: at(4, 'dispatchEvent'),
      },
      {
        category: 'pw:api',
        title: 'Click',
        subtitle: "getByRole('button', { name: 'Subscribe' })",
        params: { locator: "getByRole('button', { name: 'Subscribe' })" },
        location: at(5, 'click'),
      },
    ]);

    assert.deepEqual(
      bundle.steps.map(({ action, warning, approximate }) => ({
        action,
        warning,
        approximate,
      })),
      [
        {
          action:
            'The test changed the **details:not([open])** element with a script instead of a user action. If the page does not match what comes next, change it by hand to continue.',
          warning: true,
          approximate: undefined,
        },
        {
          action:
            'The test clicked the **Show contact details** button with a script instead of a user action. Click it yourself to continue.',
          warning: true,
          approximate: undefined,
        },
        {
          action: 'Click the **Subscribe** button',
          warning: undefined,
          approximate: true,
        },
      ],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const sampleTrace: TestResult['attachments'] = [
  {
    name: 'trace',
    contentType: 'application/zip',
    path: fileURLToPath(
      new URL('../../test/fixtures/traces/v9.zip', import.meta.url),
    ),
  },
];

// The reporter steps of test/fixtures/traces/scenario.spec.ts.
const sampleSteps: StepSpec[] = [
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
        title: 'Fixture "context"',
        steps: [{ category: 'pw:api', title: 'Create context' }],
      },
      {
        category: 'fixture',
        title: 'Fixture "page"',
        steps: [{ category: 'pw:api', title: 'Create page' }],
      },
    ],
  },
  { category: 'pw:api', title: 'Navigate', params: { url: 'data:text/html,' } },
  {
    category: 'expect',
    title: 'Expect "toBeVisible"',
    params: { locator: "getByRole('button', { name: 'Paint' })" },
  },
  {
    category: 'test.step',
    title: 'fill in the form',
    steps: [
      {
        category: 'pw:api',
        title: 'Fill "Ada"',
        params: { locator: "getByLabel('Name')", value: 'Ada' },
      },
    ],
  },
  { category: 'expect', title: 'Expect "toBe"', params: { expected: 'Paint' } },
  {
    category: 'pw:api',
    title: 'Click',
    params: { locator: "getByRole('button', { name: 'Paint' })" },
  },
  { category: 'pw:api', title: 'Press "Tab"', params: { key: 'Tab' } },
  closeContext,
];

test('with the trace setting on, each QA Step gets a Step Screenshot from the trace', async () => {
  const { bundle, assetFiles } = await runAttempts([
    { steps: sampleSteps, attachments: sampleTrace },
  ]);

  assert.deepEqual(
    bundle.steps.map(({ action, assetIds, screenshotMoment }) => ({
      action,
      assetIds,
      screenshotMoment,
    })),
    [
      {
        action: 'Open data:text/html,',
        assetIds: ['step-01'],
        screenshotMoment: 'after',
      },
      {
        action: 'Type **Ada** into **Name**',
        assetIds: ['step-02'],
        screenshotMoment: 'action',
      },
      {
        action: 'Click the **Paint** button',
        assetIds: ['step-03'],
        screenshotMoment: 'action',
      },
      {
        action: 'Press **Tab**',
        assetIds: ['step-04'],
        screenshotMoment: 'action',
      },
    ],
  );
  assert.deepEqual(assetFiles, [
    'step-01.png',
    'step-02.png',
    'step-03.png',
    'step-04.png',
  ]);
  assert.deepEqual(bundle.steps[2].elementBox, {
    x: 40,
    y: 40,
    width: 120,
    height: 40,
  });
  assert.deepEqual(bundle.steps[2].clickPoint, { x: 100, y: 60 });
});

function highlights(bundle: QaRunBundle) {
  return bundle.steps.map(
    (step) => bundle.assets[step.assetIds?.[0] ?? '']?.highlight,
  );
}

test('Step Screenshots are highlighted by default: an outline, and the click point for clicks', async () => {
  const { bundle } = await runAttempts([
    { steps: sampleSteps, attachments: sampleTrace },
  ]);

  assert.deepEqual(highlights(bundle), [
    // Navigation and key presses touch no element.
    undefined,
    ['outline'],
    ['outline', 'clickDot'],
    undefined,
  ]);
  assert.deepEqual(bundle.steps[2].viewport, { width: 400, height: 300 });
});

// The same scenario on Playwright 1.56 (trace format 8), whose step titles
// carry the details and whose trace has only a screen recording.
const v8Trace: TestResult['attachments'] = [
  {
    name: 'trace',
    contentType: 'application/zip',
    path: fileURLToPath(
      new URL('../../test/fixtures/traces/v8.zip', import.meta.url),
    ),
  },
];
const v8Steps: StepSpec[] = [
  sampleSteps[0],
  { category: 'pw:api', title: 'Navigate to "data:"' },
  {
    category: 'test.step',
    title: 'fill in the form',
    steps: [{ category: 'pw:api', title: `Fill "Ada" getByLabel('Name')` }],
  },
  {
    category: 'pw:api',
    title: `Click getByRole('button', { name: 'Paint' })`,
  },
  { category: 'pw:api', title: 'Press "Tab"' },
  closeContext,
];

test('on Playwright 1.56 a click is marked at its click point on the frame from the moment it was made', async () => {
  const { bundle } = await runAttempts([
    { steps: v8Steps, attachments: v8Trace },
  ]);

  assert.deepEqual(
    bundle.steps.map((step) => step.screenshotMoment),
    ['after', 'after', 'action', 'after'],
  );
  // The 1.56 trace records no element box, so there is no outline.
  assert.deepEqual(highlights(bundle), [
    undefined,
    undefined,
    ['clickDot'],
    undefined,
  ]);
  assert.deepEqual(bundle.steps[2].clickPoint, { x: 100, y: 60 });
  assert.equal(bundle.steps[2].elementBox, undefined);
});

test('reporter passes the highlight style option to the core', async () => {
  const badge = await runAttempts(
    [{ steps: sampleSteps, attachments: sampleTrace }],
    { highlight: ['outline', 'badge'] },
  );
  assert.deepEqual(highlights(badge.bundle)[2], ['outline', 'badge']);

  const none = await runAttempts(
    [{ steps: sampleSteps, attachments: sampleTrace }],
    { highlight: 'none' },
  );
  assert.deepEqual(highlights(none.bundle), [
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  assert.equal(none.assetFiles.length, 4);
});

test('Step Screenshots come from the trace of the attempt that is kept', async () => {
  const lastHasTrace = await runAttempts([
    { status: 'failed', retry: 0, steps: sampleSteps },
    { retry: 1, steps: sampleSteps, attachments: sampleTrace },
  ]);
  assert.equal(lastHasTrace.assetFiles.length, 4);

  const onlyFirstHasTrace = await runAttempts([
    {
      status: 'failed',
      retry: 0,
      steps: sampleSteps,
      attachments: sampleTrace,
    },
    { retry: 1, steps: sampleSteps },
  ]);
  assert.deepEqual(onlyFirstHasTrace.assetFiles, []);
  assert.equal(onlyFirstHasTrace.bundle.steps[0].assetIds, undefined);
});

// The reporter steps of test/fixtures/traces/password.spec.ts.
const passwordSteps: StepSpec[] = [
  sampleSteps[0],
  { category: 'pw:api', title: 'Navigate', params: { url: 'data:text/html,' } },
  {
    category: 'pw:api',
    title: 'Fill "Ada"',
    params: { locator: "getByLabel('Name')", value: 'Ada' },
  },
  {
    category: 'pw:api',
    title: 'Fill "hunter2"',
    params: { locator: "getByLabel('Password')", value: 'hunter2' },
  },
  {
    category: 'expect',
    title: 'Expect "toHaveValue"',
    params: { locator: "getByLabel('Password')", expected: 'hunter2' },
  },
  {
    category: 'pw:api',
    title: 'Click',
    params: { locator: "getByRole('button', { name: 'Sign in' })" },
  },
  closeContext,
];

/** Every file the reporter wrote, as text. */
async function writtenText(dir: string): Promise<string> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const texts = await Promise.all(
    files.map((file) =>
      readFile(path.join(file.parentPath, file.name), 'latin1'),
    ),
  );
  return texts.join('\n');
}

test('a value typed into a password field, as the trace recorded the page, is never written', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'qa-reporter-'));
  try {
    const reporter = new QaInstructionsReporter({ outputDir: out });
    await reporter.onTestEnd(mockTestCase(), {
      status: 'passed',
      retry: 0,
      attachments: [
        {
          name: 'trace',
          contentType: 'application/zip',
          path: fileURLToPath(
            new URL('../../test/fixtures/traces/v9-dom.zip', import.meta.url),
          ),
        },
      ],
      steps: passwordSteps.map(step),
    } as unknown as TestResult);
    await reporter.onEnd();

    const bundle = JSON.parse(
      await readFile(
        path.join(out, 'sign-in--sign-in-with-bad-credentials', 'bundle.json'),
        'utf8',
      ),
    ) as QaRunBundle;
    assert.deepEqual(
      bundle.steps.map(({ action, expected }) => ({ action, expected })),
      [
        { action: 'Open data:text/html,', expected: undefined },
        { action: 'Type **Ada** into **Name**', expected: undefined },
        {
          action: 'Type your password into **Password**',
          expected: '**Password** shows **[masked]**',
        },
        { action: 'Click the **Sign in** button', expected: undefined },
      ],
    );
    assert.ok(!(await writtenText(out)).includes('hunter2'));
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('reporter masks the values and patterns in its mask option', async () => {
  const bundle = await runReporter(
    [
      navigate,
      {
        category: 'pw:api',
        title: 'Fill "qa@example.com"',
        params: { locator: "getByLabel('Email')", value: 'qa@example.com' },
      },
      {
        category: 'pw:api',
        title: 'Fill "sk-live-123"',
        params: { locator: "getByLabel('API key')", value: 'sk-live-123' },
      },
    ],
    { mask: ['sk-live-123', /[\w.+-]+@example\.com/] },
  );
  assert.deepEqual(
    bundle.steps.map((s) => s.action),
    [
      'Open http://127.0.0.1:4321/',
      'Type **[masked]** into **Email**',
      'Type **[masked]** into **API key**',
    ],
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
    await reporter.onEnd();
  } finally {
    console.warn = warn;
  }
});

/**
 * Runs two tests through a reporter on the given Playwright version and
 * returns what it warned, plus the first bundle's assets.
 */
async function warningsOfRun(
  version: string,
  attachments: TestResult['attachments'] = [],
): Promise<{ warnings: string[]; assetFiles: string[]; steps: number }> {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: unknown) => warnings.push(String(message));
  const out = await mkdtemp(path.join(tmpdir(), 'qa-reporter-'));
  try {
    const reporter = new QaInstructionsReporter({ outputDir: out });
    reporter.onBegin({ version } as never);
    for (const title of ['first', 'second']) {
      reporter.onTestEnd(
        { ...mockTestCase(), id: title, title } as TestCase,
        {
          status: 'passed',
          retry: 0,
          attachments,
          steps: sampleSteps.map(step),
        } as unknown as TestResult,
      );
    }
    await reporter.onEnd();
    const dir = path.join(out, (await readdir(out)).sort()[0]);
    const bundle = JSON.parse(
      await readFile(path.join(dir, 'bundle.json'), 'utf8'),
    ) as QaRunBundle;
    return {
      warnings,
      assetFiles: await readdir(path.join(dir, 'assets')),
      steps: bundle.steps.length,
    };
  } finally {
    console.warn = warn;
    await rm(out, { recursive: true, force: true });
  }
}

test('without the trace setting, QA Instructions are text only and one warning names the line to add', async () => {
  const { warnings, assetFiles, steps } = await warningsOfRun('1.63.0');
  assert.equal(steps, 4);
  assert.deepEqual(assetFiles, []);
  assert.equal(warnings.length, 1);
  assert.match(
    warnings[0],
    /use: \{ trace: \{ mode: 'on', snapshots: \{ screen: true, dom: true \} \} \}/,
  );
});

test('before Playwright 1.63, the warning names the older trace setting', async () => {
  const { warnings } = await warningsOfRun('1.56.1');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /use: \{ trace: 'on' \}/);
  assert.doesNotMatch(warnings[0], /snapshots/);
});

test('an unknown trace format yields text-only QA Instructions and one warning', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-future-trace-'));
  try {
    const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate');
    const entries = unzipSync(await readFile(sampleTrace[0].path as string));
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith('.trace')) {
        entries[name] = strToU8(
          strFromU8(data).replaceAll('"version":9,', '"version":99,'),
        );
      }
    }
    const future = path.join(dir, 'trace.zip');
    await writeFile(future, zipSync(entries));

    const { warnings, assetFiles, steps } = await warningsOfRun('1.99.0', [
      { name: 'trace', contentType: 'application/zip', path: future },
    ]);
    assert.equal(steps, 4);
    assert.deepEqual(assetFiles, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /trace format version 99/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('with a supported trace there is nothing to warn about', async () => {
  const { warnings, assetFiles } = await warningsOfRun('1.63.0', sampleTrace);
  assert.deepEqual(warnings, []);
  assert.equal(assetFiles.length, 4);
});

test('an error in any reporter hook never reaches the test run and is logged once', async () => {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: unknown) => warnings.push(String(message));
  try {
    const broken = {
      testStart: () => {
        throw new Error('broken translator');
      },
    } as unknown as ConstructorParameters<typeof QaInstructionsReporter>[1];
    const reporter = new QaInstructionsReporter({}, broken);
    reporter.onBegin(undefined as never);
    for (const title of ['first', 'second']) {
      reporter.onTestEnd(
        { ...mockTestCase(), title } as TestCase,
        {
          status: 'passed',
          retry: 0,
          attachments: [],
          steps: [],
        } as unknown as TestResult,
      );
    }
    await reporter.onEnd();
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /broken translator/);
});

test('bad reporter options never stop the test run', async () => {
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (message: unknown) => warnings.push(String(message));
  const out = await mkdtemp(path.join(tmpdir(), 'qa-reporter-'));
  try {
    const reporter = new QaInstructionsReporter({
      outputDir: out,
      select: { files: 'tests/*.spec.ts' },
    } as unknown as QaInstructionsReporterOptions);
    reporter.onTestEnd(mockTestCase(), {
      status: 'passed',
      retry: 0,
      attachments: [],
      steps: [step(navigate)],
    } as unknown as TestResult);
    await reporter.onEnd();
    // The bad option is ignored: every test is selected.
    assert.equal((await readdir(out)).length, 1);
  } finally {
    console.warn = warn;
    await rm(out, { recursive: true, force: true });
  }
  assert.equal(warnings.filter((w) => /select/.test(w)).length, 1);
});
