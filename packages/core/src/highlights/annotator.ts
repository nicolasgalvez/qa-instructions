/**
 * Outbound port: something that can draw a Highlight on a Step Screenshot.
 *
 * The core decides what to mark and where, in image pixels; an adapter (sharp
 * with an SVG overlay by default) only paints it. Nothing here may depend on
 * a drawing library's types.
 */
import type { QaSize } from '../model.js';

/** A rectangle in whole image pixels from the image's top-left corner. */
export type HighlightRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** A frame around the element, drawn inside `rect`, `strokeWidth` thick. */
export type OutlineMark = {
  rect: HighlightRect;
  strokeWidth: number;
  /** Dash length when the element's position is approximate; solid otherwise. */
  dash?: number;
};

/** A filled dot where the Action clicked, ringed in white so it shows on any color. */
export type ClickDotMark = {
  x: number;
  y: number;
  radius: number;
  ringWidth: number;
};

/** A filled circle carrying the QA Step's number. */
export type BadgeMark = {
  x: number;
  y: number;
  radius: number;
  label: string;
  fontSize: number;
};

/** Everything but `hole` darkened by a black layer of `opacity`. */
export type SpotlightMark = { hole: HighlightRect; opacity: number };

/** What to draw on one Step Screenshot, in image pixels. */
export type Highlight = {
  /** CSS color of the outline, click dot, and badge. */
  color: string;
  outline?: OutlineMark;
  clickDot?: ClickDotMark;
  badge?: BadgeMark;
  spotlight?: SpotlightMark;
};

/** An encoded image, as stored with the bundle. */
export type StepImage = { contentType: string; data: Buffer };

export interface ScreenshotAnnotator {
  /** The image's size in pixels. */
  size(image: StepImage): Promise<QaSize>;
  /** The image with the Highlight drawn on it, in the same format. */
  draw(image: StepImage, highlight: Highlight): Promise<Buffer>;
}
