// Parent dashboard logic.
let ME = null, MODELS = null, KIDS = [];

async function boot() {
  try { ME = (await api('/api/me')).parent; } catch { ME = null; }
  if (!ME) { window.location.href = '/'; return; }
  el('whoami').textContent = ME.name ? `Hi, ${ME.name}` : ME.email;
  el('curPlan').textContent = ME.plan;
  try { MODELS = (await api('/api/providers/models')).models; } catch {}
  fillModels();
  await Promise.all([loadKids(), loadPending(), loadProvider(), loadSafety()]);
  refreshStatus();
}

// Refresh the top-of-dashboard status widgets after any relevant change.
function refreshStatus() { renderAiBanner(); renderChecklist(); }

// First-run setup checklist — disappears once real AI is on and a child exists.
async function renderChecklist() {
  const box = el('setupChecklist'); if (!box) return;
  if (localStorage.getItem('curio_setup_done') === '1') { box.innerHTML = ''; return; }
  let me; try { me = await api('/api/me'); } catch { return; }
  const hasAI = me.aiConnected, hasKid = KIDS.length > 0;
  if (hasAI && hasKid) { box.innerHTML = ''; return; } // ready — stop nagging
  const step = (done, label, cta, onclick) => `<div style="display:flex;align-items:center;gap:.6rem;padding:.35rem 0;">
    <span style="font-size:1.2rem;">${done ? '✅' : '⬜'}</span>
    <span style="flex:1;${done ? 'color:var(--ink-soft);text-decoration:line-through;' : 'font-weight:800;'}">${label}</span>
    ${done ? '' : `<button class="btn small" onclick="${onclick}">${cta}</button>`}</div>`;
  box.innerHTML = `<div class="card" style="margin-bottom:1rem;border:2px solid var(--brand);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem;">
      <h3 style="margin:0;">👋 Get set up in 3 steps</h3>
      <button style="background:none;border:0;color:var(--ink-soft);cursor:pointer;font-weight:800;" onclick="dismissChecklist()">Hide</button>
    </div>
    ${step(hasAI, 'Turn on real AI (paste your key + Test connection)', 'Connect', "showPanel('provider')")}
    ${step(hasKid, 'Add a child profile', 'Add child', "showPanel('kids')")}
    ${step(false, 'Start a session and hand them the device', 'Show me', "showPanel('kids')")}
  </div>`;
}
function dismissChecklist() { localStorage.setItem('curio_setup_done', '1'); el('setupChecklist').innerHTML = ''; }

// Top-of-dashboard banner: is real AI on, or are we in demo mode?
async function renderAiBanner() {
  let me; try { me = await api('/api/me'); } catch { return; }
  const b = el('aiBanner'); if (!b) return;
  if (me.aiConnected) {
    const how = me.bundled ? 'server key' : (me.provider ? `${me.provider.provider} · ${me.provider.model}` : 'connected');
    b.innerHTML = `<div class="card" style="background:#eafaf2;border:0;margin-bottom:1rem;">✅ <strong>Real AI is on.</strong> <span class="muted">(${esc(how)})</span></div>`;
  } else {
    b.innerHTML = `<div class="card" style="background:#fff6e9;border:0;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
      <span>⚠️ <strong>Demo mode</strong> — Curio is giving canned replies. Connect your AI account to turn on real tutoring.</span>
      <button class="btn small" onclick="showPanel('provider')">Connect AI →</button></div>`;
  }
}

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.side button').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  el('panel-' + name).classList.add('active');
  if (name === 'approvals') loadPending();
  if (name === 'safety') loadSafety();
  if (name === 'activity') loadActivity();
  if (name === 'plans') loadPlans();
}

async function logout() { await api('/api/logout', { method: 'POST' }); window.location.href = '/'; }

