'use strict';

// Prompt coaching regressors: science method + offline build must stay in the system prompt.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSystemPrompt } = require('../server/safety');

const kid = { name: 'Adelia', grade: '2', interests: 'dogs, slime', blocked_topics: '', priority_topics: 'science' };

describe('buildSystemPrompt coaching posture', () => {
  it('requires science-method and offline-build language', () => {
    const p = buildSystemPrompt(kid, {
      focus: { goal: 'Dogs', targetMinutes: 30, elapsedMinutes: 4, exchanges: 2 },
    });
    assert.match(p, /SCIENCE FIRST/i);
    assert.match(p, /hypothesis/i);
    assert.match(p, /cause→effect|cause→effect|cause->effect|cause/i);
    assert.match(p, /HOW YOU BUILD/i);
    assert.match(p, /BUILD CHECK/i);
    assert.match(p, /Dogs/);
  });

  it('locks onto a curriculum objective when provided', () => {
    const p = buildSystemPrompt({ ...kid, homeschool: 1 }, {
      focus: {
        goal: 'Add within 20',
        targetMinutes: 25,
        elapsedMinutes: 2,
        exchanges: 1,
        objectiveTitle: 'Add and subtract within 20',
        objectiveSubject: 'Math',
        objectiveNotes: 'Do starred IXL items first',
      },
    });
    assert.match(p, /HOMESCHOOL \/ CURRICULUM COACH/i);
    assert.match(p, /Add and subtract within 20/);
    assert.match(p, /starred IXL/);
  });

  it('does not encourage endless chat without a make', () => {
    const p = buildSystemPrompt(kid, {});
    assert.match(p, /Never free-chat without teaching/i);
    assert.match(p, /insist on one tiny make/i);
  });
});
