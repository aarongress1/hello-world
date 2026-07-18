'use strict';

// Regression tests for the output-screen self-harm gap (CSO sign-off 2026-07-12).
// The bug: the output screen re-filtered through HARD_BLOCK, which omits
// 'self-harm', so a model reply flagged as self-harm reached the child. The fix
// withholds ANY block-severity output and routes self-harm to a WARM,
// resource-bearing careRedirect instead of the cold safeRedirect.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const safety = require('../server/safety');

// --- The gap itself: self-harm output MUST be caught by screen() ---
test('screen() flags a model reply containing self-harm content', () => {
  const scan = safety.screen('If you feel that way you might think about suicide.');
  assert.equal(scan.safe, false);
  assert.equal(scan.category, 'self-harm');
});

test('screen() flags a model reply containing weapons content', () => {
  const scan = safety.screen('Sure, here is how to make a bomb at home.');
  assert.equal(scan.safe, false);
  assert.equal(scan.category, 'violence-weapons');
});

// --- The branch: self-harm -> warm careRedirect, everything else -> cold safeRedirect ---
test('outputRedirect routes self-harm output to the WARM care redirect, not the cold one', () => {
  const scan = safety.screen('...suicide...');
  const msg = safety.outputRedirect(scan, 'Sam', 'upper');
  // Warm: cares, names a trusted adult, carries a crisis resource for older bands.
  assert.match(msg, /trusted adult|parent, teacher/i);
  assert.match(msg, /988/);
  // NOT the cold generic deflection.
  assert.doesNotMatch(msg, /grown-up topic/i);
  assert.notEqual(msg, safety.safeRedirect('Sam', 'upper'));
});

test('outputRedirect routes weapons output to the cold safeRedirect', () => {
  const scan = safety.screen('how to make a bomb');
  const msg = safety.outputRedirect(scan, 'Sam', 'upper');
  assert.equal(msg, safety.safeRedirect('Sam', 'upper'));
});

// --- Band-awareness: no crisis hotline for the youngest children (K-2) ---
test('careRedirect gives NO hotline to the early band, still warm + trusted adult', () => {
  const early = safety.careRedirect('Sam', 'early');
  assert.doesNotMatch(early, /988|741741/);
  assert.match(early, /grown-up|parent, teacher|trust/i);
});

test('careRedirect gives the crisis line to the upper band', () => {
  const upper = safety.careRedirect('Sam', 'upper');
  assert.match(upper, /988/);
  assert.match(upper, /741741/);
});
