type Segment = { text: string; code: boolean };

const CODE_SPAN = /(`[^`]+`)/;
const STRONG = /\*\*(.+?)\*\*/g;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * The inline markup QA Steps are phrased in: `**strong**` for names and
 * values, and `` `code` ``. Converts it for each output format, escaping
 * everything else so a typed value can never inject markup.
 */
export class InlineMarkup {
  /** HTML with only `<strong>` and `<code>` elements; all other text escaped. */
  static toHtml(text: string): string {
    return InlineMarkup.segments(text)
      .map(({ text: part, code }) =>
        code
          ? `<code>${InlineMarkup.escapeHtml(part)}</code>`
          : InlineMarkup.escapeHtml(part).replace(
              STRONG,
              '<strong>$1</strong>',
            ),
      )
      .join('');
  }

  /** Markdown that renders `<` literally instead of as an HTML tag. */
  static toMarkdown(text: string): string {
    return InlineMarkup.segments(text)
      .map(({ text: part, code }) =>
        code ? `\`${part}\`` : part.replaceAll('<', '&lt;'),
      )
      .join('');
  }

  /** The words alone, for alt text. */
  static toPlain(text: string): string {
    return InlineMarkup.segments(text)
      .map(({ text: part, code }) => (code ? part : part.replace(STRONG, '$1')))
      .join('');
  }

  static escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
  }

  /** Splits text into code spans (backticks removed) and the text between. */
  private static segments(text: string): Segment[] {
    // Splitting on a capturing pattern puts the code spans at odd indexes.
    return text
      .split(CODE_SPAN)
      .map((part, i) =>
        i % 2 === 1
          ? { text: part.slice(1, -1), code: true }
          : { text: part, code: false },
      )
      .filter((segment) => segment.code || segment.text !== '');
  }
}
