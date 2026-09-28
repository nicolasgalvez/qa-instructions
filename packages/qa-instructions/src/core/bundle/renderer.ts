import { mkdir, readdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { QaRunBundle } from '../model.js';
import {
  EmbeddedImages,
  RelativeImageLinks,
  render,
  type RenderFormat,
  type StepImages,
} from '../render/index.js';
import { ASSETS_DIR, readBundle, readBundleAssets } from './io.js';

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

/** Where a Markdown file finds its Step Screenshots. */
export type ImagePlacement = {
  /** The screenshots' directory, relative to the rendered file. */
  linkDir: string;
  /** Where to copy them; omitted when they are already at `linkDir`. */
  copyTo?: string;
};

/** Where a `BundleRenderer` writes each bundle's rendered file. */
export interface RenderLayout {
  file(bundleDir: string, extension: string): string;
  images(bundleDir: string): ImagePlacement;
}

/**
 * One file per bundle in a separate directory, named after the bundle
 * (`<out>/<bundle>.md`), with Markdown's screenshots copied to
 * `<out>/<bundle>/`. The `qa-instructions render` layout.
 */
export class OutputDirLayout implements RenderLayout {
  constructor(private readonly outDir: string) {}

  file(bundleDir: string, extension: string): string {
    return path.join(this.outDir, `${path.basename(bundleDir)}${extension}`);
  }

  images(bundleDir: string): ImagePlacement {
    const name = path.basename(bundleDir);
    return { linkDir: name, copyTo: path.join(this.outDir, name) };
  }
}

/**
 * Inside the bundle directory, beside `bundle.json` (`<bundle>/qa-steps.md`),
 * with Markdown linking the bundle's own screenshots. The reporter's layout.
 */
export class InBundleLayout implements RenderLayout {
  static readonly BASENAME = 'qa-steps';

  file(bundleDir: string, extension: string): string {
    return path.join(bundleDir, `${InBundleLayout.BASENAME}${extension}`);
  }

  images(): ImagePlacement {
    return { linkDir: ASSETS_DIR };
  }
}

/**
 * Renders bundle directories to one format, placed by a `RenderLayout`.
 * Supplies each renderer its Step Screenshots: Markdown links image files;
 * HTML embeds them.
 */
export class BundleRenderer {
  constructor(
    private readonly format: RenderFormat,
    private readonly layout: RenderLayout,
  ) {}

  async renderAll(bundleDirs: string[]): Promise<void> {
    for (const bundleDir of bundleDirs) await this.render(bundleDir);
  }

  /** Renders one bundle directory and returns the file it wrote. */
  async render(bundleDir: string): Promise<string> {
    const bundle = await readBundle(bundleDir);
    const images = await this.images(bundleDir, bundle);
    const file = this.layout.file(bundleDir, EXTENSIONS[this.format]);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, render(bundle, this.format, { images }), 'utf8');
    return file;
  }

  private async images(
    bundleDir: string,
    bundle: QaRunBundle,
  ): Promise<StepImages | undefined> {
    switch (this.format) {
      case 'markdown': {
        const assets = await readBundleAssets(bundleDir, bundle);
        const { linkDir, copyTo } = this.layout.images(bundleDir);
        if (copyTo) await this.copyAssets(bundle, assets, copyTo);
        return new RelativeImageLinks(linkDir, assets.keys());
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

/** Renders bundles to one format in `outDir`, one file per bundle. */
export async function renderAll(
  bundles: string[],
  format: RenderFormat,
  outDir: string,
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await new BundleRenderer(format, new OutputDirLayout(outDir)).renderAll(
    bundles,
  );
}
