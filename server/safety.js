'use strict';

// Curio's safety layer. Defense in depth — no single mechanism is trusted:
//   1. Input screen   — scan what the kid types BEFORE it reaches the model.
//   2. System prompt   — hard behavioral constraints tuned to the kid's grade.
//   3. Output screen   — scan what the model returns BEFORE the kid sees it.
//   4. Topic tagging   — label every exchange so parents get a debrief.
//   5. Provider moderation (optional) — OpenAI's moderation endpoint when a
//      parent has connected an OpenAI key, as an extra opinion.
//
// The local screens use curated pattern sets. They are intentionally
// conservative (better to over-flag and let a parent review) and are a
// backstop, not the primary guardrail — the tuned system prompt is.

// Grade → developmental band. Drives vocabulary, response length, and tone.
function gradeBand(grade) {
  const g = String(grade).toUpperCase();
  if (g === 'K' || g === '1' || g === '2') {
    return {
      band: 'early',
      label: 'ages 5–7 (K–2)',
      sentences: 'Use very short sentences and simple words. 2–4 sentences per reply.',
      reading: 'a 6-year-old',
    };
  }
  if (g === '3' || g === '4' || g === '5') {
    return {
      band: 'middle',
      label: 'ages 8–10 (grades 3–5)',
      sentences: 'Use short, clear sentences. Keep replies to a short paragraph.',
      reading: 'a 9-year-old',
    };
  }
  return {
    band: 'upper',
    label: 'ages 11–14 (grades 6–8)',
    sentences: 'You can use richer vocabulary and a few short paragraphs, but stay concrete.',
    reading: 'a 12-year-old',
  };
}

// Categories we screen for. Each has patterns and a severity.
//   block — refuse/replace and always surface to the parent.
//   warn  — allow but flag for the parent's debrief.
const CATEGORIES = [
  {
    name: 'self-harm',
    severity: 'block',
    patterns: [/\bkill myself\b/i, /\bsuicide\b/i, /\bself[-\s]?harm\b/i, /\bcut myself\b/i, /\bwant to die\b/i, /\bhurt myself\b/i, /\bend my life\b/i],
  },
  {
    name: 'violence-weapons',
    severity: 'block',
    patterns: [/\bhow to (make|build).{0,20}(bomb|explosive|gun|weapon)\b/i, /\bmake.{0,10}(bomb|explosive)\b/i, /\bhurt (someone|somebody|him|her|them)\b/i, /\bkill (someone|somebody|him|her|them|people)\b/i],
  },
  {
    name: 'sexual',
    severity: 'block',
    patterns: [/\bsex\b/i, /\bporn\b/i, /\bnude\b/i, /\bnaked\b/i, /\bgenital/i],
  },
  {
    name: 'substances',
    severity: 'block',
    patterns: [/\bhow to (get|make|buy).{0,15}(drugs|weed|cocaine|meth|vape|alcohol)\b/i, /\bget high\b/i],
  },
  {
    name: 'hate',
    severity: 'block',
    patterns: [/\bkill all\b/i, /\bhate (all )?(black|white|jewish|muslim|asian|gay|trans)\b/i],
  },
  {
    name: 'personal-info',
    severity: 'warn',
    patterns: [/\bmy (home )?address is\b/i, /\bmy phone number is\b/i, /\bmy password is\b/i, /\bmy school is\b/i, /\bmeet up\b/i, /\bmeet in person\b/i, /\bwhere do you live\b/i, /\bsend (me )?a (photo|picture|pic) of you\b/i],
  },
  {
    name: 'distress',
    severity: 'warn',
    patterns: [/\bnobody likes me\b/i, /\bi'?m scared\b/i, /\bi feel alone\b/i, /\bbullied\b/i, /\bbeing bullied\b/i, /\bhate myself\b/i, /\bi'?m sad\b/i],
  },
];

// Screen a piece of text. Returns { safe, severity, category, snippet } where
// severity is 'block' | 'warn' | null.
function screen(text) {
  const str = String(text || '');
  let worst = null;
  for (const cat of CATEGORIES) {
    for (const re of cat.patterns) {
      const m = str.match(re);
      if (m) {
        const hit = { severity: cat.severity, category: cat.name, snippet: m[0] };
        if (cat.severity === 'block') return { safe: false, ...hit };
        if (!worst) worst = hit; // remember first warn, keep scanning for a block
      }
    }
  }
  if (worst) return { safe: true, ...worst };
  return { safe: true, severity: null, category: null, snippet: null };
}

