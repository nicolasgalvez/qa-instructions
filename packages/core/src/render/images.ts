import type { QaAsset } from '../model.js';

/**
 * Where a rendered page finds a Step Screenshot. The CLI chooses one per
 * format and supplies what it read from the bundle, so renderers stay pure.
 */
export interface StepImages {
  /** The image source for an asset, or undefined when it is unavailable. */
  src(asset: QaAsset): string | undefined;
}

/** Relative links to screenshots copied next to the rendered file. */
export class RelativeImageLinks implements StepImages {
  private readonly available: ReadonlySet<string>;

  /**
   * @param baseDir Directory holding the screenshots, relative to the rendered
   *   file, with `/` separators.
   * @param available Ids of the assets present in `baseDir`.
   */
  constructor(
    private readonly baseDir: string,
    available: Iterable<string>,
  ) {
    this.available = new Set(available);
  }

  src(asset: QaAsset): string | undefined {
    if (!this.available.has(asset.id)) return undefined;
    return [...this.baseDir.split('/'), asset.filename]
      .filter((segment) => segment !== '')
      .map(encodeURIComponent)
      .join('/');
  }
}

/** Screenshots embedded as data URIs, so one file holds everything. */
export class EmbeddedImages implements StepImages {
  constructor(private readonly bytes: ReadonlyMap<string, Uint8Array>) {}

  src(asset: QaAsset): string | undefined {
    const data = this.bytes.get(asset.id);
    if (!data) return undefined;
    return `data:${asset.contentType};base64,${Buffer.from(data).toString('base64')}`;
  }
}
