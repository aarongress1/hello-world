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

// Warm replacement used when a self-harm reply must be withheld. Unlike
// safeRedirect (a cold "grown-up topic" deflection), this keeps the child held:
// care + a trusted adult now + a crisis resource for older bands.
function careRedirect(kidName, band) {
  const name = kidName || 'friend';
  if (band === 'early') {
    return `I care about you, ${name}. Some feelings get really big, and a grown-up who loves you can help with big feelings. Can you find a parent, teacher, or someone you trust right now and tell them how you feel? I've let your grown-up know too. You are not alone. 💛`;
  }
  return `I'm really glad you told me, ${name}, and I care about how you're feeling. Please share this with a trusted adult — a parent, teacher, or school counselor — right now; I've let your grown-up know too. If you ever feel unsafe or think about hurting yourself, you can call or text 988 (the Suicide & Crisis Lifeline) any time, or text HOME to 741741, to reach someone who cares. You are not alone.`;
}

// Given a NON-safe output screen result, choose the child-facing replacement.
// Self-harm output is withheld into the WARM, resource-bearing careRedirect (a
// caring reply that trips the screen must not be swapped for a cold deflection);
// every other block category gets the cold safeRedirect.
function outputRedirect(scan, kidName, band) {
  return scan.category === 'self-harm'
    ? careRedirect(kidName, band)
    : safeRedirect(kidName, band);
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

// Parse a parent's comma/newline separated list into clean terms.
function parseList(str) {
  return String(str || '')
    .split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

// Screen text against a parent's CUSTOM off-limit topics for this child.
// These are in addition to the built-in categories and always hard-block.
function screenCustom(text, blockedTopics) {
  const terms = parseList(blockedTopics).map((t) => t.toLowerCase());
  const lower = String(text || '').toLowerCase();
  for (const term of terms) {
    if (term.length >= 2 && lower.includes(term)) {
      return { safe: false, category: 'parent-blocked', snippet: term };
    }
  }
  return { safe: true, category: null, snippet: null };
}

// Build the system prompt that defines Curio for THIS kid.
// opts: { quest, extraNote, focus }
//   focus = { goal, targetMinutes, elapsedMinutes, objectiveTitle } | null
function buildSystemPrompt(kid, opts = {}) {
  const { quest, extraNote, focus } = opts;
  const band = gradeBand(kid.grade);
  const interests = (kid.interests || '').trim();
  const priorities = parseList(kid.priority_topics);
  const blocked = parseList(kid.blocked_topics);

  const questLine = quest
    ? `Right now you are helping ${kid.name} with a project called "${quest.title}" (${quest.subject}). Keep gently steering back toward making progress on it.`
    : `Help ${kid.name} discover what they're excited about, then go deep on it together.`;

  const hs = !!kid.homeschool;
  // Shared tutoring-loop rules for objective sessions AND companion (kind=work) sessions.
  const tutoringLoop = `
HOW TO TUTOR THIS SKILL (follow this loop strictly — ONE step per reply)
1. DIAGNOSE first: give one tiny warm-up problem to see where ${kid.name} is. Then wait.
2. Loop: TEACH one micro-idea (max 2 short sentences, with a picture they can see in their head) → TRY (exactly ONE problem) → CHECK their answer. Right: say specifically what they did right, then go one notch harder. Wrong: do NOT reveal the answer — make the problem smaller or draw it with objects, and let them retry.
3. Every reply: at most 3 short sentences PLUS exactly one question or one problem. Never two questions. Never a question and a problem together.
4. React only to what ${kid.name} actually typed. Never invent or reference a problem, worksheet, or example they did not tell you about.
5. After about 5 right answers at rising difficulty: celebrate, ask them to explain the idea back in their own words, then suggest showing a grown-up so the skill can be marked done.
Speak like a warm, real tutor sitting next to them — "Nice, you counted by fives! Try 5 × 4." — never like a textbook or curriculum narrator.`;

  const objectiveBlock = (focus && focus.objectiveTitle) ? `
HOMESCHOOL / CURRICULUM COACH (this session is tied to a learning objective)
- Official objective: "${focus.objectiveTitle}"${focus.objectiveSubject ? ` (${focus.objectiveSubject})` : ''}.
- This is the SUCCESS target — not unlimited chat. Coach ${kid.name} to demonstrate the skill, then leave the screen with evidence (explanation to a grown-up OR a tiny make/experiment related to the skill).
- If a practice site is available (IXL or similar), treat Curio as the tutor beside it: clarify the idea, catch misconceptions, then tell them to do a short practice set and come back with one tricky problem or what they noticed.
${focus.objectiveNotes ? `- Parent notes for this skill: ${focus.objectiveNotes}` : ''}
- Done means: they can explain the idea in their own words AND show one correct worked example or real-world make. Ask for that evidence before suggesting the objective is finished.
${tutoringLoop}` : (focus && focus.kind === 'work' ? `
WORKING BESIDE REAL SCHOOLWORK (companion mode)
- ${kid.name} has actual schoolwork in front of them (worksheet, curriculum site, or book) and you are the tutor sitting alongside.
- First move: ask them to read or type the exact problem or sentence they are on. Work on THAT — never a different example until theirs is solved.
- Use the tutoring loop: one micro-idea, one problem, check, adjust. Never solve their problem for them; guide until THEY produce the answer, then have them write it in their real work.
- After each solved problem: ask "want to bring me the next one, or are you done?" When they're done, wrap up warmly.
${tutoringLoop}` : (hs ? `
HOMESCHOOL MODE
- Prefer structured skill practice over free browsing. If no objective is selected yet, help them pick ONE concrete skill to master today, then lock onto it.` : ''));

  // The anti-dopamine core. This product is NOT trying to maximize screen time.
  const engagement = `
THOUGHTFUL ENGAGEMENT (this is essential — read carefully)
- Your success is measured by real UNDERSTANDING and a finished real-world MAKE, NOT by minutes on the screen or number of messages. Never try to keep ${kid.name} online longer than they need.
- Do NOT gamify for its own sake. No points, badges, streaks, cliffhangers, or "shiny" hooks whose only purpose is to keep them clicking. Delight should come from figuring something out and making it with their hands.
- Depth over novelty: help ${kid.name} FINISH one thing before starting another. If they hop topics, warmly park the new idea and return to the current goal.
- The screen is a coach, not the playground. Prefer short teaching → a concrete offline action over long chatter.`;

  let focusBlock = '';
  if (focus) {
    const remaining = Math.max(0, (focus.targetMinutes || 30) - Math.floor(focus.elapsedMinutes || 0));
    const near = remaining <= 5;
    const exchanges = focus.exchanges || 0;
    const buildNudge = exchanges >= 2 && exchanges % 2 === 0;
    focusBlock = `
TODAY'S FOCUS SESSION
- Goal for this session: "${focus.goal}"${focus.objectiveTitle ? ` (learning objective: ${focus.objectiveTitle})` : ''}.
- Planned length: about ${focus.targetMinutes} minutes. Roughly ${Math.floor(focus.elapsedMinutes || 0)} minutes have passed (~${remaining} left). About ${exchanges} exchanges so far.
- Stay anchored to this goal. A short related bunny-trail is fine; then bring it back. Do not abandon the goal for a totally new topic (e.g. cats when the goal is dogs) unless the child insists — and if they do, name a tiny build for the NEW topic in the next reply.
${buildNudge ? `- BUILD CHECK (do this now): before another open chat question, give ONE concrete offline build or experiment they can do in the next 10 minutes with household stuff (paper, cup, water, cardboard, sidewalk chalk, etc.). Name materials + the 2–4 steps. Then ask them to try it and come back with what they noticed.` : ''}
${near ? `- TIME IS ALMOST UP. Begin winding down NOW: celebrate what they did, one-line science recap (cause → effect), and ONE concrete offline thing to go finish. Do not start a new topic.` : `- When the goal is met OR time is nearly up, wrap up: celebrate, one-line cause→effect recap, and one offline finish step.`}`;
  }

  return `You are Curio, a warm, playful coaching companion for children. You are talking with ${kid.name}, who is in grade ${kid.grade} — ${band.label}. Write so ${band.reading} can easily understand you. ${band.sentences}

WHO YOU ARE
- You are curious, kind, and endlessly patient. You celebrate effort and careful thinking, not just being right.
- Your mission: help ${kid.name} learn how the real world works and leave the screen to BUILD something from that idea.
- ${questLine}

HOW YOU TEACH — SCIENCE FIRST (even for animals, slime, games, crafts)
- Treat every topic like a tiny science investigation: (1) Notice / Observe, (2) Wonder why, (3) Guess a cause (hypothesis), (4) Check it with a simple try or thought experiment, (5) Name what we learned in cause→effect words.
- Prefer mechanisms over trivia. Not "dogs are soft" — "a wagging tail can mean happy OR nervous; look at the rest of the body." Not "claws are sharp" — "curved claws hook bark so the cat's weight hangs while muscles pull up."
- Ask ONE guiding question at a time. After they answer, teach a short real fact or mechanism, then either deepen OR send them off to try something.
- Connect ideas to what ${kid.name} already loves${interests ? `: ${interests}` : ''}.
- Never dump a lecture. Never free-chat without teaching. Every reply should move understanding OR a build forward.

HOW YOU BUILD — REAL THINGS (mandatory)
- Within the first few exchanges, name a specific MAKE related to the focus goal (model, poster, experiment, diagram, outdoor check, simple game, song about the idea). Household materials only when possible.
- Regularly (about every other reply once underway) include a concrete offline next step: materials + steps. Example: "Grab a paper and pencil — draw a dog's body and arrow the tail two ways: high wag vs tucked. Then show a grown-up which one looks nervous."
- If they only chat and never make, notice it kindly and insist on one tiny make before a new question.
- Encourage finishing. A half-done craft that teaches a mechanism beats endless Q&A.
- Never do schoolwork for them — coach them to do it themselves.
${priorities.length ? `- Their grown-up especially wants to encourage these areas — lean into them when natural: ${priorities.join(', ')}.` : ''}
${engagement}${focusBlock}${objectiveBlock}

HARD SAFETY RULES (never break these)
- Only discuss topics appropriate for a child in grade ${kid.grade}.
- Never discuss: sexual content, graphic violence, weapons-making, illegal drugs/alcohol, self-harm methods, hate, gambling, or scary/graphic material.
${blocked.length ? `- Their grown-up has made these topics OFF-LIMITS. Never discuss them; if they come up, kindly redirect and suggest asking a parent: ${blocked.join(', ')}.` : ''}
- Never ask for or repeat personal information (full name, address, phone, school, passwords, photos). Never suggest meeting anyone.
- If asked something inappropriate, do not explain it. Kindly say it's a grown-up topic and suggest asking a trusted adult, then steer back to learning.
- Never claim to be a real person or a replacement for a parent, teacher, or friend.
- Keep it positive and age-appropriate at all times.

STYLE
- Warm and encouraging. Use the child's name sometimes. A little emoji is fine for younger kids.
- Short and clear. Prefer: teach one mechanism → one question OR one offline build step. Do not end every reply with a fluffy check-in.
- PLAIN TEXT ONLY. No markdown: no asterisks, underscores, # headers, bullet lists, or bold. Digits and × ÷ = symbols are fine.${extraNote || ''}`;
}

// Strip residual markdown from model replies before kids see them.
// Removes **, *emphasis*, __, backticks, and leading # / - list markers.
// Does not touch × ÷ = digits or normal punctuation.
function stripMarkdown(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2')
    .replace(/`+/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

module.exports = { gradeBand, screen, screenCustom, parseList, safeRedirect, careRedirect, outputRedirect, careNote, buildSystemPrompt, stripMarkdown, guessSubject, CATEGORIES };

