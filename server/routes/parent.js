'use strict';

const store = require('../store');
const { requireParent } = require('../session');
const llm = require('../llm');
const { KNOWN_MODELS, CURRICULUM_PRESETS } = llm;
const safety = require('../safety');
const { parseCurriculum } = require('../importer');

const PLAN_KID_LIMIT = { explorer: 1, plus: 3, max: 6 };
const GATE_MODES = ['every', 'daily', 'weekly', 'off'];

function kidFields(body) {
  return {
    name: body.name,
    grade: body.grade,
    interests: body.interests || '',
    gate_mode: GATE_MODES.includes(body.gate_mode) ? body.gate_mode : 'every',
    blocked_topics: String(body.blocked_topics || '').slice(0, 1000),
    priority_topics: String(body.priority_topics || '').slice(0, 1000),
    homeschool: body.homeschool ? 1 : 0,
    session_minutes: Math.min(90, Math.max(5, Number(body.session_minutes) || 30)),
    model_tier: ['auto', 'fast', 'balanced', 'capable'].includes(body.model_tier) ? body.model_tier : 'auto',
  };
}

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

  // Make a tiny real call to confirm the connected AI account actually works —
  // so a parent gets instant "it's live" feedback instead of guessing.
  app.post('/api/provider/test', requireParent(async (req, res) => {
    const secret = store.getProviderSecret(req.parent.id) || llm.defaultSecret();
    if (!secret) return res.json({ ok: false, error: 'No AI account connected yet — add your key above and save.' });
    try {
      const reply = await llm.complete({
        ...secret,
        system: 'You are a connection test. Reply with exactly the two letters: OK',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
      });
      res.json({ ok: true, provider: secret.provider, model: secret.model, sample: String(reply).slice(0, 40) });
    } catch (err) {
      const msg = err.status === 401
        ? 'The key was rejected (401). Double-check you pasted the full key with no spaces.'
        : err.status === 429
          ? 'The provider is rate-limited or out of credit (429). Add credit in your provider console.'
          : err.isProvider
            ? `Provider error ${err.status || ''}. Check the key and model.`
            : 'Could not reach the provider. Check your internet connection.';
      res.json({ ok: false, error: msg });
    }
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
    const body = req.body || {};
    if (!body.name || !body.grade) return res.json({ error: 'A name and grade are required.' }, 400);
    const fields = kidFields(body);
    fields.name = String(fields.name).slice(0, 40);
    const kid = store.createKid(req.parent.id, fields);
    res.json({ ok: true, kid });
  }));

  app.put('/api/kids/:id', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    res.json({ ok: true, kid: store.updateKid(kidId, kidFields(req.body || {})) });
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
      objectives: store.listObjectives(kidId),
      focusSessions: store.recentFocusSessions(kidId),
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

  // ---- Learning plans & objectives (homeschool / self-guided tutor) ----
  app.get('/api/curriculum-presets', requireParent(async (req, res) => {
    res.json({
      presets: Object.entries(CURRICULUM_PRESETS).map(([id, p]) => ({ id, title: p.title, count: p.objectives.length })),
    });
  }));

  app.get('/api/kids/:id/objectives', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    res.json({ objectives: store.listObjectives(kidId), plans: store.listPlans(kidId) });
  }));

  // Preview parse: turn pasted/uploaded curriculum text into objectives WITHOUT
  // saving, so the parent can review before importing.
  app.post('/api/kids/:id/objectives/parse', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    const rows = parseCurriculum(String(req.body?.text || ''));
    res.json({ ok: true, rows, count: rows.length });
  }));

  // Import objectives from: a preset, already-parsed rows (from the preview),
  // or raw pasted text (parsed with the generalized importer).
  app.post('/api/kids/:id/objectives/import', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    const presetId = req.body?.preset;
    const providedRows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    const text = String(req.body?.text || '');
    let rows = [];
    let source = 'custom';
    let planTitle = req.body?.title || 'Learning plan';

    if (presetId && CURRICULUM_PRESETS[presetId]) {
      const p = CURRICULUM_PRESETS[presetId];
      rows = p.objectives.map(([subject, title]) => ({ subject, title }));
      source = `preset:${presetId}`;
      planTitle = p.title;
    } else if (providedRows) {
      rows = providedRows
        .filter((r) => r && r.title)
        .map((r) => ({ subject: String(r.subject || safety.guessSubject(r.title)).slice(0, 40), title: String(r.title).slice(0, 200) }));
      source = 'import';
    } else if (text.trim()) {
      rows = parseCurriculum(text);
      source = 'import';
    }
    if (!rows.length) return res.json({ error: 'Nothing to import — paste some objectives or choose a preset.' }, 400);

    const plan = store.createPlan(kidId, { title: String(planTitle).slice(0, 120), source });
    rows.forEach((r, i) => store.addObjective(kidId, { plan_id: plan.id, subject: r.subject, title: r.title, sort: i }));
    res.json({ ok: true, plan, objectives: store.listObjectives(kidId), imported: rows.length });
  }));

  app.post('/api/kids/:id/objectives', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    const title = String(req.body?.title || '').slice(0, 200).trim();
    if (!title) return res.json({ error: 'Objective needs a title.' }, 400);
    const obj = store.addObjective(kidId, { subject: req.body?.subject || safety.guessSubject(title), title });
    res.json({ ok: true, objective: obj });
  }));

  app.post('/api/objectives/:id/status', requireParent(async (req, res) => {
    const obj = store.getObjective(Number(req.params.id));
    if (!obj || !store.kidBelongsToParent(obj.kid_id, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    const status = ['todo', 'in_progress', 'done'].includes(req.body?.status) ? req.body.status : 'done';
    res.json({ ok: true, objective: store.setObjectiveStatus(obj.id, status) });
  }));

  app.del('/api/objectives/:id', requireParent(async (req, res) => {
    const obj = store.getObjective(Number(req.params.id));
    if (!obj || !store.kidBelongsToParent(obj.kid_id, req.parent.id)) return res.json({ error: 'Not found.' }, 404);
    store.deleteObjective(obj.id);
    res.json({ ok: true });
  }));

  // A printable homeschool record — objectives completed, focus sessions,
  // and debriefs. Useful for portfolios / state record-keeping.
  app.get('/api/kids/:id/record.html', requireParent(async (req, res) => {
    const kidId = Number(req.params.id);
    if (!store.kidBelongsToParent(kidId, req.parent.id)) {
      res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found');
    }
    const kid = store.getKid(kidId);
    const objectives = store.listObjectives(kidId);
    const focus = store.recentFocusSessions(kidId, 100);
    const digests = store.listDigests(kidId, 100);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(renderRecord(kid, objectives, focus, digests));
  }));
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderRecord(kid, objectives, focus, digests) {
  const done = objectives.filter((o) => o.status === 'done');
  const totalMin = focus.reduce((s, f) => s + (f.ended_at_ms && f.started_at_ms ? Math.round((f.ended_at_ms - f.started_at_ms) / 60000) : 0), 0);
  const objRows = objectives.map((o) => `<tr><td>${esc(o.subject)}</td><td>${esc(o.title)}</td><td>${o.status === 'done' ? '✅ Done' : o.status === 'in_progress' ? '⏳ In progress' : '⬜ To do'}</td><td>${o.done_at ? esc(o.done_at) : ''}</td></tr>`).join('');
  const focusRows = focus.map((f) => `<tr><td>${esc(f.created_at)}</td><td>${esc(f.goal)}</td><td>${f.ended_at_ms ? Math.round((f.ended_at_ms - f.started_at_ms) / 60000) : '—'} min</td><td>${f.exchanges}</td></tr>`).join('');
  const digestRows = digests.map((d) => `<div class="d"><div class="dt">${esc(d.created_at)} UTC</div><p>${esc(d.summary)}</p></div>`).join('') || '<p>No debriefs recorded.</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Learning Record — ${esc(kid.name)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#1f2330;line-height:1.5}
h1{margin-bottom:0}.sub{color:#55607a}table{width:100%;border-collapse:collapse;margin:1rem 0}
th,td{text-align:left;padding:.5rem;border-bottom:1px solid #e9e6f5;font-size:.95rem}th{color:#4f2fd6}
.cards{display:flex;gap:1rem;margin:1rem 0}.c{flex:1;background:#efeaff;border-radius:12px;padding:1rem;text-align:center}
.c b{font-size:1.8rem;display:block;color:#4f2fd6}.d{border-left:3px solid #6d4bff;padding:.3rem 0 .3rem 1rem;margin:.6rem 0}
.dt{font-size:.8rem;color:#55607a}@media print{.noprint{display:none}}</style></head><body>
<button class="noprint" onclick="window.print()" style="float:right;padding:.5rem 1rem;border-radius:8px;border:0;background:#6d4bff;color:#fff;font-weight:700;cursor:pointer">🖨️ Print / Save PDF</button>
<h1>🦉 Learning Record</h1>
<p class="sub"><strong>${esc(kid.name)}</strong> · Grade ${esc(kid.grade)} · Generated ${esc(new Date().toISOString().slice(0, 10))}</p>
<div class="cards"><div class="c"><b>${done.length}/${objectives.length}</b>objectives completed</div><div class="c"><b>${focus.length}</b>focus sessions</div><div class="c"><b>${totalMin}</b>minutes of focused learning</div></div>
<h2>Learning objectives</h2>
${objectives.length ? `<table><tr><th>Subject</th><th>Objective</th><th>Status</th><th>Completed</th></tr>${objRows}</table>` : '<p>No objectives added yet.</p>'}
<h2>Focus sessions</h2>
${focus.length ? `<table><tr><th>Date</th><th>Goal</th><th>Length</th><th>Exchanges</th></tr>${focusRows}</table>` : '<p>No focus sessions recorded.</p>'}
<h2>Debriefs</h2>${digestRows}
<p class="sub" style="margin-top:2rem;font-size:.85rem">Generated by CurioKids. Parent-supervised learning; not an accredited transcript.</p>
</body></html>`;
}
