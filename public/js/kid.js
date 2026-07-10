// Kid experience — built around intentional, time-boxed Focus Sessions.
// The goal is thoughtful engagement and finishing, then going offline — NOT
// maximizing screen time. So chatting happens *inside* a focus session.
let KID = null, QUESTS = [], OBJECTIVES = [], NEXT_OBJ = null;
let FOCUS = null, chosenMinutes = 30, timer = null, windDownShown = false;

async function boot() {
  let ctx;
  try { ctx = await api('/api/kid-context'); }
  catch (e) {
    if (e.status === 401) { window.location.href = '/'; return; }
    el('chat').innerHTML = '<div class="start"><div style="font-size:3rem">🦉</div><p>Ask your grown-up to start a session for you from the parent dashboard.</p><a class="btn" href="/parent.html">Go to parent area</a></div>';
    el('composer').style.display = 'none';
    return;
  }
  KID = ctx.kid; QUESTS = ctx.quests || []; OBJECTIVES = ctx.objectives || []; NEXT_OBJ = ctx.nextObjective;
  chosenMinutes = KID.session_minutes || 30;
  el('hello').textContent = `Hi ${KID.name}!`;
  if (ctx.activeFocus) { FOCUS = ctx.activeFocus; enterSession(ctx.messages || []); }
  else renderStart();
}

// ---- Start screen: choose today's focus, intentionally ----
function renderStart() {
  el('composer').style.display = 'none';
  el('focus').classList.remove('on');
  el('quests').style.display = 'none';
  const mins = [15, 20, 30, 45].map(m => `<button class="${m === chosenMinutes ? 'sel' : ''}" onclick="pickMinutes(${m},this)">${m} min</button>`).join('');
  const objCard = NEXT_OBJ
    ? `<div class="obj">🎯 Today's focus: ${esc(NEXT_OBJ.title)}<div class="muted" style="font-weight:700;font-size:.85rem;margin-top:.2rem;">${esc(NEXT_OBJ.subject)}</div></div>`
    : `<div class="obj">✨ Pick something you're curious about and let's go deep on it.</div>`;
  el('chat').innerHTML = `
    <div class="start">
      <div style="font-size:3rem">🦉</div>
      <h2>Ready to learn, ${esc(KID.name)}?</h2>
      <p class="muted">Let's do one focused thing today — then go make it real.</p>
      <div class="card">
        ${objCard}
        <label style="font-weight:800;">How long today?</label>
        <div class="mins">${mins}</div>
        ${NEXT_OBJ ? `<button class="btn mint" style="width:100%;margin-top:.5rem;" onclick="start(${NEXT_OBJ.id})">Start today's focus →</button>` : ''}
        <button class="btn ${NEXT_OBJ ? 'ghost' : ''}" style="width:100%;margin-top:.5rem;" onclick="startFree()">${NEXT_OBJ ? 'Explore something else' : 'Start exploring →'}</button>
      </div>
      <p class="muted" style="font-size:.85rem;">🌿 We'll find a good stopping point together when time's up.</p>
    </div>`;
}
function pickMinutes(m, btn) { chosenMinutes = m; document.querySelectorAll('.mins button').forEach(b => b.classList.remove('sel')); btn.classList.add('sel'); }
async function startFree() {
  const goal = prompt("What do you want to learn or build today?");
  if (!goal || !goal.trim()) return;
  await start(null, goal.trim());
}
async function start(objectiveId, goal) {
  try {
    const r = await api('/api/focus/start', { method: 'POST', body: { objectiveId, goal, targetMinutes: chosenMinutes } });
    FOCUS = r.focus; windDownShown = false;
    enterSession([]);
    addBubble('guide', firstPrompt(), false);
  } catch (e) { alert(e.message); }
}
function firstPrompt() {
  const g = FOCUS.goal;
  return `Awesome, ${KID.name}! Today we're focusing on "${g}" for about ${FOCUS.target_minutes} minutes. 🌱 Let's start from the very beginning — what do you already know about it?`;
}

// ---- In-session ----
function enterSession(messages) {
  el('composer').style.display = 'flex';
  el('quests').style.display = 'flex';
  el('focus').classList.add('on');
  renderQuests();
  el('chat').innerHTML = '';
  if (messages.length) messages.forEach(m => addBubble(m.role, m.content, m.flagged));
  updateFocusHeader();
  if (timer) clearInterval(timer);
  timer = setInterval(updateFocusHeader, 20000);
  scrollDown();
}
function elapsedMin() { return FOCUS ? Math.floor((Date.now() - FOCUS.started_at_ms) / 60000) : 0; }
function updateFocusHeader() {
  if (!FOCUS) return;
  const used = elapsedMin(), target = FOCUS.target_minutes;
  el('focusGoal').textContent = '🎯 ' + FOCUS.goal;
  el('focusTime').textContent = used >= target ? 'great stopping point 🌿' : `~${used} / ${target} min`;
  el('focusFill').style.width = Math.min(100, (used / target) * 100) + '%';
  if (used >= target && !windDownShown) showWindDown();
}

// ---- Quests (projects within a session) ----
function renderQuests() {
  const q = el('quests');
  q.innerHTML = QUESTS.map(x => `<button class="qchip ${x.status === 'pending' ? 'pending' : ''}" onclick="pickQuest(${x.id})">${x.status === 'pending' ? '⏳ ' : ''}${esc(x.title)}</button>`).join('')
    + `<button class="qchip add" onclick="newQuest()">＋ New idea</button>`;
}
let activeQuest = null;
function pickQuest(id) {
  activeQuest = activeQuest === id ? null : id;
  document.querySelectorAll('.qchip').forEach(c => c.classList.remove('active'));
  event.target.classList.toggle('active', activeQuest === id);
}
async function newQuest() {
  const title = prompt('What do you want to explore or build?');
  if (!title || !title.trim()) return;
  try {
    const r = await api('/api/quests', { method: 'POST', body: { title: title.trim() } });
    if (r.error) { addBubble('guide', r.error, true); return; }
    QUESTS.unshift(r.quest); activeQuest = r.quest.id; renderQuests();
    if (r.needsApproval) addBubble('guide', `Great idea! I asked your grown-up if we can explore "${r.quest.title}". As soon as they say yes, we'll start! 🌟`, false);
    else addBubble('guide', `Yes! Let's explore "${r.quest.title}"! What do you already know about it? 🚀`, false);
  } catch (e) { alert(e.message); }
}

