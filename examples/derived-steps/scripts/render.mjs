import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { root } from './goldens.mjs';

// Renders existing bundles, without re-running tests, to every format the
// goldens cover. Arguments are `<bundle-dir>:<out-dir>` pairs.

const FORMATS = ['qa-steps', 'markdown', 'html'];
const cli = path.join(
  root,
  '..',
  '..',
  'packages',
  'qa-instructions',
  'dist',
  'cli',
  'index.js',
);

for (const pair of process.argv.slice(2)) {
  const [input, out] = pair.split(':');
  for (const format of FORMATS) {
    const run = spawnSync(
      process.execPath,
      [cli, 'render', input, '--format', format, '--out', out],
      { cwd: root, stdio: 'inherit' },
    );
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
}
