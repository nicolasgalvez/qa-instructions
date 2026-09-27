import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { GOLDENS, root } from './goldens.mjs';

let failed = false;

for (const { rendered, golden } of GOLDENS) {
  const actualPath = path.join(root, rendered);
  const goldenPath = path.join(root, golden);

  let actual;
  try {
    actual = await readFile(actualPath, 'utf8');
  } catch (error) {
    console.error(
      `verify-run: missing rendered output ${rendered}: ${error.message}`,
    );
    failed = true;
    continue;
  }

  const expected = await readFile(goldenPath, 'utf8');
  if (actual !== expected) {
    failed = true;
    console.error(`verify-run: ${rendered} does not match ${golden}`);
    console.error('--- expected ---');
    console.error(expected);
    console.error('--- actual ---');
    console.error(actual);
  }
}

if (failed) process.exit(1);
console.log(`verify-run: ok (${GOLDENS.length} golden file(s))`);
