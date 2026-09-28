import type {
  HighlightMark,
  QaBox,
  QaPoint,
  QaScreenshotMoment,
  QaSize,
  QaStep,
} from '../model.js';
import type {
  BadgeMark,
  ClickDotMark,
  Highlight,
  HighlightRect,
  OutlineMark,
  SpotlightMark,
} from './annotator.js';

/**
 * Which marks a Highlight draws: one mark, several, or `none` to leave Step
 * Screenshots unmarked. Default: outline and click dot.
 */
export type HighlightStyle = HighlightMark | HighlightMark[] | 'none';

export const DEFAULT_HIGHLIGHT: readonly HighlightMark[] = [
  'outline',
  'clickDot',
];

/** Sizes in CSS pixels; scaled with the image. */
const OUTLINE_GAP = 2;
const OUTLINE_WIDTH = 3;
const OUTLINE_DASH = 6;
const DOT_RADIUS = 6;
const DOT_RING = 2;
const BADGE_RADIUS = 11;
const BADGE_FONT = 13;
const SPOTLIGHT_OPACITY = 0.55;
const COLOR = '#ff0080';

/**
 * Screenshots the element box and click point describe. Both are read at the
 * moment of the Action, which the page just before it matches closely; after
 * it the page may have moved on (navigated, closed a menu).
 */
const MATCHING_MOMENTS: ReadonlySet<QaScreenshotMoment | undefined> = new Set<
  QaScreenshotMoment | undefined
>(['action', 'before']);

/** Viewport-to-image scale of one Step Screenshot. */
class ImageScale {
  readonly x: number;
  readonly y: number;

  constructor(
    readonly image: QaSize,
    viewport: QaSize | undefined,
  ) {
    this.x = viewport ? image.width / viewport.width : 1;
    this.y = viewport ? image.height / viewport.height : 1;
  }

  /** A CSS length as image pixels. */
  length(css: number): number {
    return css * this.x;
  }

  point(point: QaPoint): QaPoint {
    return { x: point.x * this.x, y: point.y * this.y };
  }

  /**
   * `box` grown by `grow` CSS pixels on every side, in image pixels, snapped
   * outward to whole pixels and clipped to the image. Undefined when none of
   * it is in the image.
   */
  rect(box: QaBox, grow: number): HighlightRect | undefined {
    const left = Math.max(0, Math.floor((box.x - grow) * this.x));
    const top = Math.max(0, Math.floor((box.y - grow) * this.y));
    const right = Math.min(
      this.image.width,
      Math.ceil((box.x + box.width + grow) * this.x),
    );
    const bottom = Math.min(
      this.image.height,
      Math.ceil((box.y + box.height + grow) * this.y),
    );
    if (right <= left || bottom <= top) return undefined;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  contains(point: QaPoint): boolean {
    return (
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= this.image.width &&
      point.y <= this.image.height
    );
  }

  /** `value` moved just enough for a circle of `radius` to fit within `max`. */
  fit(value: number, radius: number, max: number): number {
    return Math.min(Math.max(value, radius), max - radius);
  }
}

/**
 * Decides what a QA Step's Highlight marks and where, in the pixels of its
 * Step Screenshot. Pure: the drawing is left to a ScreenshotAnnotator.
 *
 * The element box and click point are in viewport CSS pixels and are scaled
 * by the image's size over the viewport's, so a high-DPI screenshot is
 * marked in the right place. Warning steps and Actions with no element are
 * not highlighted; an approximate Action's outline is dashed.
 */
export class HighlightPlanner {
  readonly marks: readonly HighlightMark[];

  constructor(style: HighlightStyle = [...DEFAULT_HIGHLIGHT]) {
    if (style === 'none') this.marks = [];
    else this.marks = typeof style === 'string' ? [style] : [...style];
  }

  plan(step: QaStep, image: QaSize): Highlight | undefined {
    if (this.marks.length === 0 || step.warning) return undefined;
    if (!MATCHING_MOMENTS.has(step.screenshotMoment)) return undefined;

    const scale = new ImageScale(image, step.viewport);
    const outline = this.outline(step, scale);
    const highlight: Highlight = {
      color: COLOR,
      outline: this.has('outline') ? outline : undefined,
      clickDot: this.has('clickDot') ? this.clickDot(step, scale) : undefined,
      badge: this.has('badge') ? this.badge(step, outline, scale) : undefined,
      spotlight: this.has('spotlight')
        ? this.spotlight(step, scale)
        : undefined,
    };
    return this.withoutEmptyMarks(highlight);
  }

  private has(mark: HighlightMark): boolean {
    return this.marks.includes(mark);
  }

  private outline(step: QaStep, scale: ImageScale): OutlineMark | undefined {
    const rect =
      step.elementBox &&
      scale.rect(step.elementBox, OUTLINE_GAP + OUTLINE_WIDTH);
    if (!rect) return undefined;
    const outline: OutlineMark = {
      rect,
      strokeWidth: scale.length(OUTLINE_WIDTH),
    };
    if (step.approximate) outline.dash = scale.length(OUTLINE_DASH);
    return outline;
  }

  private clickDot(step: QaStep, scale: ImageScale): ClickDotMark | undefined {
    if (!step.clickPoint) return undefined;
    const point = scale.point(step.clickPoint);
    if (!scale.contains(point)) return undefined;
    return {
      ...point,
      radius: scale.length(DOT_RADIUS),
      ringWidth: scale.length(DOT_RING),
    };
  }

  /** On the outline's top-left corner, kept inside the image. */
  private badge(
    step: QaStep,
    outline: OutlineMark | undefined,
    scale: ImageScale,
  ): BadgeMark | undefined {
    if (!outline) return undefined;
    const radius = scale.length(BADGE_RADIUS);
    return {
      x: scale.fit(outline.rect.x, radius, scale.image.width),
      y: scale.fit(outline.rect.y, radius, scale.image.height),
      radius,
      label: String(step.index),
      fontSize: scale.length(BADGE_FONT),
    };
  }

  private spotlight(
    step: QaStep,
    scale: ImageScale,
  ): SpotlightMark | undefined {
    const hole = step.elementBox && scale.rect(step.elementBox, OUTLINE_GAP);
    return hole && { hole, opacity: SPOTLIGHT_OPACITY };
  }

  /** Drops marks with nothing to draw; no Highlight at all if none remain. */
  private withoutEmptyMarks(highlight: Highlight): Highlight | undefined {
    const marks = Object.entries(highlight).filter(
      ([key, value]) => key !== 'color' && value !== undefined,
    );
    if (marks.length === 0) return undefined;
    return { color: highlight.color, ...Object.fromEntries(marks) };
  }
}
