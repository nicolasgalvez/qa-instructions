import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/** The derived-steps example this one reruns on Playwright 1.56. */
export const derivedSteps = path.join(root, '..', 'derived-steps');

/** The derived-steps tests rerun here, unchanged. */
export const SPECS = [
  'sign-in.spec.ts',
  'grouped.spec.ts',
  'scripted-page.spec.ts',
  'login.spec.ts',
  'moving-ui.spec.ts',
  'cart.spec.ts',
  'long-page.spec.ts',
  'certificates.spec.ts',
];

/** Each test's bundle and the derived-steps (Playwright 1.63) golden it must match. */
export const GOLDENS = [
  'sign-in--sign-in-with-bad-credentials',
  'grouped--sign-in-with-good-credentials',
  'scripted-page--read-the-faq',
  'scripted-page--open-collapsed-sections-on-a-page-without-any',
  'scripted-page--subscribe-to-the-newsletter',
  'login--sign-in-with-a-password',
  'moving-ui--register-a-warranty-from-the-menu',
  'cart--add-credits-to-the-cart',
  'long-page--order-boots-from-the-bottom-of-the-page',
  'long-page--order-gift-cards-on-a-smoothly-scrolling-page',
  'certificates--add-three-recs-to-the-cart',
];

/**
 * Copies the derived-steps tests into ./tests. They must live in this
 * package so they load its Playwright (1.56), not derived-steps' (1.63).
 */
export async function syncSpecs() {
  const tests = path.join(root, 'tests');
  await mkdir(tests, { recursive: true });
  for (const spec of SPECS) {
    await copyFile(
      path.join(derivedSteps, 'tests', spec),
      path.join(tests, spec),
    );
  }
}
