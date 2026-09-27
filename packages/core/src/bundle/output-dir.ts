import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { QaAssetInput, QaRunBundle } from '../model.js';
import { writeBundle } from './io.js';

/** Marks a directory as one this tool wrote, and records its test. */
const MARKER_FILENAME = '.qa-instructions.json';
const CREATED_BY = 'qa-instructions';

/** The test a bundle directory holds QA Instructions for. */
export type BundleOwner = { file?: string; tags?: string[] };

/** A bundle directory, directly inside the output directory, this tool wrote. */
export type OwnedBundleDir = { name: string; owner: BundleOwner };

type Marker = { createdBy: string; test: BundleOwner };

/**
 * The reporter's output directory. Every bundle it writes carries a marker
 * file, and it only ever removes marked directories directly inside itself,
 * so files and directories it did not write are never touched.
 */
export class BundleOutputDir {
  constructor(private readonly root: string) {}

  async write(
    name: string,
    bundle: QaRunBundle,
    assets: QaAssetInput[],
    owner: BundleOwner,
  ): Promise<void> {
    const dir = path.join(this.root, name);
    await writeBundle(dir, bundle, assets);
    const marker: Marker = { createdBy: CREATED_BY, test: owner };
    await writeFile(
      path.join(dir, MARKER_FILENAME),
      JSON.stringify(marker, null, 2),
      'utf8',
    );
  }

  /** The directories this tool wrote, from this run or earlier ones. */
  async owned(): Promise<OwnedBundleDir[]> {
    const owned: OwnedBundleDir[] = [];
    for (const name of await this.subdirectories()) {
      const owner = await this.ownerOf(name);
      if (owner) owned.push({ name, owner });
    }
    return owned;
  }

  /** Removes each named directory that is directly inside and marked. */
  async remove(names: string[]): Promise<void> {
    const subdirectories = new Set(await this.subdirectories());
    for (const name of names) {
      if (!subdirectories.has(name) || !(await this.ownerOf(name))) continue;
      await rm(path.join(this.root, name), { recursive: true, force: true });
    }
  }

  private async subdirectories(): Promise<string[]> {
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  private async ownerOf(name: string): Promise<BundleOwner | undefined> {
    try {
      const raw = await readFile(
        path.join(this.root, name, MARKER_FILENAME),
        'utf8',
      );
      const marker = JSON.parse(raw) as Partial<Marker>;
      return marker.createdBy === CREATED_BY ? (marker.test ?? {}) : undefined;
    } catch {
      return undefined;
    }
  }
}
