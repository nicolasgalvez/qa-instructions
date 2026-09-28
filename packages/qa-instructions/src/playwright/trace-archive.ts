import { readFile } from 'node:fs/promises';

import { strFromU8, unzipSync } from 'fflate';

/** One parsed line of a trace's newline-delimited JSON event files. */
export type TraceEvent = Record<string, unknown> & { type?: unknown };

/** Read access to the files inside a Playwright `trace.zip`. */
export class TraceArchive {
  private constructor(private readonly zip: Uint8Array) {}

  static async open(tracePath: string): Promise<TraceArchive> {
    return new TraceArchive(await readFile(tracePath));
  }

  /** The events of every `.trace` file, keyed by file name. */
  eventFiles(): Map<string, TraceEvent[]> {
    const files = this.files((name) => name.endsWith('.trace'));
    return new Map(
      [...files].map(([name, data]) => [name, this.parse(strFromU8(data))]),
    );
  }

  /** The named files that exist in the archive. */
  files(include: (name: string) => boolean): Map<string, Buffer> {
    const entries = unzipSync(this.zip, { filter: (f) => include(f.name) });
    return new Map(
      Object.entries(entries).map(([name, data]) => [name, Buffer.from(data)]),
    );
  }

  private parse(ndjson: string): TraceEvent[] {
    return ndjson
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as TraceEvent);
  }
}
