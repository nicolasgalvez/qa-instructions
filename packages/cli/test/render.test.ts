import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findBundles, renderAll } from '../src/render.js';

test('findBundles discovers bundle directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-cli-'));
  try {
    const bundleDir = path.join(root, 'login--user-can-log-in');
    await mkdir(bundleDir, { recursive: true });
    await writeFile(
      path.join(bundleDir, 'bundle.json'),
      '{"version":"1","meta":{"title":"Login","capturedAt":"2026-01-01T00:00:00.000Z","status":"complete"},"steps":[],"assets":{}}',
    );

    const found = await findBundles(root);
    assert.equal(found.length, 1);
    assert.equal(found[0], bundleDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renderAll writes qa-steps files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-cli-'));
  const out = path.join(root, 'out');
  const bundleDir = path.join(root, 'bundle');
  try {
    await mkdir(bundleDir, { recursive: true });
    await writeFile(
      path.join(bundleDir, 'bundle.json'),
      JSON.stringify({
        version: '1',
        meta: {
          title: 'Login',
          prerequisite: 'Deploy first.',
          capturedAt: '2026-01-01T00:00:00.000Z',
          status: 'complete',
        },
        steps: [{ index: 1, action: 'Open /login', expected: 'Form loads' }],
        assets: {},
      }),
    );

    await renderAll([bundleDir], 'qa-steps', out);
    const text = await readFile(path.join(out, 'bundle.txt'), 'utf8');
    assert.match(text, /Deploy first\./);
    assert.match(text, /1\. Open \/login — Form loads/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** A bundle directory with one Step Screenshot on disk. */
async function bundleWithScreenshot(root: string): Promise<string> {
  const bundleDir = path.join(root, 'login--user-can-log-in');
  await mkdir(path.join(bundleDir, 'assets'), { recursive: true });
  await writeFile(path.join(bundleDir, 'assets', 'step-01.png'), 'png-bytes');
  await writeFile(
    path.join(bundleDir, 'bundle.json'),
    JSON.stringify({
      version: '1',
      meta: {
        title: 'Login',
        capturedAt: '2026-01-01T00:00:00.000Z',
        status: 'complete',
      },
      steps: [
        {
          index: 1,
          action: 'Open /login',
          expected: 'Form loads',
          assetIds: ['step-01', 'step-02'],
        },
      ],
      assets: {
        'step-01': {
          id: 'step-01',
          contentType: 'image/png',
          filename: 'step-01.png',
        },
        'step-02': {
          id: 'step-02',
          contentType: 'image/png',
          filename: 'step-02.png',
        },
      },
    }),
  );
  return bundleDir;
}

test('renderAll writes Markdown whose image links resolve from the output dir', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-cli-'));
  const out = path.join(root, 'out');
  try {
    const bundleDir = await bundleWithScreenshot(root);

    await renderAll([bundleDir], 'markdown', out);
    const markdown = await readFile(
      path.join(out, 'login--user-can-log-in.md'),
      'utf8',
    );
    const link = /!\[Step 1: Open \/login\]\(([^)]+)\)/.exec(markdown)?.[1];
    assert.equal(link, 'login--user-can-log-in/step-01.png');
    assert.equal(await readFile(path.join(out, link), 'utf8'), 'png-bytes');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renderAll writes self-contained HTML with embedded screenshots', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qa-cli-'));
  const out = path.join(root, 'out');
  try {
    const bundleDir = await bundleWithScreenshot(root);

    await renderAll([bundleDir], 'html', out);
    const html = await readFile(
      path.join(out, 'login--user-can-log-in.html'),
      'utf8',
    );
    const embedded = Buffer.from('png-bytes').toString('base64');
    assert.match(html, new RegExp(`src="data:image/png;base64,${embedded}"`));
    assert.match(html, /Form loads/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
