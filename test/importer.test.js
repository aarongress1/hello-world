'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCurriculum } = require('../server/importer');

const IXL_SAMPLE = `Math: Multiply by 2 — https://www.ixl.com/math/grade-3/multiply-by-2
Multiply by 5 | https://www.ixl.com/math/grade-3/multiply-by-5
https://www.ixl.com/math/grade-3/multiplication-facts-up-to-10
Language arts:
   Identify the main idea
   https://www.ixl.com/ela/grade-3/determine-the-main-idea`;

const URL_FREE = `Math: Add and subtract within 20
Math: Multiply by 2, 5, and 10
Language arts:
   Identify the main idea`;

describe('parseCurriculum IXL-aware', () => {
  it('extracts inline URLs, attaches following URLs, derives URL-only rows', () => {
    const rows = parseCurriculum(IXL_SAMPLE);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map((r) => r.title), [
      'Multiply by 2',
      'Multiply by 5',
      'Multiplication facts up to 10',
      'Identify the main idea',
    ]);
    assert.ok(rows.every((r) => r.resource_url && /ixl\.com/.test(r.resource_url)));
    assert.equal(rows[0].subject, 'Math');
    assert.equal(rows[2].subject, 'Math');
    assert.equal(rows[3].subject, 'Language arts');
    assert.match(rows[3].resource_url, /determine-the-main-idea/);
  });

  it('keeps URL-free pastes working (same titles/subjects as before)', () => {
    const rows = parseCurriculum(URL_FREE);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].title, 'Add and subtract within 20');
    assert.equal(rows[0].subject, 'Math');
    assert.equal(rows[0].resource_url, null);
    assert.equal(rows[2].title, 'Identify the main idea');
    assert.equal(rows[2].subject, 'Language arts');
  });

  it('merges URL onto duplicate title that lacked one', () => {
    const rows = parseCurriculum(`Multiply by 2
Multiply by 2 — https://www.ixl.com/math/grade-3/multiply-by-2`);
    assert.equal(rows.length, 1);
    assert.match(rows[0].resource_url, /multiply-by-2/);
  });
});
