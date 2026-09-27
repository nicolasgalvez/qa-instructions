import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { GOLDENS, root } from './goldens.mjs';

for (const { rendered, golden } of GOLDENS) {
  await mkdir(path.dirname(path.join(root, golden)), { recursive: true });
  await copyFile(path.join(root, rendered), path.join(root, golden));
  console.log(`update-goldens: wrote ${golden}`);
}
