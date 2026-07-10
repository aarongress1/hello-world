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
}

function showPanel(name) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.side button').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  el('panel-' + name).classList.add('active');
  if (name === 'approvals') loadPending();
  if (name === 'safety') loadSafety();
  if (name === 'activity') loadActivity();
}

async function logout() { await api('/api/logout', { method: 'POST' }); window.location.href = '/'; }

// ---- Children ----
async function loadKids() {
  KIDS = (await api('/api/kids')).kids;
  const list = el('kidsList');
  const sel = el('actKid');
  sel.innerHTML = '';
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
  KIDS.forEach(k => { const o = document.createElement('option'); o.value = k.id; o.textContent = `${k.name} (Grade ${k.grade})`; sel.appendChild(o); });
}

function gateLabel(m) { return { every: '✅ Approve every topic', daily: '📬 Daily debrief', weekly: '📬 Weekly debrief', off: '👀 Transcripts only' }[m] || m; }

async function saveKid(e) {
  e.preventDefault();
  const msg = el('kidMsg'); msg.className = 'form-msg'; msg.textContent = 'Saving…';
  const id = el('kidId').value;
  const body = { name: el('kName').value, grade: el('kGrade').value, interests: el('kInterests').value, gate_mode: el('kGate').value };
  try {
    if (id) await api('/api/kids/' + id, { method: 'PUT', body });
    else await api('/api/kids', { method: 'POST', body });
    resetKidForm(); await loadKids();
    msg.className = 'form-msg ok'; msg.textContent = 'Saved!';
  } catch (err) { msg.className = 'form-msg error'; msg.textContent = err.message; }
  return false;
}
function editKid(id) {
  const k = KIDS.find(x => x.id === id); if (!k) return;
  el('kidId').value = k.id; el('kName').value = k.name; el('kGrade').value = k.grade;
  el('kInterests').value = k.interests; el('kGate').value = k.gate_mode;
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
    el('pKey').value = ''; msg.className = 'form-msg ok'; msg.textContent = 'Connected!'; loadProvider();
  } catch (err) { msg.className = 'form-msg error'; msg.textContent = err.message; }
  return false;
}
async function disconnectProvider() {
  if (!confirm('Disconnect your AI account? Curio will fall back to demo mode.')) return;
  await api('/api/provider', { method: 'DELETE' }); loadProvider();
}

// ---- Plan ----
async function choosePlan(plan) {
  await api('/api/plan', { method: 'POST', body: { plan } });
  ME.plan = plan; el('curPlan').textContent = plan;
  alert('Plan set to ' + plan + '. (Payment processor not wired in this demo.)');
}

boot();
