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
  // A password field and a configured mask pattern: both masked.
  {
    rendered: 'qa-steps-out/login--sign-in-with-a-password.txt',
    golden: 'golden/login--sign-in-with-a-password.txt',
  },
  {
    rendered: 'qa-steps-out/scripted-page--read-the-faq.txt',
    golden: 'golden/scripted-page--read-the-faq.txt',
  },
  {
    rendered: 'qa-steps-out/scripted-page--subscribe-to-the-newsletter.txt',
    golden: 'golden/scripted-page--subscribe-to-the-newsletter.txt',
  },
  // Markdown and HTML for bundles covering screenshots, a warning step,
  // nested Sections, an approximate step, and an incomplete (failed) test.
  ...[
    'sign-in--sign-in-with-bad-credentials',
    'grouped--sign-in-with-good-credentials',
    'scripted-page--subscribe-to-the-newsletter',
    'failing/failing--sign-in-shows-the-wrong-user',
  ].flatMap((name) =>
    ['md', 'html'].map((ext) => ({
      rendered: `qa-steps-out/${name}.${ext}`,
      golden: `golden/${name}.${ext}`,
      bundleDir: `qa-runs/${name}`,
    })),
  ),
  {
    rendered: 'qa-steps-out/moving-ui--register-a-warranty-from-the-menu.txt',
    golden: 'golden/moving-ui--register-a-warranty-from-the-menu.txt',
  },
  // Checks with the author's messages, on values read into variables.
  {
    rendered: 'qa-steps-out/cart--add-credits-to-the-cart.txt',
    golden: 'golden/cart--add-credits-to-the-cart.txt',
  },
  // A field and button far below the fold: Playwright scrolls to each.
  {
    rendered:
      'qa-steps-out/long-page--order-boots-from-the-bottom-of-the-page.txt',
    golden: 'golden/long-page--order-boots-from-the-bottom-of-the-page.txt',
  },
];

const DATA_URI = /data:image\/png;base64,[A-Za-z0-9+/=]+/g;

/**
 * Rendered output as its golden stores it. Screenshot bytes can differ between
 * machines, so HTML goldens keep a placeholder for each embedded image; the
 * images themselves are checked against the bundle's assets instead.
 */
export function normalizeRendered(file, content) {
  return file.endsWith('.html')
    ? content.replace(DATA_URI, 'data:image/png;base64,…')
    : content;
}

/**
 * What tests/login.spec.ts types: into a password field, and a value matching
 * the config's `mask` pattern. Neither may appear in any file written under
 * these directories.
 */
export const SECRETS = [
  'correct-horse-battery-staple',
  'tester@qa.example.com',
];
export const OUTPUT_DIRS = ['qa-runs', 'qa-steps-out'];

/**
 * Hand-written expectations for each bundle's Step Screenshots: one per QA
 * Step, taken at the expected moment, with the Highlight marks it should
 * carry and pixel probes on known elements and on the Highlight itself.
 */
export const SCREENSHOT_GOLDENS = [
  'golden/sign-in--sign-in-with-bad-credentials.screenshots.json',
  'golden/scripted-page--subscribe-to-the-newsletter.screenshots.json',
  'golden/moving-ui--register-a-warranty-from-the-menu.screenshots.json',
  'golden/moving-ui--highlight-styles.screenshots.json',
  'golden/long-page--order-boots-from-the-bottom-of-the-page.screenshots.json',
];
