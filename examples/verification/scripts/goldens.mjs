import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FixtureOrigin,
  fixtureOrigin,
} from '@qa-instructions/fixture-site/origin';

export const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

export const goldenDir = path.join(root, 'golden');

export const bundleDirName = 'capture--login-error-flow';

/** Rendered QA Steps text and the golden file it must equal. */
export const QA_STEPS = {
  rendered: path.join(root, 'qa-steps-out', `${bundleDirName}.txt`),
  golden: path.join(goldenDir, 'qa-steps.txt'),
};

/** Collected bundle and the golden file it must equal once normalized. */
export const BUNDLE = {
  collected: path.join(root, 'qa-runs', bundleDirName, 'bundle.json'),
  golden: path.join(goldenDir, 'bundle.json'),
};

/** Drops run-specific fields (timestamp, absolute path, host) from a bundle. */
export function normalizeBundle(raw) {
  const bundle = structuredClone(raw);
  delete bundle.meta.capturedAt;
  if (bundle.meta.source?.testFile) {
    const file = bundle.meta.source.testFile.replace(/\\/g, '/');
    const marker = 'examples/verification/tests/';
    const idx = file.indexOf(marker);
    bundle.meta.source.testFile =
      idx >= 0 ? file.slice(idx) : path.basename(file);
  }
  for (const step of bundle.steps) {
    if (step.url) {
      step.url = step.url.replace(
        /^https?:\/\/[^/]+/,
        FixtureOrigin.canonical.url,
      );
    }
  }
  return bundle;
}

/** A bundle as its golden stores it: on the canonical fixture-site port. */
export async function readNormalizedBundle(filePath) {
  const text = fixtureOrigin.canonicalize(await readFile(filePath, 'utf8'));
  return normalizeBundle(JSON.parse(text));
}

/** The rendered QA Steps as the golden stores them: on the canonical port. */
export async function readRenderedQaSteps() {
  return fixtureOrigin.canonicalize(await readFile(QA_STEPS.rendered, 'utf8'));
}