// ---- Children ----
async function loadKids() {
  KIDS = (await api('/api/kids')).kids;
  const list = el('kidsList');
  const sel = el('actKid');
  const psel = el('planKid');
  sel.innerHTML = ''; psel.innerHTML = '';
  if (!KIDS.length) { list.innerHTML = '<p class="empty">No children yet — add one below to get started.</p>'; }
  else {
    list.innerHTML = KIDS.map(k => `
      <div class="card kid-card">
        <div>
          <h3 style="margin:0;">${esc(k.name)} <span class="muted" style="font-weight:700;">· Grade ${esc(k.grade)}</span></h3>
          <p class="muted" style="margin:.2rem 0;">${k.interests ? '❤️ ' + esc(k.interests) : '<em>No interests set</em>'}</p>
          <span class="badge-mode">${gateLabel(k.gate_mode)}</span>
        </div>
        <div class="row">
          <button class="btn mint small" onclick="launchKid(${k.id})">▶ Start session</button>
          <button class="btn ghost small" onclick="editKid(${k.id})">Edit</button>
          <button class="btn danger small" onclick="removeKid(${k.id})">Delete</button>
        </div>
      </div>`).join('');
  }
  KIDS.forEach(k => {
    const o = document.createElement('option'); o.value = k.id; o.textContent = `${k.name} (Grade ${k.grade})`; sel.appendChild(o);
    psel.appendChild(o.cloneNode(true));
  });
}

function gateLabel(m) { return { every: '✅ Approve every topic', daily: '📬 Daily debrief', weekly: '📬 Weekly debrief', off: '👀 Transcripts only' }[m] || m; }

async function saveKid(e) {
  e.preventDefault();
  const msg = el('kidMsg'); msg.className = 'form-msg'; msg.textContent = 'Saving…';
  const id = el('kidId').value;
  const body = {
    name: el('kName').value, grade: el('kGrade').value, interests: el('kInterests').value, gate_mode: el('kGate').value,
    priority_topics: el('kPriority').value, blocked_topics: el('kBlocked').value,
    session_minutes: el('kMinutes').value, homeschool: el('kHome').value === '1',
  };
  try {
    if (id) await api('/api/kids/' + id, { method: 'PUT', body });
    else await api('/api/kids', { method: 'POST', body });
    resetKidForm(); await loadKids(); refreshStatus();
    msg.className = 'form-msg ok'; msg.textContent = 'Saved!';
  } catch (err) { msg.className = 'form-msg error'; msg.textContent = err.message; }
  return false;
}
function editKid(id) {
  const k = KIDS.find(x => x.id === id); if (!k) return;
  el('kidId').value = k.id; el('kName').value = k.name; el('kGrade').value = k.grade;
  el('kInterests').value = k.interests; el('kGate').value = k.gate_mode;
  el('kPriority').value = k.priority_topics || ''; el('kBlocked').value = k.blocked_topics || '';
  el('kMinutes').value = String(k.session_minutes || 30); el('kHome').value = String(k.homeschool || 0);
  el('kidFormTitle').textContent = 'Edit ' + k.name; el('kidCancel').style.display = 'inline-flex';
  el('kName').scrollIntoView({ behavior: 'smooth' });
}
function resetKidForm() {
  el('kidForm').reset(); el('kidId').value = ''; el('kidFormTitle').textContent = 'Add a child';
  el('kidCancel').style.display = 'none'; el('kidMsg').textContent = '';
}
async function removeKid(id) {
  if (!confirm('Delete this child profile and all their history?')) return;
  await api('/api/kids/' + id, { method: 'DELETE' }); await loadKids();
}
async function launchKid(id) {
  await api('/api/select-kid', { method: 'POST', body: { kidId: id } });
  window.location.href = '/kid.html';
}

// ---- Approvals ----
async function loadPending() {
  const { pending } = await api('/api/pending');
  el('pendCount').textContent = pending.length ? `(${pending.length})` : '';
  const list = el('pendingList');
  if (!pending.length) { list.innerHTML = '<p class="empty">Nothing waiting for approval. 🎉</p>'; return; }
  list.innerHTML = pending.map(q => `
    <div class="card kid-card">
      <div><h3 style="margin:0;">${esc(q.title)}</h3><p class="muted" style="margin:.2rem 0;">${esc(q.kid_name)} · ${esc(q.subject)}</p></div>
      <div class="row">
        <button class="btn mint small" onclick="decide(${q.id},'approve')">Approve</button>
        <button class="btn danger small" onclick="decide(${q.id},'decline')">Decline</button>
      </div>
    </div>`).join('');
}
async function decide(id, decision) {
  await api('/api/quests/' + id + '/decision', { method: 'POST', body: { decision } });
  loadPending();
}

