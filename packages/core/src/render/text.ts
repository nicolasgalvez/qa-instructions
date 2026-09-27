import { QaWording, type QaInstructionsView, type QaStepView } from './view.js';

/** Jira-ready plain text: one numbered line per QA Step. */
export class TextRenderer {
  render(view: QaInstructionsView): string {
    const lines: string[] = [];

    if (view.incomplete) {
      lines.push(`**${QaWording.incomplete}:** ${view.incomplete}`, '');
    }
    if (view.prerequisite) {
      lines.push(view.prerequisite, '');
    }

    view.runs.forEach((run, i) => {
      if (i > 0 || run.section.length > 0) {
        if (lines.length > 0 && lines.at(-1) !== '') lines.push('');
        // Nested Sections read as one heading, outermost first.
        if (run.section.length > 0)
          lines.push(`### ${run.section.join(' › ')}`);
      }
      for (const step of run.steps) lines.push(this.step(step));
    });

    return lines.join('\n').trimEnd() + '\n';
  }

  private step(step: QaStepView): string {
    const warning = step.warning ? `${QaWording.warning}: ` : '';
    const approximate = step.approximate ? ` (${QaWording.approximate})` : '';
    const expected = step.expected ? ` — ${step.expected}` : '';
    const failed = step.failure ? ` (**${step.failure}**)` : '';
    return `${step.number}. ${warning}${step.action}${approximate}${expected}${failed}`;
  }
}
