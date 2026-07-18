'use strict';

// Regression tests for at-rest field encryption of child PII (review fix #1,
// 2026-07-12). Transcripts/snippets/digests were stored cleartext; they are now
// envelope-encrypted with a legacy-plaintext fallback so existing rows still read.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encryptField, decryptField, encrypt } = require('../server/crypto');

test('round-trips child text through encrypt→decrypt', () => {
  const secret = "Sam said: I built a volcano! My address is 123 Main St.";
  const enc = encryptField(secret);
  assert.notEqual(enc, secret);                 // actually transformed
  assert.doesNotMatch(enc, /volcano|Main St/);  // plaintext not present in ciphertext
  assert.equal(decryptField(enc), secret);      // recovers exactly
});

test('ciphertext looks like <iv>:<tag>:<data> hex, not readable text', () => {
  const enc = encryptField('hello Curio');
  assert.match(enc, /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/);
});

test('legacy plaintext rows are returned unchanged (backward compatible)', () => {
  // A row written before encryption existed — plain words, not our hex shape.
  assert.equal(decryptField('I want to learn about dinosaurs'), 'I want to learn about dinosaurs');
  // Even text with colons that is not our exact ciphertext shape.
  assert.equal(decryptField('12:34:56 is when we start'), '12:34:56 is when we start');
});

test('null / undefined pass through untouched', () => {
  assert.equal(encryptField(null), null);
  assert.equal(decryptField(undefined), undefined);
});

test('empty string round-trips', () => {
  assert.equal(decryptField(encryptField('')), '');
});

test('a well-formed ciphertext from a DIFFERENT key does not decrypt to garbage — returns raw', () => {
  // decrypt() fails closed (returns null) on a bad tag; decryptField then hands
  // back the raw blob rather than throwing or emitting corrupted text.
  const forged = 'a'.repeat(24) + ':' + 'b'.repeat(32) + ':' + 'cc';
  assert.equal(decryptField(forged), forged);
});

test('two encryptions of the same text differ (random IV)', () => {
  assert.notEqual(encrypt('same text'), encrypt('same text'));
});