// ---- Activity ----
async function loadActivity() {
  const kidId = el('actKid').value;
  const body = el('activityBody');
  if (!kidId) { body.innerHTML = '<p class="empty">Add a child to see activity.</p>'; return; }
  const data = await api('/api/kids/' + kidId + '/activity');
  const digests = data.digests.map(d => `<div class="card" style="margin:.5rem 0;"><p style="margin:0;white-space:pre-wrap;">${esc(d.summary)}</p><p class="muted" style="font-size:.8rem;margin:.4rem 0 0;">${esc(d.created_at)} UTC</p></div>`).join('') || '<p class="muted">No debriefs generated yet.</p>';
  const transcript = data.messages.length
    ? data.messages.map(m => `<div class="bubble ${m.role} ${m.flagged ? 'flag' : ''}"><strong>${m.role === 'kid' ? esc(data.kid.name) : '🦉 Curio'}:</strong> ${esc(m.content)}</div>`).join('')
    : '<p class="empty">No conversation yet.</p>';
  body.innerHTML = `
    <div class="row" style="margin-bottom:1rem;"><button class="btn" onclick="genDigest(${kidId})">📬 Generate debrief now</button></div>
    <h3>Debriefs</h3>${digests}
    <h3 style="margin-top:1.5rem;">Full transcript</h3>
    <div class="card">${transcript}</div>`;
}
async function genDigest(kidId) {
  const btn = event.target; btn.disabled = true; btn.textContent = 'Writing debrief…';
  try {
    const r = await api('/api/kids/' + kidId + '/digest', { method: 'POST' });
    if (!r.digest) alert(r.message || 'No new activity.');
    await loadActivity();
  } catch (e) { alert(e.message); }
  btn.disabled = false; btn.textContent = '📬 Generate debrief now';
}

// ---- Safety ----
async function loadSafety() {
  const { events } = await api('/api/safety');
  const list = el('safetyList');
  if (!events.length) { list.innerHTML = '<p class="empty">No safety events. All clear. 🛡️</p>'; return; }
  list.innerHTML = events.map(e => `
    <div class="ev">
      <span class="dot ${e.severity}"></span>
      <div style="flex:1;">
        <strong>${esc(e.kid_name)}</strong> · ${esc(e.category)}
        <div class="muted" style="font-size:.9rem;">"${esc(e.snippet)}"</div>
      </div>
      <span class="muted" style="font-size:.8rem;">${esc(e.created_at)}</span>
    </div>`).join('');
}

