'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSystemPrompt } = require('../server/safety');

const kid = { name: 'Adelia', grade: '3', interests: 'dogs', blocked_topics: '', priority_topics: '', homeschool: 0 };

describe('companion and tutor voice prompts', () => {
  it('emits companion block for kind=work without an objective', () => {
    const p = buildSystemPrompt(kid, {
      focus: { goal: 'Math: multiplication worksheet', targetMinutes: 30, elapsedMinutes: 0, kind: 'work', exchanges: 0 },
    });
    assert.match(p, /WORKING BESIDE REAL SCHOOLWORK/);
    assert.match(p, /HOW TO TUTOR THIS SKILL/);
    assert.match(p, /PLAIN TEXT ONLY/);
    assert.doesNotMatch(p, /HOMESCHOOL \/ CURRICULUM COACH/);
  });

  it('emits objective coach + tutoring loop for objective sessions', () => {
    const p = buildSystemPrompt(kid, {
      focus: {
        goal: 'Multiplication',
        targetMinutes: 30,
        elapsedMinutes: 1,
        objectiveTitle: 'Multiplication',
        kind: 'work',
        exchanges: 1,
      },
    });
    assert.match(p, /HOMESCHOOL \/ CURRICULUM COACH/);
    assert.match(p, /HOW TO TUTOR THIS SKILL/);
    assert.match(p, /Never invent or reference a problem/);
  });

  it('keeps HARD SAFETY RULES intact', () => {
    const p = buildSystemPrompt(kid, { focus: { goal: 'Dogs', kind: 'explore', exchanges: 0, targetMinutes: 30, elapsedMinutes: 0 } });
    const lines = [
      'HARD SAFETY RULES (never break these)',
      `- Only discuss topics appropriate for a child in grade ${kid.grade}.`,
      '- Never discuss: sexual content, graphic violence, weapons-making, illegal drugs/alcohol, self-harm methods, hate, gambling, or scary/graphic material.',
      '- Never ask for or repeat personal information (full name, address, phone, school, passwords, photos). Never suggest meeting anyone.',
      "- If asked something inappropriate, do not explain it. Kindly say it's a grown-up topic and suggest asking a trusted adult, then steer back to learning.",
      '- Never claim to be a real person or a replacement for a parent, teacher, or friend.',
      '- Keep it positive and age-appropriate at all times.',
    ];
    for (const line of lines) assert.ok(p.includes(line), `missing: ${line}`);
  });
});
