import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { root } from './goldens.mjs';

// playwright.selection.config.ts selects tests tagged `@qa`: only the tagged
// test's bundle may exist, although every test in selection.spec.ts ran.
const expected = ['selection--open-the-home-page'];

const actual = (
  await readdir(path.join(root, 'qa-runs-selection'), { withFileTypes: true })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

try {
  assert.deepEqual(actual, expected);
} catch {
  console.error(
    `verify-selection: expected bundles ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
  );
  process.exit(1);
}
console.log('verify-selection: ok (only the tagged test produced a bundle)');
