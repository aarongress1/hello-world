'use strict';

// Provider abstraction. The parent connects their OWN Claude (Anthropic) or
// OpenAI account; Curio never marks up model usage — the parent pays their
// provider directly. This module speaks both APIs and falls back to a canned
// "demo" guide when no key is connected (config.demoMode).

const { demoMode, bundled } = require('./config');

const KNOWN_MODELS = {
  anthropic: [
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (balanced, recommended)' },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (most capable)' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast & economical)' },
  ],
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast & economical)' },
    { id: 'gpt-4o', label: 'GPT-4o (balanced, recommended)' },
    { id: 'gpt-4.1', label: 'GPT-4.1 (most capable)' },
  ],
};

// Cost/capability tiers → concrete model ids per provider. Used to route each
// child to an appropriately-priced model (keeps bundled COGS down).
const TIER_MODELS = {
  anthropic: { fast: 'claude-haiku-4-5', balanced: 'claude-sonnet-5', capable: 'claude-opus-4-8' },
  openai: { fast: 'gpt-4o-mini', balanced: 'gpt-4o', capable: 'gpt-4.1' },
};

function modelForTier(provider, tier) {
  return TIER_MODELS[provider]?.[tier] || null;
}

// "auto" routing by developmental band: youngest kids → the fast/cheap model,
// everyone else → balanced. (Haiku is plenty for K–2 and ~5× cheaper.)
function modelForBand(provider, band) {
  return modelForTier(provider, band === 'early' ? 'fast' : 'balanced');
}

// ---- Chat completion -------------------------------------------------------

// messages: [{ role: 'user'|'assistant', content }]
async function complete({ provider, apiKey, model, system, messages, maxTokens = 700 }) {
  if (provider === 'anthropic') return anthropicComplete({ apiKey, model, system, messages, maxTokens });
  if (provider === 'openai') return openaiComplete({ apiKey, model, system, messages, maxTokens });
  throw new Error(`Unknown provider: ${provider}`);
}

async function anthropicComplete({ apiKey, model, system, messages, maxTokens }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw providerError('Anthropic', res.status, await safeText(res));
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  return text || '…';
}

async function openaiComplete({ apiKey, model, system, messages, maxTokens }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  if (!res.ok) throw providerError('OpenAI', res.status, await safeText(res));
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '…').trim();
}

// ---- Natural text-to-speech (OpenAI voices) --------------------------------

async function tts({ apiKey, model, voice, text }) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: model || 'tts-1', voice: voice || 'nova', input: String(text).slice(0, 4000) }),
  });
  if (!res.ok) throw providerError('OpenAI TTS', res.status, await safeText(res));
  return Buffer.from(await res.arrayBuffer());
}

// ---- Provider-side moderation (OpenAI only) --------------------------------

// Returns { flagged, categories } or null if unavailable. Used as an extra
// opinion on top of Curio's local screen.
async function moderate({ provider, apiKey, input }) {
  if (provider !== 'openai') return null;
  try {
    const res = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results?.[0];
    if (!r) return null;
    const categories = Object.entries(r.categories || {}).filter(([, v]) => v).map(([k]) => k);
    return { flagged: !!r.flagged, categories };
  } catch {
    return null;
  }
}

// The server-side "bundled" provider secret (used when a parent hasn't connected
// their own key). Returns null if no CURIO_AI_KEY is configured.
function defaultSecret() {
  if (!bundled.apiKey || !bundled.provider) return null;
  const model = bundled.model || (KNOWN_MODELS[bundled.provider]?.[0]?.id);
  if (!model) return null;
  return { provider: bundled.provider, apiKey: bundled.apiKey, model };
}

// ---- Demo guide (no key connected) -----------------------------------------

function demoReply(kid, userText, focus) {
  const name = kid?.name || 'friend';
  const t = String(userText).toLowerCase();
  // Respect the thoughtful-engagement wind-down: if the focus session's time is
  // up, celebrate and send them off-screen rather than pulling them deeper.
  if (focus && focus.elapsedMinutes >= focus.target_minutes) {
    return `You did such good thinking today, ${name}! 🌿 That's a great place to stop. Here's your mission OFF the screen: go try one small piece of "${focus.goal}" in the real world — build it, draw it, or show someone. I'll be here next time. 👋`;
  }
  if (/game/.test(t)) {
    return `Ooh, a game! Love it, ${name}. 🎮 Let's think from the very start: every game needs a *goal* and a *rule*. What's one thing the player is trying to do — collect coins, reach the end, dodge something? Pick one and we'll build the tiniest version first.`;
  }
  if (/song|music/.test(t)) {
    return `A song?! Yes! 🎵 Here's a first-principles trick, ${name}: a song is just a feeling + a pattern. What feeling do you want people to have when they hear it — happy, brave, silly? Tell me, and we'll turn it into a little repeating beat.`;
  }
  if (/business|money|sell/.test(t)) {
    return `An entrepreneur! 💡 Every business starts with one question, ${name}: *whose problem am I solving?* Think of one person you know and one small thing that would make their day easier. Who comes to mind?`;
  }
  return `Great question, ${name}! Let's break it into the smallest piece first. What's the very first thing you're curious about? I'll ask you a question, you tell me what you think, and we'll build up the answer together. 🌱`;
}

// ---- Helpers ---------------------------------------------------------------

function providerError(name, status, body) {
  const hint = status === 401 ? ' (the API key may be wrong or expired)' : status === 429 ? ' (rate limited or out of credit)' : '';
  const err = new Error(`${name} API error ${status}${hint}`);
  err.status = status;
  err.body = body;
  err.isProvider = true;
  return err;
}

async function safeText(res) {
  try { return (await res.text()).slice(0, 500); } catch { return ''; }
}

// Starter curriculum presets for homeschool / self-guided plans. These are
// lightweight scaffolds a parent can import and then edit — not a full
// curriculum, and not tied to any specific state standard.
const CURRICULUM_PRESETS = {
  'early-explorer': {
    title: 'Early Explorer (K–2 sampler)',
    objectives: [
      ['Reading', 'Sound out and read 5 new words'],
      ['Math', 'Count and add up to 20 with objects'],
      ['Science', 'Observe something in nature and describe it'],
      ['Creativity', 'Make up and tell a short story'],
      ['Life Skills', 'Learn what "first principles" means with a simple example'],
    ],
  },
  'maker-track': {
    title: 'Young Maker Track (grades 3–5)',
    objectives: [
      ['Coding & Games', 'Design the rules for a simple game'],
      ['Coding & Games', 'Build a paper prototype of your game'],
      ['Business & Money', 'Find a real problem worth solving'],
      ['Writing & Stories', 'Write and revise a one-page story'],
      ['Science', 'Run a small experiment and record what happened'],
    ],
  },
  'passion-project': {
    title: 'Passion Project (grades 6–8)',
    objectives: [
      ['Discovery', 'List 3 things you are genuinely curious about'],
      ['Research', 'Learn the fundamentals of your top interest from first principles'],
      ['Build', 'Plan a real project you could make in 2 weeks'],
      ['Build', 'Create the first working version'],
      ['Reflect', 'Explain what you made and what you learned to someone'],
    ],
  },
};

module.exports = { complete, moderate, tts, demoReply, defaultSecret, modelForTier, modelForBand, KNOWN_MODELS, CURRICULUM_PRESETS, demoMode };
