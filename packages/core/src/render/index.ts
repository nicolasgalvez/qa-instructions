import type { QaRunBundle, QaStep } from '../model.js';

/** Where an incomplete test stopped, for the note above its QA Steps. */
function incompleteNote(bundle: QaRunBundle): string {
  const failing = bundle.steps.find((step) => step.failed);
  const last = bundle.steps.at(-1);
  if (failing) {
    return `**Incomplete:** the test failed at step ${failing.index}, so any later steps are missing.`;
  }
  if (last) {
    return `**Incomplete:** the test failed after step ${last.index}, so any later steps are missing.`;
  }
  return '**Incomplete:** the test failed before its first step.';
}

export function renderQaSteps(bundle: QaRunBundle): string {
  const lines: string[] = [];

  if (bundle.meta.status === 'incomplete') {
    lines.push(incompleteNote(bundle), '');
  }

  if (bundle.meta.prerequisite) {
    lines.push(bundle.meta.prerequisite, '');
  }

  let section = '';
  for (const step of bundle.steps) {
    const title = sectionTitle(step);
    if (title !== section) {
      if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
      if (title) lines.push(`### ${title}`);
      section = title;
    }
    const expected = step.expected ? ` — ${step.expected}` : '';
    const failed = step.failed ? ' (**test failed here**)' : '';
    lines.push(`${step.index}. ${step.action}${expected}${failed}`);
  }

  return lines.join('\n').trimEnd() + '\n';
}

/** A step's Section as one heading; nested groups read outermost first. */
function sectionTitle(step: QaStep): string {
  return (step.section ?? []).join(' › ');
}

export function renderJson(bundle: QaRunBundle): string {
  return JSON.stringify(bundle, null, 2) + '\n';
}

export type RenderFormat = 'qa-steps' | 'json';

export function render(bundle: QaRunBundle, format: RenderFormat): string {
  switch (format) {
    case 'qa-steps':
      return renderQaSteps(bundle);
    case 'json':
      return renderJson(bundle);
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown render format: ${_exhaustive}`);
    }
  }
}
