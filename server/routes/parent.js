'use strict';

const store = require('../store');
const { requireParent } = require('../session');
const { KNOWN_MODELS } = require('../llm');

const PLAN_KID_LIMIT = { explorer: 1, plus: 3, max: 6 };
const GATE_MODES = ['every', 'daily', 'weekly', 'off'];

module.exports = function registerParent(app) {
  // ---- Provider connection ----
  app.get('/api/providers/models', requireParent(async (req, res) => {
    res.json({ models: KNOWN_MODELS });
  }));

  app.post('/api/provider', requireParent(async (req, res) => {
    const { provider, apiKey, model } = req.body || {};
    if (!['anthropic', 'openai'].includes(provider)) return res.json({ error: 'Choose Claude (Anthropic) or OpenAI.' }, 400);
    if (!apiKey || String(apiKey).length < 12) return res.json({ error: 'That API key looks too short.' }, 400);
    const allowed = KNOWN_MODELS[provider].map((m) => m.id);
    const chosen = allowed.includes(model) ? model : allowed[0];
    store.setProvider(req.parent.id, { provider, apiKey, model: chosen });
    res.json({ ok: true, provider: store.getProviderMeta(req.parent.id) });
  }));

  app.del('/api/provider', requireParent(async (req, res) => {
    store.clearProvider(req.parent.id);
    res.json({ ok: true });
  }));

  // ---- Kids ----
  app.get('/api/kids', requireParent(async (req, res) => {
    res.json({ kids: store.listKids(req.parent.id) });
  }));

  app.post('/api/kids', requireParent(async (req, res) => {
    const kids = store.listKids(req.parent.id);
    const limit = PLAN_KID_LIMIT[req.parent.plan] || 1;
    if (kids.length >= limit) {
      return res.json({ error: `Your ${req.parent.plan} plan allows ${limit} child profile(s). Upgrade to add more.` }, 402);
    }
    const { name, grade, interests, gate_mode } = req.body || {};
    if (!name || !grade) return res.json({ error: 'A name and grade are required.' }, 400);
    const mode = GATE_MODES.includes(gate_mode) ? gate_mode : 'every';
    const kid = store.createKid(req.parent.id, { name: String(name).slice(0, 40), grade, interests, gate_mode: mode });
    res.json({ ok: true, kid });
  }));

  app.put('/api/kids/:id', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    const { name, grade, interests, gate_mode } = req.body || {};
    const mode = GATE_MODES.includes(gate_mode) ? gate_mode : 'every';
    res.json({ ok: true, kid: store.updateKid(kidId, { name, grade, interests: interests || '', gate_mode: mode }) });
  }));

  app.del('/api/kids/:id', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    store.deleteKid(kidId);
    res.json({ ok: true });
  }));

  // ---- Parent oversight dashboard ----
  app.get('/api/kids/:id/activity', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    res.json({
      kid: store.getKid(kidId),
      quests: store.listQuests(kidId),
      messages: store.listMessages(kidId, null, 200),
      digests: store.listDigests(kidId),
    });
  }));

  app.get('/api/pending', requireParent(async (req, res) => {
    res.json({ pending: store.listPendingQuestsForParent(req.parent.id) });
  }));

  app.get('/api/safety', requireParent(async (req, res) => {
    res.json({ events: store.listSafetyEvents(req.parent.id) });
  }));

  // Approve / decline a proposed quest (topic gate).
  app.post('/api/quests/:id/decision', requireParent(async (req, res) => {
    const questId = Number(req.params.id);
    const quest = store.getQuest(questId);
    if (!quest || !store.kidBelongsToParent(quest.kid_id, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    const decision = req.body?.decision === 'approve' ? 'approved' : 'declined';
    res.json({ ok: true, quest: store.setQuestStatus(questId, decision) });
  }));
};
