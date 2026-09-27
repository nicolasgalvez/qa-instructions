import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BundleOutputDir,
  createBundleBuilder,
  StaleBundlePolicy,
  TestSelection,
  type OwnedBundleDir,
} from '../src/index.js';

const signIn = { file: '/proj/tests/sign-in.spec.ts', tags: ['@qa'] };

async function withOutputDir(
  body: (root: string, output: BundleOutputDir) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-output-'));
  try {
    await body(root, new BundleOutputDir(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeOwned(output: BundleOutputDir, name: string) {
  const builder = createBundleBuilder();
  builder.guide({ title: name });
  await output.write(name, builder.toBundle(), [], signIn);
}

test('BundleOutputDir lists only the directories it wrote, with their test', async () => {
  await withOutputDir(async (root, output) => {
    await writeOwned(output, 'sign-in--old-title');
    await mkdir(path.join(root, 'hand-made'));
    await writeFile(path.join(root, 'notes.txt'), 'mine');

    assert.deepEqual(await output.owned(), [
      { name: 'sign-in--old-title', owner: signIn },
    ]);
  });
});

test('BundleOutputDir removes only marked directories inside itself', async () => {
  await withOutputDir(async (root, output) => {
    await writeOwned(output, 'sign-in--old-title');
    await mkdir(path.join(root, 'hand-made'));
    const outside = await mkdtemp(path.join(tmpdir(), 'qa-outside-'));
    try {
      await output.remove([
        'sign-in--old-title',
        'hand-made',
        '..',
        path.relative(root, outside),
        'missing',
      ]);

      assert.deepEqual(await readdir(root), ['hand-made']);
      assert.deepEqual(await readdir(outside), []);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

const owned: OwnedBundleDir[] = [
  { name: 'sign-in--old-title', owner: signIn },
  { name: 'sign-in--new-title', owner: signIn },
  { name: 'cart--add', owner: { file: '/proj/tests/cart.spec.ts' } },
];

test('StaleBundlePolicy prunes owned directories a complete run did not write', () => {
  const policy = new StaleBundlePolicy();

  assert.deepEqual(
    policy.staleDirs(owned, new Set(['sign-in--new-title']), 'complete'),
    ['sign-in--old-title', 'cart--add'],
  );
});

test('StaleBundlePolicy prunes nothing after a partial run', () => {
  const policy = new StaleBundlePolicy();

  assert.deepEqual(
    policy.staleDirs(owned, new Set(['sign-in--new-title']), 'partial'),
    [],
  );
});

test('StaleBundlePolicy keeps directories of tests the select option leaves out', () => {
  const policy = new StaleBundlePolicy(new TestSelection({ tags: ['@qa'] }));

  assert.deepEqual(
    policy.staleDirs(owned, new Set(['sign-in--new-title']), 'complete'),
    ['sign-in--old-title'],
  );
});
