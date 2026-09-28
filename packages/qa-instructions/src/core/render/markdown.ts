import type { StepImages } from './images.js';
import { InlineMarkup } from './inline-markup.js';
import {
  QaWording,
  type QaInstructionsView,
  type QaStepView,
  type SectionRun,
} from './view.js';

type Heading = { depth: number; title: string };

/** The QA Instructions title is `##`; Sections start one level below it. */
const SECTION_LEVEL = 3;
const MAX_LEVEL = 6;

/**
 * PR-ready Markdown: nested Sections as headings, and each step's Step
 * Screenshot inline under it.
 */
export class MarkdownRenderer {
  constructor(private readonly images?: StepImages) {}

  render(view: QaInstructionsView): string {
    const blocks = [`## ${InlineMarkup.toMarkdown(view.title)}`];

    if (view.incomplete) {
      blocks.push(`> **${QaWording.incomplete}:** ${view.incomplete}`);
    }
    if (view.prerequisite) {
      blocks.push(InlineMarkup.toMarkdown(view.prerequisite));
    }

    for (const run of view.runs) {
      for (const { depth, title } of this.headings(run)) {
        const level = Math.min(SECTION_LEVEL + depth, MAX_LEVEL);
        blocks.push(`${'#'.repeat(level)} ${InlineMarkup.toMarkdown(title)}`);
      }
      for (const step of run.steps) blocks.push(this.step(step));
    }

    return blocks.join('\n\n') + '\n';
  }

  /**
   * Headings for the Sections a run opens. Markdown cannot end a heading's
   * scope, so a run returning to an outer Section repeats that heading.
   */
  private headings(run: SectionRun): Heading[] {
    const opened = run.section
      .slice(run.shared)
      .map((title, i) => ({ depth: run.shared + i, title }));
    const innermost = run.section.at(-1);
    if (opened.length === 0 && innermost !== undefined) {
      return [{ depth: run.section.length - 1, title: innermost }];
    }
    return opened;
  }

  private step(step: QaStepView): string {
    const marker = `${step.number}. `;
    const warning = step.warning ? `**${QaWording.warning}:** ` : '';
    const approximate = step.approximate ? ` _(${QaWording.approximate})_` : '';
    const paragraphs = [
      `${warning}${InlineMarkup.toMarkdown(step.action)}${approximate}`,
    ];
    if (step.expected) {
      paragraphs.push(
        `**${QaWording.expected}:** ${InlineMarkup.toMarkdown(step.expected)}`,
      );
    }
    if (step.failure) {
      paragraphs[paragraphs.length - 1] += ` (**${step.failure}**)`;
    }

    const src = step.screenshot && this.images?.src(step.screenshot.asset);
    if (step.screenshot && src) {
      paragraphs.push(`![${this.altText(step.screenshot.alt)}](${src})`);
    }

    // Continuation paragraphs align with the item's text to stay in the item.
    return marker + paragraphs.join(`\n\n${' '.repeat(marker.length)}`);
  }

  private altText(alt: string): string {
    return InlineMarkup.toMarkdown(alt).replace(/[\\[\]]/g, '\\$&');
  }
}
