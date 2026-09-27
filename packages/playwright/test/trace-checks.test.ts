import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { CheckRef } from '../src/reporter/action-ref.js';
import { TraceScreenshotSource } from '../src/reporter/trace-screenshot-source.js';

function fixture(name: string): string {
  return fileURLToPath(
    new URL(`../../test/fixtures/traces/${name}`, import.meta.url),
  );
}

// The scenario's checks (test/fixtures/traces/scenario.spec.ts), numbered
// among its `expect` steps: a check on an element, then one on a value the
// test read.
const VISIBLE = CheckRef.of(1, 'Expect "toBeVisible"');
const TO_BE = CheckRef.of(2, 'Expect "toBe"');

for (const version of [8, 9, 10]) {
  test(`trace format ${version}: a check's element and expected value come from the trace`, async () => {
    const source = await TraceScreenshotSource.open(fixture(`v${version}.zip`));
    assert.deepEqual(source.check(VISIBLE), {
      target: { by: 'role', role: 'button', name: 'Paint' },
    });
    assert.deepEqual(source.check(TO_BE), { expected: 'Paint' });
    assert.equal(source.check(CheckRef.of(3, 'Expect "toBe"')), undefined);
  });
}

/** The v8 sample with its test runner trace rewritten. */
async function v8With(
  rewrite: (testTrace: string) => string,
): Promise<TraceScreenshotSource> {
  const entries = unzipSync(await readFile(fixture('v8.zip')));
  entries['test.trace'] = strToU8(rewrite(strFromU8(entries['test.trace'])));
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-trace-'));
  try {
    const file = path.join(dir, 'trace.zip');
    await writeFile(file, zipSync(entries));
    return await TraceScreenshotSource.open(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('trace format 8 as Playwright 1.53–1.54 write it (every step method "step") gives the same checks', async () => {
  const source = await v8With((trace) =>
    trace.replaceAll('"method":"expect"', '"method":"step"'),
  );
  assert.deepEqual(source.check(TO_BE), { expected: 'Paint' });
});

test('an expected value the trace could only record as "Object" is not a value', async () => {
  const source = await v8With((trace) =>
    trace.replace('"expected":"Paint"', '"expected":"Object"'),
  );
  assert.equal(source.check(TO_BE), undefined);
});
