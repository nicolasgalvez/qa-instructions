import type { SectionChanges } from '@qa-instructions/core';
import type { Document, Element } from 'domhandler';
import { findAll, getOuterHTML, isTag, textContent } from 'domutils';

/** The attribute a DOM snapshot puts on the element a call acts on. */
const TARGET_ATTRIBUTE = '__playwright_target__';

/** One frame of the page as recorded before a call and after it. */
export type DocumentPair = { before: Document; after: Document };

/**
 * Reads, from DOM snapshots taken before and after a call, which collapsible
 * sections (`<details>`) it opened or closed, each named by the text of its
 * `<summary>`. Says so only when that is all that changed: any other change,
 * or a section without a heading, gives nothing.
 */
export class SectionChangeReader {
  between(pairs: DocumentPair[]): SectionChanges | undefined {
    const changes: SectionChanges = { opened: [], closed: [] };
    for (const { before, after } of pairs) {
      const was = this.sections(before);
      const now = this.sections(after);
      if (was.length !== now.length) return undefined;
      for (const [i, section] of now.entries()) {
        const open = this.isOpen(section);
        if (open === this.isOpen(was[i])) continue;
        const name = this.heading(section);
        if (!name) return undefined;
        (open ? changes.opened : changes.closed).push(name);
      }
      if (this.rest(before) !== this.rest(after)) return undefined;
    }
    return changes.opened.length + changes.closed.length > 0
      ? changes
      : undefined;
  }

  private sections(document: Document): Element[] {
    return findAll((el) => el.name === 'details', document.children);
  }

  private isOpen(section: Element): boolean {
    return 'open' in section.attribs;
  }

  /** The text of the section's own `<summary>`, whitespace collapsed. */
  private heading(section: Element): string | undefined {
    const summary = section.children.find(
      (child): child is Element => isTag(child) && child.name === 'summary',
    );
    const text = summary && textContent(summary).replace(/\s+/g, ' ').trim();
    return text || undefined;
  }

  /**
   * The document with every section's open state and Playwright's target
   * mark taken out. Changes the document, which is built for this read.
   */
  private rest(document: Document): string {
    for (const element of findAll(() => true, document.children)) {
      delete element.attribs[TARGET_ATTRIBUTE];
      if (element.name === 'details') delete element.attribs.open;
    }
    return getOuterHTML(document);
  }
}
