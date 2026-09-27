import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { QaAssetInput, QaRunBundle } from '../model.js';

const BUNDLE_FILENAME = 'bundle.json';
const ASSETS_DIR = 'assets';

export async function writeBundle(
  dir: string,
  bundle: QaRunBundle,
  assetData: QaAssetInput[],
): Promise<void> {
  await mkdir(path.join(dir, ASSETS_DIR), { recursive: true });

  for (const asset of assetData) {
    await writeFile(path.join(dir, ASSETS_DIR, asset.filename), asset.data);
  }

  await writeFile(
    path.join(dir, BUNDLE_FILENAME),
    JSON.stringify(bundle, null, 2),
    'utf8',
  );
}

export async function readBundle(dir: string): Promise<QaRunBundle> {
  const raw = await readFile(path.join(dir, BUNDLE_FILENAME), 'utf8');
  return JSON.parse(raw) as QaRunBundle;
}

/**
 * The bytes of each of a bundle's assets, keyed by asset id. An asset whose
 * file is missing is left out, so renderers show that step without an image.
 */
export async function readBundleAssets(
  dir: string,
  bundle: QaRunBundle,
): Promise<Map<string, Buffer>> {
  const bytes = new Map<string, Buffer>();
  for (const asset of Object.values(bundle.assets)) {
    try {
      bytes.set(
        asset.id,
        await readFile(path.join(dir, ASSETS_DIR, asset.filename)),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return bytes;
}

export function bundleDirName(testFile: string, testTitle: string): string {
  let base = path.basename(testFile, path.extname(testFile));
  if (base.endsWith('.spec')) {
    base = base.slice(0, -'.spec'.length);
  }
  const slug = testTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base}--${slug}`;
}
