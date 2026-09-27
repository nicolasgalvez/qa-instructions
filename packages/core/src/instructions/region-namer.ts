import type { RecordedElement } from '../screenshots/source.js';
import { ElementNamer } from './element-namer.js';

/** Words a tester uses for a part of the page, by its role; any other is a section. */
const REGION_NOUNS: Record<string, string> = {
  form: 'form',
  dialog: 'dialog',
  row: 'row',
  table: 'table',
  navigation: 'navigation',
};

/** How a QA Step names the part of the page an element is in. */
export type RegionName = {
  /** What the page titles the part, e.g. `Renewable Energy Certificates`. */
  title: string;
  /** What kind of part a tester sees, e.g. `form`, `section`. */
  noun: string;
};

/**
 * Decides whether a QA Step must say which part of the page an element is
 * in, and how to name that part. Only when it tells the element apart: the
 * test narrowed its search to that part, or the page had lookalikes of the
 * element elsewhere. A part without a title a tester can read is never named.
 */
export class RegionNamer {
  constructor(private readonly namer = new ElementNamer()) {}

  name(element: RecordedElement | undefined): RegionName | undefined {
    const region = element?.region;
    const title = region?.title?.replace(/\s+/g, ' ').trim();
    if (!region || !title) return undefined;
    if (!region.scope && (element?.lookalikes ?? 1) <= 1) return undefined;

    const role = this.namer.role({ ...region, text: '', labels: [] });
    return { title, noun: (role && REGION_NOUNS[role]) ?? 'section' };
  }
}
