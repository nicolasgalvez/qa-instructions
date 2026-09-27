import { HTML_STYLE } from './html-style.js';
import type { StepImages } from './images.js';
import { InlineMarkup } from './inline-markup.js';
import { QaWording, type QaInstructionsView, type QaStepView } from './view.js';

/** The QA Instructions title is `<h1>`; Sections start one level below it. */
const SECTION_LEVEL = 2;
const MAX_LEVEL = 6;

/** Nothing may load from the network: styles are inline, images data URIs. */
const CONTENT_SECURITY_POLICY =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

/**
 * A standalone HTML page: inline styles for light and dark schemes, nested
 * Sections as nested `<section>`s, and each Step Screenshot with alt text
 * from its Action.
 */
export class HtmlRenderer {
  constructor(private readonly images?: StepImages) {}

  render(view: QaInstructionsView): string {
    const title = InlineMarkup.escapeHtml(view.title);
    const lines = [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="color-scheme" content="light dark">',
      `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`,
      `<title>${title}</title>`,
      `<style>\n${HTML_STYLE}\n</style>`,
      '</head>',
      '<body>',
      '<main>',
      `<h1>${title}</h1>`,
    ];

    if (view.incomplete) {
      lines.push(
        `<p class="note" role="note"><strong>${QaWording.incomplete}:</strong> ${InlineMarkup.escapeHtml(view.incomplete)}</p>`,
      );
    }
    if (view.prerequisite) {
      lines.push(`<p>${InlineMarkup.toHtml(view.prerequisite)}</p>`);
    }

    let open = 0;
    for (const run of view.runs) {
      lines.push(...Array<string>(run.closes).fill('</section>'));
      run.section.slice(run.shared).forEach((sectionTitle, i) => {
        const level = Math.min(SECTION_LEVEL + run.shared + i, MAX_LEVEL);
        lines.push(
          '<section>',
          `<h${level}>${InlineMarkup.toHtml(sectionTitle)}</h${level}>`,
        );
      });
      open = run.section.length;

      lines.push(`<ol start="${run.steps[0]?.number ?? 1}">`);
      for (const step of run.steps) lines.push(...this.step(step));
      lines.push('</ol>');
    }
    lines.push(...Array<string>(open).fill('</section>'));

    lines.push('</main>', '</body>', '</html>');
    return lines.join('\n') + '\n';
  }

  private step(step: QaStepView): string[] {
    const classes = [step.warning && 'warning', step.failed && 'failed'].filter(
      Boolean,
    );
    const warning = step.warning
      ? `<strong>${QaWording.warning}:</strong> `
      : '';
    const approximate = step.approximate
      ? ` <em class="approximate">(${QaWording.approximate})</em>`
      : '';

    const paragraphs = [
      `<p>${warning}${InlineMarkup.toHtml(step.action)}${approximate}`,
    ];
    if (step.expected) {
      paragraphs.push(
        `<p><strong>${QaWording.expected}:</strong> ${InlineMarkup.toHtml(step.expected)}`,
      );
    }
    if (step.failed) {
      paragraphs[paragraphs.length - 1] +=
        ` (<strong class="failed-here">${QaWording.failed}</strong>)`;
    }

    const lines = [
      classes.length > 0 ? `<li class="${classes.join(' ')}">` : '<li>',
      ...paragraphs.map((paragraph) => `${paragraph}</p>`),
    ];
    const src = step.screenshot && this.images?.src(step.screenshot.asset);
    if (step.screenshot && src) {
      lines.push(
        `<figure><img src="${src}" alt="${InlineMarkup.escapeHtml(step.screenshot.alt)}"></figure>`,
      );
    }
    lines.push('</li>');
    return lines;
  }
}
