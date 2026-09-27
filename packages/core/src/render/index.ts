import type { QaRunBundle, QaStep } from '../model.js';

export function renderQaSteps(bundle: QaRunBundle): string {
  const lines: string[] = [];

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
    lines.push(`${step.index}. ${step.action}${expected}`);
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
