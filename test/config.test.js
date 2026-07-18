'use strict';

// Regression tests for fail-closed APP_SECRET (review fix #2, 2026-07-12).
// The bug: the app booted on the public default secret with only a console.warn,
// so a production deploy that forgot APP_SECRET would sign sessions and encrypt
// child data under a globally-known key. The fix refuses to boot in a real
// context; local demo still warns.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertSecretSafe, INSECURE_DEFAULT_SECRET } = require('../server/config');

const DEFAULT = { appSecret: INSECURE_DEFAULT_SECRET, demoMode: true };

test('a real secret is always fine', () => {
  assert.doesNotThrow(() =>
    assertSecretSafe({ appSecret: 'a-real-strong-secret', demoMode: false }, { NODE_ENV: 'production' }));
});

test('default secret is allowed (warn only) in local demo mode', () => {
  assert.doesNotThrow(() => assertSecretSafe(DEFAULT, {}));
});

test('default secret FAILS CLOSED in production', () => {
  assert.throws(() => assertSecretSafe(DEFAULT, { NODE_ENV: 'production' }), /FATAL: APP_SECRET/);
});

test('default secret FAILS CLOSED in non-demo mode (real keys/data)', () => {
  assert.throws(
    () => assertSecretSafe({ appSecret: INSECURE_DEFAULT_SECRET, demoMode: false }, {}),
    /FATAL: APP_SECRET/);
});

test('ALLOW_INSECURE_SECRET=true overrides the hard stop for deliberate local tests', () => {
  assert.doesNotThrow(() =>
    assertSecretSafe(DEFAULT, { NODE_ENV: 'production', ALLOW_INSECURE_SECRET: 'true' }));
});
