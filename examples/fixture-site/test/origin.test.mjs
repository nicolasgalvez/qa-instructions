import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FixtureOrigin } from '../origin.mjs';

test('defaults to port 4321 when FIXTURE_PORT is unset', () => {
  const origin = FixtureOrigin.fromEnv({});
  assert.equal(origin.port, 4321);
  assert.equal(origin.url, 'http://127.0.0.1:4321');
});

test('takes its port from FIXTURE_PORT', () => {
  const origin = FixtureOrigin.fromEnv({ FIXTURE_PORT: '4400' });
  assert.equal(origin.port, 4400);
  assert.equal(origin.url, 'http://127.0.0.1:4400');
});

test('rejects a FIXTURE_PORT that is not a port number', () => {
  assert.throws(() => FixtureOrigin.fromEnv({ FIXTURE_PORT: 'abc' }));
  assert.throws(() => FixtureOrigin.fromEnv({ FIXTURE_PORT: '70000' }));
});

test("rewrites the run's origin to the canonical one", () => {
  const origin = new FixtureOrigin(4400);
  assert.equal(
    origin.canonicalize(
      '1. Open http://127.0.0.1:4400/login\n2. Open http://127.0.0.1:4400/',
    ),
    '1. Open http://127.0.0.1:4321/login\n2. Open http://127.0.0.1:4321/',
  );
});

test('leaves a longer port that only starts with the run port alone', () => {
  const origin = new FixtureOrigin(4400);
  assert.equal(
    origin.canonicalize('Open http://127.0.0.1:44001/'),
    'Open http://127.0.0.1:44001/',
  );
});

test('leaves text unchanged on the canonical port', () => {
  const text = 'Open http://127.0.0.1:4321/faq';
  assert.equal(new FixtureOrigin(4321).canonicalize(text), text);
});