// A gentle, kid-facing replacement used when output must be withheld.
function safeRedirect(kidName, band) {
  const name = kidName || 'friend';
  if (band === 'early') {
    return `That's a grown-up topic, ${name}. Let's ask a grown-up you trust about that. Want to keep building our project instead? 🌟`;
  }
  return `That's something better to talk about with a trusted adult, ${name} — I've let your parent know you asked. Want to get back to what we were exploring? I've got some fun ideas.`;
}

// If a kid message signals distress or self-harm, we want the guide to respond
// with warmth and steer toward a trusted adult — this note is appended to the
// system prompt for that turn.
function careNote(category) {
  if (category === 'self-harm') {
    return `\n\nIMPORTANT: The child may be expressing thoughts of self-harm. Respond with warmth and calm. Gently and clearly encourage them to talk to a trusted adult (a parent, teacher, or school counselor) right now, and let them know they are cared about. Do not lecture. Keep it short. Do not continue the lesson until they feel heard.`;
  }
  if (category === 'distress') {
    return `\n\nNOTE: The child may be feeling sad, scared, or lonely. Lead with kindness, acknowledge their feeling, and gently suggest talking to a trusted grown-up. Then, only if they're ready, offer to keep exploring together.`;
  }
  if (category === 'personal-info') {
    return `\n\nNOTE: The child may be sharing personal information or discussing meeting someone. Kindly remind them never to share personal details (address, phone, school, photos) or meet people from the internet, and to check with a parent. Do not repeat any personal details they shared.`;
  }
  return '';
}

// Build the system prompt that defines Curio for THIS kid.
function buildSystemPrompt(kid, quest, extraNote) {
  const band = gradeBand(kid.grade);
  const interests = (kid.interests || '').trim();
  const questLine = quest
    ? `Right now you are helping ${kid.name} with a project called "${quest.title}" (${quest.subject}). Keep gently steering back toward making progress on it.`
    : `Help ${kid.name} discover what they're excited about, then go deep on it together.`;

  return `You are Curio, a warm, playful, and encouraging learning companion for children. You are talking with ${kid.name}, who is in grade ${kid.grade} — ${band.label}. Write so ${band.reading} can easily understand you. ${band.sentences}

WHO YOU ARE
- You are curious, kind, and endlessly patient. You celebrate effort, not just being right.
- Your mission: help ${kid.name} find their passions and build real confidence.
- ${questLine}

HOW YOU TEACH — FIRST PRINCIPLES
- Break every big idea down to its simplest building blocks, then build back up.
- Ask one guiding question at a time (Socratic). Let the child think and answer.
- Connect ideas to what ${kid.name} already loves${interests ? `: ${interests}` : ''}.
- Encourage making real things: a game, a small business, a song, a story, an experiment.
- When they're stuck, give a hint, not the whole answer. Praise the attempt.
- Never do the work for them if it's schoolwork — coach them to do it themselves.

HARD SAFETY RULES (never break these)
- Only discuss topics appropriate for a child in grade ${kid.grade}.
- Never discuss: sexual content, graphic violence, weapons-making, illegal drugs/alcohol, self-harm methods, hate, gambling, or scary/graphic material.
- Never ask for or repeat personal information (full name, address, phone, school, passwords, photos). Never suggest meeting anyone.
- If asked something inappropriate, do not explain it. Kindly say it's a grown-up topic and suggest asking a trusted adult, then steer back to learning.
- Never claim to be a real person or a replacement for a parent, teacher, or friend.
- Keep it positive and age-appropriate at all times.

STYLE
- Warm and encouraging. Use the child's name sometimes. A little emoji is fine for younger kids.
- Short and clear. Don't overwhelm. End with a question or a tiny next step to keep momentum.${extraNote || ''}`;
}

// Suggest a subject bucket from free text (for the parent's debrief). Cheap and
// local; the model-based classifier in llm.js can refine when available.
function guessSubject(text) {
  const t = String(text).toLowerCase();
  const map = [
    ['Coding & Games', /(code|coding|game|python|scratch|program|app|robot)/],
    ['Science', /(science|space|planet|dinosaur|volcano|experiment|chemistry|biology|physics|animal)/],
    ['Math', /(math|number|multipl|fraction|geometry|equation|count)/],
    ['Music & Arts', /(music|song|guitar|piano|draw|paint|art|dance|sing)/],
    ['Business & Money', /(business|money|sell|entrepreneur|lemonade|save|market)/],
    ['Writing & Stories', /(story|write|writing|book|poem|comic|novel)/],
    ['Sports & Health', /(sport|soccer|basketball|health|exercise|team)/],
    ['Nature & World', /(nature|ocean|weather|garden|plant|geography|country|history)/],
  ];
  for (const [label, re] of map) if (re.test(t)) return label;
  return 'General';
}

module.exports = { gradeBand, screen, safeRedirect, careNote, buildSystemPrompt, guessSubject, CATEGORIES };
