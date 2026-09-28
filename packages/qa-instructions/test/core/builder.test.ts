import assert from 'node:assert/strict';
import test from 'node:test';

import { createBundleBuilder } from '../../src/core/bundle/builder.js';

test('createBundleBuilder accumulates steps and assets', () => {
  const builder = createBundleBuilder();
  builder.guide({ title: 'Login', prerequisite: 'Deploy to dev first.' });
  builder.setSource({ runner: 'playwright', testTitle: 'Login' });

  const step = builder.addStep({
    action: 'Open /login',
    expected: 'Form loads',
    assetIds: ['step-01-screenshot'],
  });
  builder.addAsset({
    id: 'step-01-screenshot',
    contentType: 'image/png',
    filename: 'step-01-screenshot.png',
    data: Buffer.from('fake-png'),
  });

  const bundle = builder.toBundle();

  assert.equal(bundle.version, '1');
  assert.equal(bundle.meta.title, 'Login');
  assert.equal(bundle.meta.prerequisite, 'Deploy to dev first.');
  assert.equal(bundle.meta.source?.runner, 'playwright');
  assert.equal(bundle.steps.length, 1);
  assert.equal(step.index, 1);
  assert.equal(
    bundle.assets['step-01-screenshot'].filename,
    'step-01-screenshot.png',
  );
  assert.equal(builder.pendingAssets().length, 1);
});