// ---- Learning plans ----
let PRESETS = [];
async function loadPlans() {
  const kidId = el('planKid').value;
  const body = el('plansBody');
  if (!kidId) { body.innerHTML = '<p class="empty">Add a child first.</p>'; return; }
  if (!PRESETS.length) { try { PRESETS = (await api('/api/curriculum-presets')).presets; } catch {} }
  const data = await api('/api/kids/' + kidId + '/objectives');
  const objs = data.objectives;
  const done = objs.filter(o => o.status === 'done').length;
  const list = objs.length ? objs.map(o => `
    <div class="ev">
      <span class="dot ${o.status === 'done' ? 'info' : o.status === 'in_progress' ? 'warn' : ''}"></span>
      <div style="flex:1;">
        <strong>${esc(o.title)}</strong>
        <div class="muted" style="font-size:.85rem;">${esc(o.subject)} · ${o.status === 'done' ? '✅ done' : o.status === 'in_progress' ? '⏳ in progress' : '⬜ to do'}</div>
      </div>
      <div class="row">
        ${o.status !== 'done' ? `<button class="btn mint small" onclick="objStatus(${o.id},'done')">Mark done</button>` : `<button class="btn ghost small" onclick="objStatus(${o.id},'todo')">Reopen</button>`}
        <button class="btn danger small" onclick="objDelete(${o.id})">✕</button>
      </div>
    </div>`).join('') : '<p class="empty">No objectives yet. Import a starter plan or add your own below.</p>';

  body.innerHTML = `
    <div class="card" style="margin-bottom:1rem;">
      <div class="row" style="justify-content:space-between;align-items:center;">
        <h3 style="margin:0;">Progress: ${done}/${objs.length} objectives</h3>
        <a class="btn ghost small" href="/api/kids/${kidId}/record.html" target="_blank">🖨️ Printable record</a>
      </div>
    </div>
    <div class="card">${list}</div>
    <div class="card" style="margin-top:1rem;">
      <h3>Add objectives</h3>
      <label>Quick add one</label>
      <div class="row"><input id="objTitle" placeholder="e.g. Practice multiplication tables 2–5" style="flex:1;" /><button class="btn" onclick="objAdd(${kidId})">Add</button></div>
      <label style="margin-top:1rem;">Import a starter plan</label>
      <div class="row">
        <select id="presetSel" style="flex:1;">${PRESETS.map(p => `<option value="${p.id}">${esc(p.title)} (${p.count})</option>`).join('')}</select>
        <button class="btn ghost" onclick="importPreset(${kidId})">Import preset</button>
      </div>
      <label style="margin-top:1rem;">Or import from your curriculum <span class="muted" style="font-weight:400;">(Time4Learning, IXL, Abeka, a co-op outline, a CSV export…)</span></label>
      <textarea id="importText" rows="5" placeholder="Paste your scope & sequence or skill list. It understands most formats:&#10;Math: Add fractions with like denominators&#10;1. Read chapter 3 and summarize&#10;Science:&#10;   Build a simple circuit"></textarea>
      <div class="row" style="margin-top:.5rem;align-items:center;">
        <label class="btn ghost small" style="margin:0;cursor:pointer;">📄 Upload .txt / .csv<input type="file" accept=".txt,.csv,text/plain,text/csv" hidden onchange="loadImportFile(event)"></label>
        <button class="btn" onclick="previewImport(${kidId})">Preview import →</button>
      </div>
      <div id="importPreview" style="margin-top:.8rem;"></div>
      <p class="muted" style="font-size:.82rem;margin-top:.6rem;">Have a PDF? Open it, select the text, copy, and paste above. Most curricula have no public API, so paste/upload is the universal path — this understands lists, "Subject: item", CSV, and unit headers.</p>
    </div>`;
}
async function objStatus(id, status) { await api('/api/objectives/' + id + '/status', { method: 'POST', body: { status } }); loadPlans(); }
async function objDelete(id) { if (!confirm('Delete this objective?')) return; await api('/api/objectives/' + id, { method: 'DELETE' }); loadPlans(); }
async function objAdd(kidId) {
  const t = el('objTitle').value.trim(); if (!t) return;
  await api('/api/kids/' + kidId + '/objectives', { method: 'POST', body: { title: t } }); loadPlans();
}
async function importPreset(kidId) {
  await api('/api/kids/' + kidId + '/objectives/import', { method: 'POST', body: { preset: el('presetSel').value } }); loadPlans();
}
let PARSED_ROWS = null;
function loadImportFile(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { el('importText').value = r.result; };
  r.readAsText(f);
}
async function previewImport(kidId) {
  const text = el('importText').value.trim();
  if (!text) { alert('Paste or upload your curriculum first.'); return; }
  try {
    const res = await api('/api/kids/' + kidId + '/objectives/parse', { method: 'POST', body: { text } });
    PARSED_ROWS = res.rows;
    renderPreview(kidId, res.rows);
  } catch (e) { alert(e.message); }
}
function renderPreview(kidId, rows) {
  const box = el('importPreview');
  if (!rows.length) { box.innerHTML = '<p class="muted">Couldn\'t find any objectives — check the text and try again.</p>'; return; }
  box.innerHTML = `<div class="card" style="background:var(--brand-soft);border:0;">
    <strong>Found ${rows.length} objective${rows.length > 1 ? 's' : ''}</strong> — review, then import:
    <div style="max-height:220px;overflow:auto;margin:.5rem 0;">
      ${rows.map(r => `<div style="padding:.25rem 0;font-size:.9rem;"><span class="badge-mode">${esc(r.subject)}</span> ${esc(r.title)}</div>`).join('')}
    </div>
    <div class="row"><button class="btn mint" onclick="confirmImport(${kidId})">✓ Import these ${rows.length}</button>
    <button class="btn ghost" onclick="PARSED_ROWS=null;el('importPreview').innerHTML='';">Cancel</button></div>
  </div>`;
}
async function confirmImport(kidId) {
  if (!PARSED_ROWS || !PARSED_ROWS.length) return;
  try {
    await api('/api/kids/' + kidId + '/objectives/import', { method: 'POST', body: { rows: PARSED_ROWS } });
    PARSED_ROWS = null; el('importText').value = ''; loadPlans();
  } catch (e) { alert(e.message); }
}

