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
];
