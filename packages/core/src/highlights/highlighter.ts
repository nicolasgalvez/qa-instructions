import type { HighlightMark, QaAssetInput, QaStep } from '../model.js';
import type { QaRecording } from '../instructions/recorder.js';
import type { ScreenshotAnnotator } from './annotator.js';
import { HighlightPlanner } from './planner.js';

/** Told about a Step Screenshot that could not be highlighted; it is kept as it was. */
export type HighlightErrorHandler = (step: QaStep, error: unknown) => void;

type Drawn = { data: Buffer; marks: HighlightMark[] };

/**
 * Draws each QA Step's Highlight on its Step Screenshot as the bundle is
 * written. The highlighted image replaces the original, and the bundle's
 * asset records which marks it carries. A screenshot that cannot be drawn
 * on is kept unmarked, so highlighting never costs a QA Step its screenshot.
 */
export class StepScreenshotHighlighter {
  constructor(
    private readonly annotator: ScreenshotAnnotator,
    private readonly planner = new HighlightPlanner(),
    private readonly onError: HighlightErrorHandler = () => {},
  ) {}

  async highlight(recording: QaRecording): Promise<QaRecording> {
    const bundleAssets = { ...recording.bundle.assets };
    const assets = new Map(recording.assets.map((a) => [a.id, a]));
    for (const step of recording.bundle.steps) {
      const id = step.assetIds?.[0];
      const asset = id === undefined ? undefined : assets.get(id);
      if (!asset) continue;
      try {
        const drawn = await this.draw(step, asset);
        if (!drawn) continue;
        assets.set(asset.id, { ...asset, data: drawn.data });
        bundleAssets[asset.id] = {
          ...bundleAssets[asset.id],
          highlight: drawn.marks,
        };
      } catch (error) {
        this.onError(step, error);
      }
    }
    return {
      bundle: { ...recording.bundle, assets: bundleAssets },
      assets: [...assets.values()],
    };
  }

  /** The highlighted image, or undefined when the step has nothing to mark. */
  private async draw(
    step: QaStep,
    asset: QaAssetInput,
  ): Promise<Drawn | undefined> {
    if (this.planner.marks.length === 0) return undefined;
    const size = await this.annotator.size(asset);
    const highlight = this.planner.plan(step, size);
    if (!highlight) return undefined;
    return {
      data: await this.annotator.draw(asset, highlight),
      marks: this.planner.marks.filter((mark) => highlight[mark]),
    };
  }
}
