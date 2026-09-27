import type { QaRunBundle } from '../model.js';
import { HtmlRenderer } from './html.js';
import type { StepImages } from './images.js';
import { MarkdownRenderer } from './markdown.js';
import { TextRenderer } from './text.js';
import { QaInstructionsView } from './view.js';

export {
  EmbeddedImages,
  RelativeImageLinks,
  type StepImages,
} from './images.js';
export { InlineMarkup } from './inline-markup.js';
export {
  QaInstructionsView,
  QaWording,
  type QaStepView,
  type SectionRun,
  type StepScreenshotView,
} from './view.js';
export { HtmlRenderer, MarkdownRenderer, TextRenderer };

export type RenderOptions = {
  /** Where Markdown and HTML find Step Screenshots; omitted, none are shown. */
  images?: StepImages;
};

/** Jira-ready plain text. */
export function renderQaSteps(bundle: QaRunBundle): string {
  return new TextRenderer().render(QaInstructionsView.from(bundle));
}

/** PR-ready Markdown with each Step Screenshot inline. */
export function renderMarkdown(
  bundle: QaRunBundle,
  options: RenderOptions = {},
): string {
  return new MarkdownRenderer(options.images).render(
    QaInstructionsView.from(bundle),
  );
}

/** A standalone HTML page. */
export function renderHtml(
  bundle: QaRunBundle,
  options: RenderOptions = {},
): string {
  return new HtmlRenderer(options.images).render(
    QaInstructionsView.from(bundle),
  );
}

export function renderJson(bundle: QaRunBundle): string {
  return JSON.stringify(bundle, null, 2) + '\n';
}

export const RENDER_FORMATS = ['qa-steps', 'markdown', 'html', 'json'] as const;

export type RenderFormat = (typeof RENDER_FORMATS)[number];

export function isRenderFormat(value: string): value is RenderFormat {
  return (RENDER_FORMATS as readonly string[]).includes(value);
}

export function render(
  bundle: QaRunBundle,
  format: RenderFormat,
  options: RenderOptions = {},
): string {
  switch (format) {
    case 'qa-steps':
      return renderQaSteps(bundle);
    case 'markdown':
      return renderMarkdown(bundle, options);
    case 'html':
      return renderHtml(bundle, options);
    case 'json':
      return renderJson(bundle);
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown render format: ${_exhaustive}`);
    }
  }
}
