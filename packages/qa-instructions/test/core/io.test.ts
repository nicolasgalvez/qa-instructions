import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createBundleBuilder } from '../../src/core/bundle/builder.js';
import {
  bundleDirName,
  readBundle,
  writeBundle,
} from '../../src/core/bundle/io.js';

test('writeBundle and readBundle round-trip', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-bundle-'));
  try {
    const builder = createBundleBuilder();
    builder.guide({ title: 'Login' });
    builder.addStep({
      action: 'Open /login',
      assetIds: ['step-01-screenshot'],
    });
    builder.addAsset({
      id: 'step-01-screenshot',
      contentType: 'image/png',
      filename: 'step-01-screenshot.png',
      data: Buffer.from('fake-png-bytes'),
    });

    const bundle = builder.toBundle();
    await writeBundle(dir, bundle, builder.pendingAssets());

    const raw = await readFile(path.join(dir, 'bundle.json'), 'utf8');
    assert.match(raw, /"version": "1"/);

    const assetBytes = await readFile(
      path.join(dir, 'assets', 'step-01-screenshot.png'),
    );
    assert.equal(assetBytes.toString(), 'fake-png-bytes');

    const loaded = await readBundle(dir);
    assert.equal(loaded.steps.length, bundle.steps.length);
    assert.equal(loaded.steps[0]?.action, bundle.steps[0]?.action);
    assert.deepEqual(loaded.steps[0]?.assetIds, bundle.steps[0]?.assetIds);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('bundleDirName slugifies test file and title', () => {
  assert.equal(
    bundleDirName('/proj/tests/login.spec.ts', 'User can log in'),
    'login--user-can-log-in',
  );
});
