import assert from 'node:assert/strict';
import test from 'node:test';

import { createBundleBuilder } from '../../src/core/bundle/builder.js';
import {
  render,
  renderJson,
  renderQaSteps,
} from '../../src/core/render/index.js';

test('renderQaSteps produces ticket-ready plain text', () => {
  const builder = createBundleBuilder();
  builder.guide({
    title: 'Create a project',
    prerequisite: 'Deploy branch to dev first.',
  });
  builder.addStep({
    action: 'Open https://app.example.com/projects',
    expected: 'Project list loads with no error',
  });
  builder.addStep({
    action: 'Click `New project`',
    expected: 'Dialog shows empty name field',
  });

  const output = renderQaSteps(builder.toBundle());

  assert.equal(
    output,
    [
      'Deploy branch to dev first.',
      '',
      '1. Open https://app.example.com/projects — Project list loads with no error',
      '2. Click `New project` — Dialog shows empty name field',
      '',
    ].join('\n'),
  );
});

test('renderJson pretty-prints bundle', () => {
  const bundle = createBundleBuilder().toBundle();
  const output = renderJson(bundle);
  assert.match(output, /"version": "1"/);
  assert.match(output, /\n$/);
});

test('render dispatches by format', () => {
  const bundle = createBundleBuilder().toBundle();
  assert.doesNotThrow(() => render(bundle, 'qa-steps'));
  assert.doesNotThrow(() => render(bundle, 'json'));
});
