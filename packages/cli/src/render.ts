import { mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  EmbeddedImages,
  readBundle,
  readBundleAssets,
  RelativeImageLinks,
  render,
  type QaRunBundle,
  type RenderFormat,
  type StepImages,
} from '@qa-instructions/core';

export async function isBundleDir(dir: string): Promise<boolean> {
  try {
    await stat(path.join(dir, 'bundle.json'));
    return true;
  } catch {
    return false;
  }
}

export async function findBundles(root: string): Promise<string[]> {
  if (await isBundleDir(root)) return [root];

  const entries = await readdir(root, { withFileTypes: true });
  const bundles: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(root, entry.name);
    if (await isBundleDir(candidate)) bundles.push(candidate);
  }

  return bundles.sort();
}

const EXTENSIONS: Record<RenderFormat, string> = {
  'qa-steps': '.txt',
  markdown: '.md',
  html: '.html',
  json: '.json',
};

/**
 * Renders bundle directories to one format in an output directory, one file
 * per bundle named after it. Supplies each renderer its Step Screenshots:
 * Markdown links copies placed in `<out>/<bundle-name>/`; HTML embeds them.
 */
export class BundleRenderer {
  constructor(
    private readonly format: RenderFormat,
    private readonly outDir: string,
  ) {}

  async renderAll(bundleDirs: string[]): Promise<void> {
    await mkdir(this.outDir, { recursive: true });
    for (const bundleDir of bundleDirs) await this.renderOne(bundleDir);
  }

  private async renderOne(bundleDir: string): Promise<void> {
    const name = path.basename(bundleDir);
    const bundle = await readBundle(bundleDir);
    const images = await this.images(bundleDir, bundle, name);
    await writeFile(
      path.join(this.outDir, `${name}${EXTENSIONS[this.format]}`),
      render(bundle, this.format, { images }),
      'utf8',
    );
  }

  private async images(
    bundleDir: string,
    bundle: QaRunBundle,
    name: string,
  ): Promise<StepImages | undefined> {
    switch (this.format) {
      case 'markdown': {
        const assets = await readBundleAssets(bundleDir, bundle);
        await this.copyAssets(bundle, assets, path.join(this.outDir, name));
        return new RelativeImageLinks(name, assets.keys());
      }
      case 'html':
        return new EmbeddedImages(await readBundleAssets(bundleDir, bundle));
      default:
        return undefined;
    }
  }

  private async copyAssets(
    bundle: QaRunBundle,
    assets: ReadonlyMap<string, Buffer>,
    dir: string,
  ): Promise<void> {
    if (assets.size === 0) return;
    await mkdir(dir, { recursive: true });
    for (const [id, data] of assets) {
      const asset = bundle.assets[id];
      if (asset) await writeFile(path.join(dir, asset.filename), data);
    }
  }
}

export async function renderAll(
  bundles: string[],
  format: RenderFormat,
  outDir: string,
): Promise<void> {
  await new BundleRenderer(format, outDir).renderAll(bundles);
}
