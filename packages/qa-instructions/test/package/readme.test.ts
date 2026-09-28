import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DEFAULT_HIGHLIGHT, RENDER_FORMATS } from '../../src/core/index.js';

// Tests run from dist-test/test/package/, three levels below the package root.
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const repoRoot = path.resolve(packageRoot, '..', '..');

/** The README's `## <heading>` section, up to the next `## ` heading. */
async function readmeSection(heading: string): Promise<string> {
  const readme = await readFile(path.join(repoRoot, 'README.md'), 'utf8');
  const start = readme.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `README has no "## ${heading}" section`);
  const end = readme.indexOf('\n## ', start + 1);
  return readme.slice(start, end < 0 ? undefined : end);
}

/** The property names declared in `type <name> = { ... };` in a source file. */
async function typeKeys(file: string, name: string): Promise<string[]> {
  const source = await readFile(file, 'utf8');
  const match = new RegExp(`type ${name} = \\{([\\s\\S]*?)\\n\\};`).exec(
    source,
  );
  assert.ok(match, `${name} not found in ${file}`);
  return [...match[1].matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
}

test('README documents every reporter option', async () => {
  const section = await readmeSection('Reporter options');
  const keys = await typeKeys(
    path.join(packageRoot, 'src', 'playwright', 'index.ts'),
    'QaInstructionsReporterOptions',
  );
  assert.ok(keys.length > 0);
  for (const key of keys) {
    assert.ok(
      section.includes(`### \`${key}\``),
      `README "Reporter options" has no heading for \`${key}\``,
    );
  }
});

test('README documents every select key', async () => {
  const section = await readmeSection('Reporter options');
  const keys = await typeKeys(
    path.join(packageRoot, 'src', 'core', 'selection.ts'),
    'TestSelectionOptions',
  );
  for (const key of keys) {
    assert.ok(section.includes(`\`${key}\``), `README omits select.${key}`);
  }
});

test('README states the default highlight', async () => {
  const section = await readmeSection('Reporter options');
  const quoted = DEFAULT_HIGHLIGHT.map((mark) => `'${mark}'`).join(', ');
  assert.ok(section.includes(`[${quoted}]`));
});

test('README lists every render format', async () => {
  const section = await readmeSection('Render');
  for (const format of RENDER_FORMATS) {
    assert.ok(
      section.includes(`| \`${format}\``),
      `README "Render" omits ${format}`,
    );
  }
});

test('README lists every format the formats option takes, and its default', async () => {
  const section = await readmeSection('Reporter options');
  const formats = section.slice(section.indexOf('### `formats`'));
  for (const format of RENDER_FORMATS) {
    assert.ok(
      formats.includes(`| \`${format}\``),
      `README "formats" omits ${format}`,
    );
  }
  assert.ok(section.includes("`['qa-steps']`"));
});

test('README states the peer dependency Playwright range', async () => {
  const pkg = JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  ) as { peerDependencies: Record<string, string> };
  const range = /^>=(\d+)\.(\d+)\.0$/.exec(
    pkg.peerDependencies['@playwright/test'],
  );
  assert.ok(range, 'peer range is not ">=X.Y.0"');
  const section = await readmeSection('Playwright versions');
  assert.ok(
    section.includes(`\`@playwright/test\` ${range[1]}.${range[2]} or later`),
  );
});
