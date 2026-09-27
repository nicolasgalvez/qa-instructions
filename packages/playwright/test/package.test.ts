import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

type PackageJson = {
  exports: Record<string, string>;
  dependencies?: Record<string, string>;
};

// Tests run from dist-test/test/, two levels below the package root.
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

async function readPackageJson(): Promise<PackageJson> {
  return JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  ) as PackageJson;
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

test('package exposes only the reporter entry point', async () => {
  const pkg = await readPackageJson();
  assert.deepEqual(Object.keys(pkg.exports), ['./reporter']);
});

test('reporter entry point exports the reporter and nothing from Playwright', async () => {
  const pkg = await readPackageJson();
  const entry = path.join(packageRoot, pkg.exports['./reporter']);
  const exported = (await import(entry)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(exported), ['default']);
});

test('package has no runtime dependency on Playwright', async () => {
  const pkg = await readPackageJson();
  const runtimeDeps = Object.keys(pkg.dependencies ?? {});
  assert.ok(
    !runtimeDeps.some((name) => name.includes('playwright')),
    `runtime dependencies include Playwright: ${runtimeDeps.join(', ')}`,
  );

  for (const target of Object.values(pkg.exports)) {
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
