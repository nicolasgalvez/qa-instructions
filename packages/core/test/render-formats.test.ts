import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  EmbeddedImages,
  RelativeImageLinks,
  render,
  renderHtml,
  renderMarkdown,
  renderQaSteps,
} from '../src/render/index.js';
import {
  RENDER_BUNDLE,
  RENDER_BUNDLE_IMAGES,
} from './fixtures/render-bundle.js';

// Compiled to dist-test/test; the goldens stay next to the sources.
const GOLDEN_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'test',
  'golden',
);

/**
 * Asserts output equals the named golden file. With `UPDATE_GOLDENS=1`, writes
 * the output as the new golden instead; review the diff before committing.
 */
async function assertGolden(output: string, name: string): Promise<void> {
  const file = path.join(GOLDEN_DIR, name);
  if (process.env.UPDATE_GOLDENS === '1') {
    await writeFile(file, output, 'utf8');
    return;
  }
  assert.equal(output, await readFile(file, 'utf8'));
}

test('text: renders the fixed bundle to its golden', async () => {
  await assertGolden(renderQaSteps(RENDER_BUNDLE), 'render-bundle.txt');
});

test('markdown: renders the fixed bundle to its golden', async () => {
  const output = renderMarkdown(RENDER_BUNDLE, {
    images: new RelativeImageLinks('sign-in', RENDER_BUNDLE_IMAGES.keys()),
  });
  await assertGolden(output, 'render-bundle.md');
});

test('markdown: nested Sections become deeper headings', () => {
  const output = renderMarkdown(RENDER_BUNDLE);
  assert.match(output, /^### Sign in$/m);
  assert.match(output, /^#### Enter the username$/m);
});

test('markdown: without images, no step links a screenshot', () => {
  assert.doesNotMatch(renderMarkdown(RENDER_BUNDLE), /!\[/);
});

test('markdown: links only screenshots that are available', () => {
  const output = renderMarkdown(RENDER_BUNDLE, {
    images: new RelativeImageLinks('out', ['step-02']),
  });
  assert.deepEqual(output.match(/\]\([^)]+\.png\)/g), ['](out/step-02.png)']);
});

test('markdown: continuation lines align under two-digit step numbers', () => {
  const output = renderMarkdown({
    ...RENDER_BUNDLE,
    meta: { ...RENDER_BUNDLE.meta, status: 'complete' },
    steps: [{ index: 12, action: 'Press **Tab**', expected: 'Focus moves' }],
  });
  assert.match(
    output,
    /^12\. Press \*\*Tab\*\*\n\n {4}\*\*Expected:\*\* Focus moves$/m,
  );
});

test('markdown: code spans are not escaped', () => {
  const output = renderMarkdown({
    ...RENDER_BUNDLE,
    steps: [{ index: 1, action: 'Type `<b>` into **Name**' }],
  });
  assert.match(output, /^1\. Type `<b>` into \*\*Name\*\*$/m);
});

test('html: renders the fixed bundle to its golden', async () => {
  const output = renderHtml(RENDER_BUNDLE, {
    images: new EmbeddedImages(RENDER_BUNDLE_IMAGES),
  });
  await assertGolden(output, 'render-bundle.html');
});

test('html: embeds screenshots as data URIs with alt text from the action', () => {
  const output = renderHtml(RENDER_BUNDLE, {
    images: new EmbeddedImages(RENDER_BUNDLE_IMAGES),
  });
  assert.match(
    output,
    /<img src="data:image\/png;base64,dHdv" alt="Step 2: Click the Sign in link">/,
  );
});

test('html: is self-contained, with no external scripts, styles, or fonts', () => {
  const output = renderHtml(RENDER_BUNDLE, {
    images: new EmbeddedImages(RENDER_BUNDLE_IMAGES),
  });
  assert.doesNotMatch(
    output,
    /<script|<link|@import|url\(|https?:\/\/[^"<\s]*\.(css|js|woff2?)/,
  );
  assert.doesNotMatch(output, /src="(?!data:)/);
  assert.match(output, /<style>/);
});

test('html: supports light and dark color schemes', () => {
  const output = renderHtml(RENDER_BUNDLE);
  assert.match(output, /<meta name="color-scheme" content="light dark">/);
  assert.match(output, /@media \(prefers-color-scheme: dark\)/);
});

test('html: escapes text and keeps inline emphasis and code', () => {
  const output = renderHtml(RENDER_BUNDLE);
  assert.match(output, /<h1>Sign in &amp; check &lt;welcome&gt;<\/h1>/);
  assert.match(output, /Click <code>Submit<\/code> &lt;b&gt;now&lt;\/b&gt;/);
  assert.doesNotMatch(output, /<b>now/);
});

test('html: nested Sections become nested sections with deeper headings', () => {
  const output = renderHtml(RENDER_BUNDLE);
  assert.match(
    output,
    /<section>\n<h2>Sign in<\/h2>[\s\S]*<section>\n<h3>Enter the username<\/h3>[\s\S]*<\/section>\n<ol start="4">[\s\S]*<\/section>\n<ol start="5">/,
  );
});

test('text, Markdown, and HTML show the same steps and notes', () => {
  const text = renderQaSteps(RENDER_BUNDLE);
  const markdown = renderMarkdown(RENDER_BUNDLE);
  const html = renderHtml(RENDER_BUNDLE);
  for (const phrase of [
    'the test failed at step 5, so any later steps are missing.',
    'Deploy the branch to dev first.',
    'Enter the username',
    'approximate: the test forced this Action past its usual checks',
    'test failed here',
    'Warning:',
  ]) {
    assert.ok(text.includes(phrase), `text shows "${phrase}"`);
    assert.ok(markdown.includes(phrase), `markdown shows "${phrase}"`);
    assert.ok(html.includes(phrase), `html shows "${phrase}"`);
  }
});

test('render dispatches markdown and html', () => {
  assert.equal(
    render(RENDER_BUNDLE, 'markdown'),
    renderMarkdown(RENDER_BUNDLE),
  );
  assert.equal(render(RENDER_BUNDLE, 'html'), renderHtml(RENDER_BUNDLE));
});
