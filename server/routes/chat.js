'use strict';

const store = require('../store');
const { requireParent } = require('../session');
const safety = require('../safety');
const llm = require('../llm');
const { demoMode, tts: ttsCfg, stt: sttCfg } = require('../config');

// Categories that are hard-blocked outright (no model call). Self-harm and
// distress are handled with a *caring* response path instead of a cold block.
const HARD_BLOCK = new Set(['sexual', 'violence-weapons', 'substances', 'hate']);

module.exports = function registerChat(app) {
  // Parent picks which child is using the app right now (kid session).
  app.post('/api/select-kid', requireParent(async (req, res) => {
    const kidId = Number(req.body?.kidId);
    if (kidId && !store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    store.setSessionKid(req.sid, kidId || null);
    res.json({ ok: true, kid: kidId ? store.getKid(kidId) : null });
  }));

  // The active kid + their quests + recent transcript, for the kid UI.
  app.get('/api/kid-context', requireParent(async (req, res) => {
    const kidId = req.session.kid_id;
    if (!kidId) return res.json({ error: 'No child selected.' }, 400);
    const kid = store.getKid(kidId);
    res.json({
      kid: publicKid(kid),
      quests: store.listQuests(kidId),
      objectives: store.listObjectives(kidId),
      nextObjective: store.nextObjective(kidId),
      activeFocus: (() => {
        const f = activeFocusFor(req.session);
        if (!f) return null;
        const withTime = withElapsed(f);
        if (!f.objective_id) return withTime;
        const obj = store.getObjective(f.objective_id);
        return obj ? { ...withTime, objective: {
          id: obj.id, title: obj.title, subject: obj.subject,
          resource_url: obj.resource_url || null, notes: obj.notes || '',
        } } : withTime;
      })(),
      messages: store.listMessages(kidId, null, 60),
      providerConnected: !!store.getProviderMeta(req.parent.id) || !!llm.defaultSecret() || demoMode,
    });
  }));

  // ---- Focus sessions: intentional, time-boxed learning ----
  app.post('/api/focus/start', requireParent(async (req, res) => {
    const kidId = req.session.kid_id;
    if (!kidId) return res.json({ error: 'No child selected.' }, 400);
    const kid = store.getKid(kidId);
    let objectiveId = req.body?.objectiveId ? Number(req.body.objectiveId) : null;
    let goal = String(req.body?.goal || '').slice(0, 200).trim();
    let kind = req.body?.kind === 'work' ? 'work' : 'explore';
    if (objectiveId) {
      const obj = store.getObjective(objectiveId);
      if (!obj || obj.kid_id !== kidId) objectiveId = null;
      else if (!goal) goal = obj.title;
    }
    // Objective presence wins — planned skill work is always 'work'.
    if (objectiveId) kind = 'work';
    if (!goal) goal = 'Explore and learn something new';
    const target = Math.min(90, Math.max(5, Number(req.body?.targetMinutes) || kid.session_minutes || 30));
    const focus = store.startFocus(kidId, { objective_id: objectiveId, goal, target_minutes: target, kind });
    store.setSessionFocus(req.sid, focus.id);
    const withTime = withElapsed(focus);
    let objective = null;
    if (objectiveId) {
      const obj = store.getObjective(objectiveId);
      if (obj) objective = {
        id: obj.id, title: obj.title, subject: obj.subject,
        resource_url: obj.resource_url || null, notes: obj.notes || '',
      };
    }
    res.json({ ok: true, focus: { ...withTime, objective, kind: focus.kind || kind } });
  }));

  app.post('/api/focus/end', requireParent(async (req, res) => {
    const focus = activeFocusFor(req.session);
    if (focus) {
      store.endFocus(focus.id, String(req.body?.reason || 'done').slice(0, 40));
      store.setSessionFocus(req.sid, null);
    }
    res.json({ ok: true });
  }));

  // Randomized, age-appropriate topic ideas for the kid's "Suggest a topic"
  // starter. Curated + shuffled so it never repeats the same canned line (the
  // old demo reply did), and it leans into the child's own interests when set.
  // Works with or without a model — no key required.
  app.get('/api/suggest-topics', requireParent(async (req, res) => {
    const kidId = req.session.kid_id;
    if (!kidId) return res.json({ error: 'No child selected.' }, 400);
    const kid = store.getKid(kidId);
    const band = safety.gradeBand(kid.grade).band;
    res.json({ ok: true, topics: suggestTopics(band, kid.interests, 6) });
  }));

  // Natural voice: synthesize Curio's reply with an OpenAI voice. Returns MP3
  // audio, or 402 if no OpenAI key is available (client then uses browser voice).
  app.post('/api/tts', requireParent(async (req, res) => {
    const text = String(req.body?.text || '').slice(0, 1200).trim();
    if (!text) return res.json({ error: 'No text.' }, 400);
    // Resolve an OpenAI key: env override → parent's BYO OpenAI key → bundled OpenAI.
    let key = ttsCfg.key;
    if (!key) { const p = store.getProviderSecret(req.parent.id); if (p?.provider === 'openai') key = p.apiKey; }
    if (!key) { const d = llm.defaultSecret(); if (d?.provider === 'openai') key = d.apiKey; }
    if (!key) return res.json({ error: 'no-tts' }, 402);
    try {
      const audio = await llm.tts({ apiKey: key, model: ttsCfg.model, voice: ttsCfg.voice, instructions: ttsCfg.instructions, text });
      res.writeHead(200, { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' });
      return res.end(audio);
    } catch {
      return res.json({ error: 'tts-failed' }, 200); // let the client fall back to browser voice
    }
  }));

  // Speech-to-text for browsers/WebViews without the Web Speech API (notably the
  // Android wrapper). The kid's audio arrives as base64, is transcribed via the
  // provider, and immediately discarded — never written to disk or the database
  // (CSO data-handling requirement). Returns 402 if no OpenAI key is available.
  app.post('/api/stt', requireParent(async (req, res) => {
    const b64 = String(req.body?.audio || '');
    if (!b64) return res.json({ error: 'No audio.' }, 400);
    if (b64.length > 900000) return res.json({ error: 'Audio too long.' }, 413); // ~40s of opus
    // Resolve an OpenAI key the same way as TTS: env override → parent BYO → bundled.
    let key = ttsCfg.key;
    if (!key) { const p = store.getProviderSecret(req.parent.id); if (p?.provider === 'openai') key = p.apiKey; }
    if (!key) { const d = llm.defaultSecret(); if (d?.provider === 'openai') key = d.apiKey; }
    if (!key) return res.json({ error: 'no-stt' }, 402);
    const audio = Buffer.from(b64, 'base64');
    if (!audio.length) return res.json({ error: 'No audio.' }, 400);
    try {
      const text = await llm.stt({ apiKey: key, model: sttCfg.model, audio, mime: String(req.body?.mime || 'audio/webm') });
      return res.json({ ok: true, text: text.slice(0, 2000) });
    } catch {
      return res.json({ error: 'stt-failed' }, 200); // client shows a friendly retry message
    }
  }));

  // A kid proposes a new project/quest. In 'every' mode it needs a parent's
  // approval before going deep; otherwise it's approved and rolls into a digest.
  app.post('/api/quests', requireParent(async (req, res) => {
    const kidId = req.session.kid_id;
    if (!kidId) return res.json({ error: 'No child selected.' }, 400);
    const kid = store.getKid(kidId);
    const title = String(req.body?.title || '').slice(0, 120).trim();
    if (!title) return res.json({ error: 'What would you like to explore?' }, 400);
    const scan = safety.screen(title);
    const custom = safety.screenCustom(title, kid.blocked_topics);
    if (!scan.safe || !custom.safe) {
      const cat = !scan.safe ? scan.category : custom.category;
      store.addSafetyEvent(kidId, { severity: 'block', category: cat, snippet: title });
      return res.json({ error: safety.safeRedirect(kid.name, safety.gradeBand(kid.grade).band) }, 200);
    }
    const status = kid.gate_mode === 'every' ? 'pending' : 'approved';
    const quest = store.createQuest(kidId, { title, subject: safety.guessSubject(title), status });
    res.json({ ok: true, quest, needsApproval: status === 'pending' });
  }));

  // The kid says something → screened → model → screened → stored. The heart.
  app.post('/api/message', requireParent(async (req, res) => {
    const kidId = req.session.kid_id;
    if (!kidId) return res.json({ error: 'No child selected.' }, 400);
    const kid = store.getKid(kidId);
    const band = safety.gradeBand(kid.grade).band;
    const text = String(req.body?.text || '').slice(0, 2000).trim();
    const questId = req.body?.questId ? Number(req.body.questId) : null;
    if (!text) return res.json({ error: 'Say something to Curio!' }, 400);

    const quest = questId ? store.getQuest(questId) : null;
    // Don't let a pending (unapproved) quest proceed to the model.
    if (quest && quest.status === 'pending') {
      return res.json({
        reply: `I asked your grown-up if we can explore "${quest.title}" together. As soon as they say yes, we'll dive in! Want to try something else while we wait?`,
        gated: true,
      });
    }

    // ---- 1. Screen the child's input (built-in + parent's custom off-limits) ----
    const inScan = safety.screen(text);
    const custom = safety.screenCustom(text, kid.blocked_topics);
    let careNote = '';
    let flaggedIn = false;

    const hardBlocked = (!inScan.safe && HARD_BLOCK.has(inScan.category)) || !custom.safe;
    if (hardBlocked) {
      const cat = !custom.safe ? custom.category : inScan.category;
      store.addSafetyEvent(kidId, { severity: 'block', category: cat, snippet: text });
      store.addMessage(kidId, { quest_id: questId, role: 'kid', content: text, topic: cat, flagged: 1 });
      const reply = safety.safeRedirect(kid.name, band);
      store.addMessage(kidId, { quest_id: questId, role: 'guide', content: reply, topic: 'safety-redirect', flagged: 1 });
      return res.json({ reply, flagged: true, category: cat });
    }
    if (inScan.category) {
      flaggedIn = true;
      careNote = safety.careNote(inScan.category);
      const sev = inScan.category === 'self-harm' ? 'block' : 'warn';
      store.addSafetyEvent(kidId, { severity: sev, category: inScan.category, snippet: text });
    }

    // ---- 2. Provider-side moderation (extra opinion, OpenAI only) ----
    // Prefer the parent's own key (BYO/Pro mode); otherwise use the bundled key.
    const parentSecret = store.getProviderSecret(req.parent.id);
    const secret = parentSecret || llm.defaultSecret();
    // Route to a model by tier: an explicit per-child tier always wins; otherwise
    // "auto" routes bundled traffic by grade (Haiku for K–2) and leaves a BYO
    // parent on the model they chose.
    if (secret) {
      const tier = kid.model_tier || 'auto';
      if (tier !== 'auto') secret.model = llm.modelForTier(secret.provider, tier) || secret.model;
      else if (!parentSecret) secret.model = llm.modelForBand(secret.provider, band) || secret.model;
    }
    if (secret) {
      const mod = await llm.moderate({ provider: secret.provider, apiKey: secret.apiKey, input: text });
      if (mod?.flagged) {
        flaggedIn = true;
        store.addSafetyEvent(kidId, { severity: 'warn', category: `provider:${(mod.categories[0] || 'flagged')}`, snippet: text });
      }
    }

    // Persist the kid's message now (so a provider error doesn't lose it).
    store.addMessage(kidId, { quest_id: questId, role: 'kid', content: text, topic: safety.guessSubject(text), flagged: flaggedIn ? 1 : 0 });

    // Focus-session awareness: how far into today's intentional session are we?
    const focusRow = activeFocusFor(req.session);
    const focus = focusRow ? withElapsed(focusRow) : null;
    if (focusRow) store.bumpFocusExchanges(focusRow.id);
    const windDown = !!(focus && focus.elapsedMinutes >= focus.target_minutes);

    // ---- 3. Generate the guide's reply ----
    let reply;
    try {
      if (!secret) {
        if (!demoMode) {
          return res.json({ error: 'Ask your grown-up to connect a learning account in the parent dashboard first.' }, 402);
        }
        reply = llm.demoReply(kid, text, focus);
      } else {
        const obj = focusRow && focusRow.objective_id ? store.getObjective(focusRow.objective_id) : null;
        const focusForPrompt = focus ? {
          goal: focus.goal,
          targetMinutes: focus.target_minutes,
          elapsedMinutes: focus.elapsedMinutes,
          objectiveTitle: obj?.title || null,
          objectiveSubject: obj?.subject || null,
          objectiveNotes: obj?.notes || null,
          kind: focus.kind || focusRow.kind || 'explore',
          // bump already ran — include the just-counted exchange so BUILD CHECK fires on schedule
          exchanges: (focusRow.exchanges || 0) + 1,
        } : null;
        const system = safety.buildSystemPrompt(kid, { quest, extraNote: careNote, focus: focusForPrompt });
        const history = store.listMessages(kidId, questId, 20)
          .map((m) => ({ role: m.role === 'kid' ? 'user' : 'assistant', content: m.content }));
        // Ensure the just-sent message is the last user turn.
        if (!history.length || history[history.length - 1].content !== text) history.push({ role: 'user', content: text });
        const tightBudget = !!(focusForPrompt && (focusForPrompt.objectiveTitle || focusForPrompt.kind === 'work'));
        reply = await llm.complete({
          ...secret,
          system,
          messages: history,
          maxTokens: band === 'early' ? 250 : (tightBudget ? 350 : 700),
        });
      }
    } catch (err) {
      const msg = err.isProvider
        ? `Curio couldn't reach your grown-up's learning account right now${err.status === 401 ? ' — the connected key may need updating' : ''}. Please try again in a moment.`
        : 'Curio had a little hiccup. Try again in a moment!';
      store.addMessage(kidId, { quest_id: questId, role: 'guide', content: '[delivery error]', topic: 'error', flagged: 0 });
      return res.json({ reply: msg, error: true }, 200);
    }

    // Strip residual markdown before screening/showing (kids see plain text).
    reply = safety.stripMarkdown(reply);

    // ---- 4. Screen the model's output before the child sees it ----
    // screen() returns safe:false ONLY for a severity:'block' category
    // (self-harm, violence-weapons, sexual, substances, hate). Withhold on ANY
    // of them — do NOT re-filter through HARD_BLOCK, which drops 'self-harm'.
    const outScan = safety.screen(reply);
    let flaggedOut = false;
    if (!outScan.safe) {
      store.addSafetyEvent(kidId, { severity: 'block', category: `output:${outScan.category}`, snippet: reply });
      // Self-harm output gets a WARM, resource-bearing redirect (a caring reply
      // that trips the screen must not be swapped for a cold deflection).
      reply = safety.outputRedirect(outScan, kid.name, band);
      flaggedOut = true;
    }

    store.addMessage(kidId, { quest_id: questId, role: 'guide', content: reply, topic: quest ? quest.subject : safety.guessSubject(text), flagged: flaggedOut ? 1 : 0 });
    res.json({
      reply,
      flagged: flaggedIn || flaggedOut,
      category: inScan.category || null,
      windDown,
      focus: focus ? { elapsedMinutes: focus.elapsedMinutes, targetMinutes: focus.target_minutes } : null,
    });
  }));

  // Generate a parent debrief for a child, covering activity since the last one.
  app.post('/api/kids/:id/digest', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    const kid = store.getKid(kidId);
    const since = store.lastDigestTime(kidId);
    const msgs = store.recentMessagesForDigest(kidId, since);

    if (!msgs.length) {
      return res.json({ ok: true, digest: null, message: 'No new activity since the last debrief.' });
    }

    let summary;
    const secret = store.getProviderSecret(req.parent.id) || llm.defaultSecret();
    const transcript = msgs.map((m) => `${m.role === 'kid' ? kid.name : 'Curio'}: ${m.content}`).join('\n').slice(0, 6000);

    if (secret) {
      try {
        const system = `You are writing a brief, warm progress report FOR A PARENT about their child's learning session with an AI tutor named Curio. Be concrete and honest. Cover: (1) what topics/projects ${kid.name} explored, (2) skills or concepts practiced, (3) signs of curiosity or where they lit up, (4) anything a parent should gently follow up on (frustration, sensitive feelings, or off-topic moments). 4–7 sentences. Do not invent anything not in the transcript.`;
        summary = await llm.complete({
          ...secret, system,
          messages: [{ role: 'user', content: `Transcript:\n${transcript}\n\nWrite the parent debrief.` }],
          maxTokens: 500,
        });
      } catch {
        summary = localDigest(kid, msgs);
      }
    } else {
      summary = localDigest(kid, msgs);
    }

    const digest = store.addDigest(kidId, { summary, from_time: since });
    res.json({ ok: true, digest });
  }));
};

// The kid UI only needs a safe subset of the child's profile (not the parent's
// private blocked/priority lists).
function publicKid(kid) {
  return {
    id: kid.id, name: kid.name, grade: kid.grade, interests: kid.interests,
    gate_mode: kid.gate_mode, homeschool: kid.homeschool, session_minutes: kid.session_minutes,
  };
}

// Resolve the active (not-yet-ended) focus session for a server session.
function activeFocusFor(session) {
  if (!session.focus_session_id) return null;
  const f = store.getFocus(session.focus_session_id);
  return f && !f.ended_at_ms ? f : null;
}

// Attach elapsed minutes computed from the wall clock.
function withElapsed(focus) {
  return { ...focus, elapsedMinutes: Math.floor((Date.now() - focus.started_at_ms) / 60000) };
}

// ---- Topic suggestions (for the kid "Suggest a topic" starter) -------------
// Age-banded pools of short, kid-facing project prompts. Kept concrete and
// build-oriented so a pick becomes a real Focus Session goal.
const TOPIC_POOLS = {
  early: [
    'Why is the sky blue?', 'Build a tiny paper boat that floats',
    'How do bees make honey?', 'Draw and name your own animal',
    'Count how many steps across your room', 'Why do we have to sleep?',
    'Make up a silly song about your day', 'What makes a rainbow?',
    'Build the tallest tower you can', 'How do plants drink water?',
    'Invent a secret handshake', 'Why do cats purr?',
  ],
  middle: [
    'Design the rules for your own board game', 'How does a rocket get to space?',
    'Start a tiny lemonade-stand business plan', 'Build a bridge out of paper that holds a book',
    'Why do volcanoes erupt?', 'Write the first page of an adventure story',
    'How do magnets actually work?', 'Invent a gadget that solves a chore you hate',
    'What lived during the dinosaurs?', 'Make a code with symbols only you know',
    'How does money work?', 'Grow a plant from a seed and track it',
  ],
  later: [
    'Prototype an app idea that helps your school', 'How does the internet actually work?',
    'Plan a 2-week passion project you could really build', 'Why do stock prices go up and down?',
    'Design a video game level from scratch', 'How do vaccines train your body?',
    'Start a small business around something you love', 'Explain how AI models learn',
    'Build a simple electric circuit', 'Write and record a short song',
    'How do black holes work?', 'Design a solution to a problem in your town',
  ],
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Return n shuffled ideas: a couple seeded from the child's own interests
// (so it feels personal), the rest from the age-appropriate pool.
function suggestTopics(band, interests, n = 6) {
  const pool = TOPIC_POOLS[band] || TOPIC_POOLS.middle;
  const picks = [];
  const seen = new Set();
  const add = (t) => { const k = t.toLowerCase(); if (t && !seen.has(k)) { seen.add(k); picks.push(t); } };

  const list = String(interests || '')
    .split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const templates = [
    (x) => `Go deep on ${x} — from first principles`,
    (x) => `Build something about ${x}`,
    (x) => `Invent a project around ${x}`,
    (x) => `Why is ${x} the way it is?`,
  ];
  for (const x of shuffle(list).slice(0, 2)) {
    add(templates[Math.floor(Math.random() * templates.length)](x));
  }
  for (const t of shuffle(pool)) { if (picks.length >= n) break; add(t); }
  return shuffle(picks).slice(0, n);
}

// Fallback debrief built from topic tags when no model is available.
function localDigest(kid, msgs) {
  const kidMsgs = msgs.filter((m) => m.role === 'kid');
  const topics = {};
  // Only count non-flagged messages as genuine "areas explored" — flagged
  // items are surfaced separately as safety follow-ups, not interests.
  for (const m of kidMsgs) { if (m.flagged) continue; const t = m.topic || 'General'; topics[t] = (topics[t] || 0) + 1; }
  const top = Object.entries(topics).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const flagged = msgs.filter((m) => m.flagged).length;
  return [
    `${kid.name} exchanged ${kidMsgs.length} message(s) with Curio.`,
    top.length ? `Main areas explored: ${top.slice(0, 4).join(', ')}.` : '',
    flagged ? `⚠️ ${flagged} message(s) were flagged for your review — see the Safety tab.` : 'No safety flags in this period. 🎉',
    'Connect your learning account for a richer, AI-written narrative debrief.',
  ].filter(Boolean).join(' ');
}
