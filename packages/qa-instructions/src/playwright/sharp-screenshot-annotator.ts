import type {
  BadgeMark,
  ClickDotMark,
  Highlight,
  HighlightRect,
  OutlineMark,
  QaSize,
  ScreenshotAnnotator,
  SpotlightMark,
  StepImage,
} from '../core/index.js';
import sharp from 'sharp';

/** A Highlight as an SVG the size of its image, one element per mark. */
export class HighlightSvg {
  constructor(
    private readonly size: QaSize,
    private readonly highlight: Highlight,
  ) {}

  toString(): string {
    const { width, height } = this.size;
    const { spotlight, outline, badge, clickDot } = this.highlight;
    const marks = [
      spotlight && this.spotlight(spotlight),
      outline && this.outline(outline),
      badge && this.badge(badge),
      clickDot && this.clickDot(clickDot),
    ].filter(Boolean);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${marks.join('')}</svg>`;
  }

  /** The whole image minus the hole, filled even-odd. */
  private spotlight({ hole, opacity }: SpotlightMark): string {
    const { width, height } = this.size;
    return `<path fill="#000" fill-opacity="${opacity}" fill-rule="evenodd" d="M0 0H${width}V${height}H0Z${this.rectPath(hole)}"/>`;
  }

  /** Stroked on a path inset by half the stroke, so the stroke fills the rect's edge exactly. */
  private outline({ rect, strokeWidth, dash }: OutlineMark): string {
    const half = strokeWidth / 2;
    const dashes = dash ? ` stroke-dasharray="${dash} ${dash}"` : '';
    return `<rect x="${rect.x + half}" y="${rect.y + half}" width="${rect.width - strokeWidth}" height="${rect.height - strokeWidth}" fill="none" stroke="${this.highlight.color}" stroke-width="${strokeWidth}"${dashes}/>`;
  }

  private badge({ x, y, radius, label, fontSize }: BadgeMark): string {
    return (
      `<circle cx="${x}" cy="${y}" r="${radius}" fill="${this.highlight.color}"/>` +
      `<text x="${x}" y="${y}" fill="#fff" font-family="sans-serif" font-weight="bold" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">${this.escape(label)}</text>`
    );
  }

  /** A dot of `radius` inside a white ring `ringWidth` wide. */
  private clickDot({ x, y, radius, ringWidth }: ClickDotMark): string {
    return `<circle cx="${x}" cy="${y}" r="${radius + ringWidth / 2}" fill="${this.highlight.color}" stroke="#fff" stroke-width="${ringWidth}"/>`;
  }

  private rectPath({ x, y, width, height }: HighlightRect): string {
    return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
  }

  private escape(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}

/**
 * Default screenshot-annotator adapter: composites the Highlight onto the
 * Step Screenshot as an SVG overlay with sharp, keeping the image's format
 * and, for an opaque image, its lack of an alpha channel.
 */
export class SharpScreenshotAnnotator implements ScreenshotAnnotator {
  async size(image: StepImage): Promise<QaSize> {
    const { width, height } = await sharp(image.data).metadata();
    return { width, height };
  }

  async draw(image: StepImage, highlight: Highlight): Promise<Buffer> {
    const { width, height, format, hasAlpha } = await sharp(
      image.data,
    ).metadata();
    const svg = new HighlightSvg({ width, height }, highlight).toString();
    const composited = await sharp(image.data)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer();
    const output = sharp(composited);
    if (!hasAlpha) output.removeAlpha();
    return output.toFormat(format).toBuffer();
  }
}
