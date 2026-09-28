import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

type PackageJson = {
  name: string;
  exports: Record<string, string>;
  bin?: Record<string, string>;
  files?: string[];
  dependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

// Tests run from dist-test/test/package/, three levels below the package root.
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  ) as PackageJson;
}

async function importEntry(subpath: string): Promise<Record<string, unknown>> {
  const pkg = await readPackageJson();
  return (await import(path.join(packageRoot, pkg.exports[subpath]))) as Record<
    string,
    unknown
  >;
}

/** Every built module reachable from `entry` through relative imports. */
async function reachableModules(entry: string): Promise<Map<string, string>> {
  const modules = new Map<string, string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (modules.has(file)) continue;
    const source = await readFile(file, 'utf8');
    modules.set(file, source);
    for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
      pending.push(path.resolve(path.dirname(file), match[1]));
    }
  }
  return modules;
}

test('one package, published as @procyon-creative/qa-instructions', async () => {
  const pkg = await readPackageJson();
  assert.equal(pkg.name, '@procyon-creative/qa-instructions');
  assert.deepEqual(pkg.files, ['dist']);
});

test('package exposes the core and the Playwright reporter entry points', async () => {
  const pkg = await readPackageJson();
  assert.deepEqual(Object.keys(pkg.exports), ['.', './playwright']);
});

test('"." exports the core public API: types, renderers, bundle IO', async () => {
  const core = await importEntry('.');
  for (const name of [
    'render',
    'RENDER_FORMATS',
    'BundleRenderer',
    'readBundle',
    'writeBundle',
    'QaInstructionsRecorder',
  ]) {
    assert.ok(name in core, `"." does not export ${name}`);
  }
});

test('"./playwright" exports only the reporter, as its default', async () => {
  const exported = await importEntry('./playwright');
  assert.deepEqual(Object.keys(exported), ['default']);
});

test('package provides the qa-instructions command', async () => {
  const pkg = await readPackageJson();
  assert.deepEqual(Object.keys(pkg.bin ?? {}), ['qa-instructions']);
  const bin = await readFile(
    path.join(packageRoot, pkg.bin?.['qa-instructions'] ?? ''),
    'utf8',
  );
  assert.match(bin, /^#!\/usr\/bin\/env node\n/);
});

test('Playwright is an optional peer, never a runtime dependency', async () => {
  const pkg = await readPackageJson();
  assert.equal(pkg.peerDependenciesMeta?.['@playwright/test']?.optional, true);
  const runtimeDeps = Object.keys(pkg.dependencies ?? {});
  assert.ok(
    !runtimeDeps.some((name) => name.includes('playwright')),
    `runtime dependencies include Playwright: ${runtimeDeps.join(', ')}`,
  );

  const entries = [
    ...Object.values(pkg.exports),
    ...Object.values(pkg.bin ?? {}),
  ];
  for (const target of entries) {
    const modules = await reachableModules(path.join(packageRoot, target));
    for (const [file, source] of modules) {
      assert.doesNotMatch(
        source,
        /(from|import)\s*\(?\s*'@?playwright/,
        `${path.relative(packageRoot, file)} loads Playwright at runtime`,
      );
    }
  }
});

test('the core entry point reaches no Playwright adapter or drawing code', async () => {
  const pkg = await readPackageJson();
  const modules = await reachableModules(
    path.join(packageRoot, pkg.exports['.']),
  );
  for (const [file, source] of modules) {
    const relative = path.relative(packageRoot, file);
    assert.ok(
      relative.startsWith(path.join('dist', 'core')),
      `${relative} is outside the core`,
    );
    assert.doesNotMatch(source, /(from|import)\s*\(?\s*'sharp'/, relative);
  }
});
