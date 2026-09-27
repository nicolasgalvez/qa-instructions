import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GOLDENS, normalizeRendered, root } from './goldens.mjs';

for (const { rendered, golden } of GOLDENS) {
  await mkdir(path.dirname(path.join(root, golden)), { recursive: true });
  const content = await readFile(path.join(root, rendered), 'utf8');
  await writeFile(
    path.join(root, golden),
    normalizeRendered(rendered, content),
    'utf8',
  );
  console.log(`update-goldens: wrote ${golden}`);
}
