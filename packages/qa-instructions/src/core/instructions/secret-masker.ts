import type { QaRunBundle } from '../model.js';

/** A secret to mask: an exact value, or a pattern for values like it. */
export type MaskPattern = string | RegExp;

/**
 * Replaces secrets with a mask in the text of QA Instructions: values typed
 * into password fields, and anything matching configured mask patterns.
 * Knows nothing about any test runner or output format; it masks the bundle
 * before it is persisted, so every format rendered from it is masked.
 */
export class SecretMasker {
  /** What a tester reads in place of a secret. */
  static readonly MASK = '[masked]';

  private readonly values: readonly string[];
  private readonly patterns: readonly RegExp[];

  constructor(patterns: readonly MaskPattern[] = []) {
    this.values = this.longestFirst(
      patterns.filter((p): p is string => typeof p === 'string'),
    );
    this.patterns = patterns
      .filter((p): p is RegExp => p instanceof RegExp)
      .map((p) => this.global(p));
  }

  /** This masker, also masking each of `values` exactly. */
  withValues(values: Iterable<string>): SecretMasker {
    return new SecretMasker([...this.values, ...values, ...this.patterns]);
  }

  mask(text: string): string {
    let masked = text;
    for (const value of this.values) {
      masked = masked.split(value).join(SecretMasker.MASK);
    }
    for (const pattern of this.patterns) {
      masked = masked.replace(pattern, (match) =>
        match === '' ? match : SecretMasker.MASK,
      );
    }
    return masked;
  }

  /** The bundle with every piece of text a tester reads masked. */
  maskBundle(bundle: QaRunBundle): QaRunBundle {
    const { meta } = bundle;
    return {
      ...bundle,
      meta: {
        ...meta,
        title: this.mask(meta.title),
        prerequisite: this.maskOptional(meta.prerequisite),
        source: meta.source && {
          ...meta.source,
          testTitle: this.maskOptional(meta.source.testTitle),
        },
      },
      steps: bundle.steps.map((step) => ({
        ...step,
        action: this.mask(step.action),
        expected: this.maskOptional(step.expected),
        url: this.maskOptional(step.url),
        section: step.section?.map((title) => this.mask(title)),
      })),
    };
  }

  private maskOptional(text: string | undefined): string | undefined {
    return text === undefined ? undefined : this.mask(text);
  }

  /** Longer values first, so a value containing another is masked whole. */
  private longestFirst(values: string[]): string[] {
    return [...new Set(values.filter((v) => v !== ''))].sort(
      (a, b) => b.length - a.length,
    );
  }

  private global(pattern: RegExp): RegExp {
    return pattern.global
      ? pattern
      : new RegExp(pattern.source, `${pattern.flags}g`);
  }
}