// ---- Messaging ----
function addBubble(role, text, flagged) {
  const div = document.createElement('div');
  div.className = `msg ${role === 'kid' ? 'kid' : 'guide'}${flagged ? ' flag' : ''}`;
  div.textContent = text;
  el('chat').appendChild(div);
  scrollDown();
}
function scrollDown() { const c = el('chat'); c.scrollTop = c.scrollHeight; }

async function send(e) {
  if (e && e.preventDefault) e.preventDefault();
  const input = el('input');
  const text = input.value.trim();
  if (!text) return false;
  input.value = '';
  addBubble('kid', text, false);
  const typing = document.createElement('div');
  typing.className = 'typing'; typing.textContent = '🦉 Curio is thinking…';
  el('chat').appendChild(typing); scrollDown();
  el('sendBtn').disabled = true;
  try {
    const r = await api('/api/message', { method: 'POST', body: { text, questId: activeQuest } });
    typing.remove();
    addBubble('guide', r.reply, r.flagged);
    updateFocusHeader();
    if (r.windDown && !windDownShown) showWindDown();
  } catch (err) {
    typing.remove();
    addBubble('guide', 'Oops, something hiccuped. Try again! 🌱', false);
  }
  el('sendBtn').disabled = false; input.focus();
  return false;
}

// ---- Wind-down (the anti-dopamine finish) ----
function showWindDown() {
  windDownShown = true;
  const card = document.createElement('div');
  card.className = 'winddown';
  card.innerHTML = `<h3>🌿 Great stopping point!</h3>
    <p>You did real thinking today, ${esc(KID.name)}. The best next step is <strong>off the screen</strong> — go build, draw, or try a piece of "${esc(FOCUS.goal)}" in the real world.</p>
    <div class="row" style="margin-top:.5rem;">
      <button class="btn mint" onclick="finishSession()">I'm all done! 🎉</button>
      <button class="btn ghost small" onclick="this.closest('.winddown').remove()">A couple more minutes</button>
    </div>`;
  el('chat').appendChild(card);
  scrollDown();
}
async function finishSession() {
  if (timer) clearInterval(timer);
  if (FOCUS && NEXT_OBJ && FOCUS.objective_id === NEXT_OBJ.id) {
    if (confirm('Did you finish today\'s focus: "' + FOCUS.goal + '"?')) {
      await api('/api/objectives/' + FOCUS.objective_id + '/status', { method: 'POST', body: { status: 'done' } }).catch(() => {});
    }
  }
  await api('/api/focus/end', { method: 'POST', body: { reason: 'kid-done' } }).catch(() => {});
  el('focus').classList.remove('on'); el('composer').style.display = 'none'; el('quests').style.display = 'none';
  el('chat').innerHTML = `<div class="start"><div style="font-size:3rem">🎉</div><h2>See you next time, ${esc(KID.name)}!</h2>
    <p class="muted">Go make something awesome. 🌳</p>
    <button class="btn" onclick="location.reload()">Start another focus</button></div>`;
  FOCUS = null;
}

async function exitKid() {
  if (FOCUS) await api('/api/focus/end', { method: 'POST', body: { reason: 'exit' } }).catch(() => {});
  await api('/api/select-kid', { method: 'POST', body: { kidId: null } }).catch(() => {});
  window.location.href = '/parent.html';
}

boot();
