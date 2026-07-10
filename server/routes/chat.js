'use strict';

const store = require('../store');
const { requireParent } = require('../session');
const safety = require('../safety');
const llm = require('../llm');
const { demoMode } = require('../config');

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
      activeFocus: activeFocusFor(req.session),
      messages: store.listMessages(kidId, null, 60),
      providerConnected: !!store.getProviderMeta(req.parent.id) || demoMode,
    });
  }));

  // ---- Focus sessions: intentional, time-boxed learning ----
  app.post('/api/focus/start', requireParent(async (req, res) => {
    const kidId = req.session.kid_id;
    if (!kidId) return res.json({ error: 'No child selected.' }, 400);
    const kid = store.getKid(kidId);
    let objectiveId = req.body?.objectiveId ? Number(req.body.objectiveId) : null;
    let goal = String(req.body?.goal || '').slice(0, 200).trim();
    if (objectiveId) {
      const obj = store.getObjective(objectiveId);
      if (!obj || obj.kid_id !== kidId) objectiveId = null;
      else if (!goal) goal = obj.title;
    }
    if (!goal) goal = 'Explore and learn something new';
    const target = Math.min(90, Math.max(5, Number(req.body?.targetMinutes) || kid.session_minutes || 30));
    const focus = store.startFocus(kidId, { objective_id: objectiveId, goal, target_minutes: target });
    store.setSessionFocus(req.sid, focus.id);
    res.json({ ok: true, focus: withElapsed(focus) });
  }));

  app.post('/api/focus/end', requireParent(async (req, res) => {
    const focus = activeFocusFor(req.session);
    if (focus) {
      store.endFocus(focus.id, String(req.body?.reason || 'done').slice(0, 40));
      store.setSessionFocus(req.sid, null);
    }
    res.json({ ok: true });
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
    const secret = store.getProviderSecret(req.parent.id);
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
        const objTitle = focusRow && focusRow.objective_id ? (store.getObjective(focusRow.objective_id)?.title) : null;
        const focusForPrompt = focus ? { goal: focus.goal, targetMinutes: focus.target_minutes, elapsedMinutes: focus.elapsedMinutes, objectiveTitle: objTitle } : null;
        const system = safety.buildSystemPrompt(kid, { quest, extraNote: careNote, focus: focusForPrompt });
        const history = store.listMessages(kidId, questId, 20)
          .map((m) => ({ role: m.role === 'kid' ? 'user' : 'assistant', content: m.content }));
        // Ensure the just-sent message is the last user turn.
        if (!history.length || history[history.length - 1].content !== text) history.push({ role: 'user', content: text });
        reply = await llm.complete({ ...secret, system, messages: history, maxTokens: band === 'early' ? 300 : 700 });
      }
    } catch (err) {
      const msg = err.isProvider
        ? `Curio couldn't reach your grown-up's learning account right now${err.status === 401 ? ' — the connected key may need updating' : ''}. Please try again in a moment.`
        : 'Curio had a little hiccup. Try again in a moment!';
      store.addMessage(kidId, { quest_id: questId, role: 'guide', content: '[delivery error]', topic: 'error', flagged: 0 });
      return res.json({ reply: msg, error: true }, 200);
    }

    // ---- 4. Screen the model's output before the child sees it ----
    const outScan = safety.screen(reply);
    let flaggedOut = false;
    if (!outScan.safe && HARD_BLOCK.has(outScan.category)) {
      store.addSafetyEvent(kidId, { severity: 'block', category: `output:${outScan.category}`, snippet: reply });
      reply = safety.safeRedirect(kid.name, band);
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
    const secret = store.getProviderSecret(req.parent.id);
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