// ---- Provider ----
function fillModels() {
  if (!MODELS) return;
  const prov = el('pProvider').value;
  el('pModel').innerHTML = (MODELS[prov] || []).map(m => `<option value="${m.id}">${esc(m.label)}</option>`).join('');
}
async function loadProvider() {
  const me = await api('/api/me');
  const s = el('providerStatus');
  if (me.provider) {
    s.innerHTML = `<div class="card" style="background:var(--brand-soft);border:0;margin-bottom:1rem;">✅ Connected: <strong>${esc(me.provider.provider)}</strong> · ${esc(me.provider.model)}</div>`;
    el('pProvider').value = me.provider.provider; fillModels(); el('pModel').value = me.provider.model;
  } else {
    s.innerHTML = `<div class="card" style="background:#fff6e9;border:0;margin-bottom:1rem;">⚠️ No account connected — running in demo mode.</div>`;
  }
}
async function saveProvider(e) {
  e.preventDefault();
  const msg = el('provMsg'); msg.className = 'form-msg'; msg.textContent = 'Saving…';
  try {
    await api('/api/provider', { method: 'POST', body: { provider: el('pProvider').value, model: el('pModel').value, apiKey: el('pKey').value } });
    el('pKey').value = ''; msg.className = 'form-msg ok'; msg.textContent = 'Saved! Tap "Test connection" to confirm it works.';
    loadProvider(); refreshStatus();
  } catch (err) { msg.className = 'form-msg error'; msg.textContent = err.message; }
  return false;
}
// Make a real call to confirm the key works. If a key is typed but not yet
// saved, save it first so one tap does the whole thing.
async function testProvider() {
  const msg = el('provMsg'); msg.className = 'form-msg'; msg.textContent = 'Testing…';
  if (el('pKey').value.trim()) {
    try {
      await api('/api/provider', { method: 'POST', body: { provider: el('pProvider').value, model: el('pModel').value, apiKey: el('pKey').value } });
      el('pKey').value = '';
    } catch (err) { msg.className = 'form-msg error'; msg.textContent = err.message; return; }
  }
  try {
    const r = await api('/api/provider/test', { method: 'POST' });
    if (r.ok) { msg.className = 'form-msg ok'; msg.textContent = `✅ Working! ${r.provider} / ${r.model} responded.`; }
    else { msg.className = 'form-msg error'; msg.textContent = '⚠️ ' + r.error; }
  } catch (err) { msg.className = 'form-msg error'; msg.textContent = err.message; }
  loadProvider(); refreshStatus();
}
async function disconnectProvider() {
  if (!confirm('Disconnect your AI account? Curio will fall back to demo mode.')) return;
  await api('/api/provider', { method: 'DELETE' }); loadProvider(); refreshStatus();
}

// ---- Plan ----
async function choosePlan(plan) {
  await api('/api/plan', { method: 'POST', body: { plan } });
  ME.plan = plan; el('curPlan').textContent = plan;
  alert('Plan set to ' + plan + '. (Payment processor not wired in this demo.)');
}

boot();
