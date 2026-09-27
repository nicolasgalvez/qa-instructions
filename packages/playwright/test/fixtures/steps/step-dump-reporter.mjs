import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Records the reporter steps a Playwright version gives each test, as the
// committed step dumps in this directory. Run by
// examples/derived-steps-1.56/scripts/record-fixtures.mjs. Keeps the fields
// the adapter reads; source locations keep only the file name, so the dumps
// resolve against the spec copies next to them.

const FIELDS = ['title', 'category', 'subtitle', 'params', 'location'];

function dump(step) {
  const out = {};
  for (const field of FIELDS) {
    if (step[field] !== undefined) out[field] = step[field];
  }
  if (out.location) {
    out.location = { ...out.location, file: path.basename(out.location.file) };
  }
  if (step.error) out.error = { message: step.error.message ?? '' };
  if (step.steps.length > 0) out.steps = step.steps.map(dump);
  return out;
}

export default class StepDumpReporter {
  constructor({ outputDir }) {
    this.outputDir = outputDir;
  }

  printsToStdio() {
    return false;
  }

  onTestEnd(test, result) {
    mkdirSync(this.outputDir, { recursive: true });
    const name = test.title.toLowerCase().replace(/\W+/g, '-');
    const file = path.join(this.outputDir, `${name}.json`);
    const steps = result.steps.map(dump);
    writeFileSync(
      file,
      `${JSON.stringify({ title: test.title, steps }, null, 2)}\n`,
    );
  }
}
