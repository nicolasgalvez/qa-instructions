import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** Rendered QA Instructions and the golden file each must equal. */
export const GOLDENS = [
  {
    rendered: 'qa-steps-out/sign-in--sign-in-with-bad-credentials.txt',
    golden: 'golden/sign-in--sign-in-with-bad-credentials.txt',
  },
  // A test with no groups reads the same under every test.step presentation.
  {
    rendered: 'qa-steps-out/collapse/sign-in--sign-in-with-bad-credentials.txt',
    golden: 'golden/sign-in--sign-in-with-bad-credentials.txt',
  },
  {
    rendered: 'qa-steps-out/ignore/sign-in--sign-in-with-bad-credentials.txt',
    golden: 'golden/sign-in--sign-in-with-bad-credentials.txt',
  },
  // One golden per test.step presentation: sections (default), collapse, ignore.
  {
    rendered: 'qa-steps-out/grouped--sign-in-with-good-credentials.txt',
    golden: 'golden/grouped--sign-in-with-good-credentials.txt',
  },
  {
    rendered:
      'qa-steps-out/collapse/grouped--sign-in-with-good-credentials.txt',
    golden: 'golden/collapse/grouped--sign-in-with-good-credentials.txt',
  },
  {
    rendered: 'qa-steps-out/ignore/grouped--sign-in-with-good-credentials.txt',
    golden: 'golden/ignore/grouped--sign-in-with-good-credentials.txt',
  },
  // Deliberately failing tests, run with retries (playwright.failing.config.ts).
  ...[
    'failing--sign-in-shows-the-wrong-user',
    'failing--sign-in-with-a-missing-link',
    'failing--setup-fails-before-any-step',
    'failing--flaky-sign-in-passes-on-retry',
  ].map((name) => ({
    rendered: `qa-steps-out/failing/${name}.txt`,
    golden: `golden/failing/${name}.txt`,
  })),
];
