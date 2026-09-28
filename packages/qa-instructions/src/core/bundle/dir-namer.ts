import { bundleDirName } from './io.js';

/** What tells one test's QA Instructions apart from another's on disk. */
export type BundleIdentity = {
  file: string;
  title: string;
  project?: string;
  line?: number;
};

/**
 * Names each test's bundle directory `<file>--<title>`, adding the project
 * and then the line only where tests would otherwise share a directory
 * (the same test in several projects, or same-titled tests in one file).
 */
export class BundleDirNamer {
  names(tests: BundleIdentity[]): string[] {
    let names = tests.map((t) => bundleDirName(t.file, t.title));
    names = this.disambiguate(names, (i) => tests[i].project);
    names = this.disambiguate(names, (i) =>
      tests[i].line === undefined ? undefined : `line-${tests[i].line}`,
    );
    return this.disambiguate(names, (i) => String(i + 1));
  }

  /** Appends a suffix to every name that is not yet unique. */
  private disambiguate(
    names: string[],
    suffix: (index: number) => string | undefined,
  ): string[] {
    const counts = new Map<string, number>();
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);

    return names.map((name, index) => {
      if (counts.get(name) === 1) return name;
      const extra = suffix(index);
      return extra ? `${name}--${this.slug(extra)}` : name;
    });
  }

  private slug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
