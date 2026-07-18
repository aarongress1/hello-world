'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { stripMarkdown } = require('../server/safety');

describe('stripMarkdown', () => {
  it('removes bold, headers, and list markers without touching math symbols', () => {
    const input = '**bold**\n# header\n- list\nTry 5 × 4 = 20';
    const out = stripMarkdown(input);
    assert.equal(out.includes('**'), false);
    assert.equal(out.includes('#'), false);
    assert.equal(out.startsWith('- '), false);
    assert.match(out, /5 × 4 = 20/);
    assert.match(out, /bold/);
    assert.match(out, /header/);
    assert.match(out, /list/);
  });

  it('strips emphasis asterisks and backticks', () => {
    const out = stripMarkdown('The *commutative* property uses `backticks` and __underscores__');
    assert.equal(out.includes('*'), false);
    assert.equal(out.includes('`'), false);
    assert.equal(out.includes('__'), false);
    assert.match(out, /commutative/);
    assert.match(out, /backticks/);
    assert.match(out, /underscores/);
  });
});
