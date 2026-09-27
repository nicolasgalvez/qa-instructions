import { copyFile, mkdir, writeFile } from 'node:fs/promises';

import {
  BUNDLE,
  QA_STEPS,
  goldenDir,
  readNormalizedBundle,
} from './goldens.mjs';

await mkdir(goldenDir, { recursive: true });

const bundle = await readNormalizedBundle(BUNDLE.collected);
await writeFile(BUNDLE.golden, `${JSON.stringify(bundle, null, 2)}\n`);
await copyFile(QA_STEPS.rendered, QA_STEPS.golden);

console.log(`update-goldens: wrote ${goldenDir}`);
