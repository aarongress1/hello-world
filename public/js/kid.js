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
  initVoice();
  if (ctx.activeFocus) { FOCUS = ctx.activeFocus; enterSession(ctx.messages || []); }
  else renderStart();
}

// ---- Voice: Curio speaks its replies, and the kid can talk instead of type.
// Uses the browser's built-in speech (free, no API cost). Works in Chrome/Edge;
// speaking works nearly everywhere, listening needs a supporting browser.
let voiceOn = localStorage.getItem('curio_voice') !== 'off';
let recog = null, listening = false;
let serverTTS = true, curAudio = null; // serverTTS: use natural OpenAI voice until we learn it's unavailable

function initVoice() {
  updateVoiceBtn();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    recog = new SR();
    recog.lang = 'en-US'; recog.interimResults = true; recog.continuous = false;
    recog.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      el('input').value = t;
      if (e.results[e.results.length - 1].isFinal) { stopMic(); if (t.trim()) send(); }
    };
    recog.onend = stopMic;
    recog.onerror = (e) => { stopMic(); micError(e && e.error); };
  } else {
    const m = el('micBtn'); if (m) m.style.display = 'none'; // no speech input support
  }
}
function toggleVoice() {
  voiceOn = !voiceOn;
  localStorage.setItem('curio_voice', voiceOn ? 'on' : 'off');
  if (!voiceOn) stopAudio();
  updateVoiceBtn();
}
function updateVoiceBtn() {
  const b = el('voiceToggle'); if (b) b.textContent = voiceOn ? '🔊 Voice on' : '🔇 Voice off';
}
function pickVoice() {
  const vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  return vs.find(v => /en[-_]?US/i.test(v.lang) && /female|Samantha|Google US English|Zira|Jenny|Aria/i.test(v.name))
    || vs.find(v => /^en/i.test(v.lang)) || vs[0] || null;
}
function stripForSpeech(text) {
  return String(text).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, '').replace(/\s+/g, ' ').trim();
}
function stopAudio() {
  if (curAudio) { try { curAudio.pause(); } catch (e) {} curAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  document.body.classList.remove('speaking');
}
async function speak(text) {
  if (!voiceOn) return;
  const clean = stripForSpeech(text);
  if (!clean) return;
  stopAudio();
  // Prefer the natural server voice (OpenAI). Fall back to the browser voice.
  if (serverTTS) {
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: clean }) });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('audio')) {
        const url = URL.createObjectURL(await res.blob());
        const a = new Audio(url); curAudio = a;
        document.body.classList.add('speaking');
        a.onended = () => { document.body.classList.remove('speaking'); URL.revokeObjectURL(url); if (curAudio === a) curAudio = null; };
        a.onerror = () => { document.body.classList.remove('speaking'); browserSpeak(clean); };
        a.play().catch(() => browserSpeak(clean));
        return;
      }
      if (res.status === 402) serverTTS = false; // no OpenAI key configured — stop trying
    } catch (e) { /* network — fall back this time */ }
  }
  browserSpeak(clean);
}
function browserSpeak(clean) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  const v = pickVoice(); if (v) u.voice = v;
  u.rate = 0.98; u.pitch = 1.05;
  u.onstart = () => document.body.classList.add('speaking');
  u.onend = () => document.body.classList.remove('speaking');
  window.speechSynthesis.speak(u);
}
function micError(err) {
  let msg;
  if (err === 'not-allowed' || err === 'service-not-allowed') {
    msg = window.isSecureContext
      ? "I need permission to use the microphone — tap 🎤 again and choose Allow."
      : "To talk to me, open Curio on this device at http://localhost:3000, or use a secure https link — the microphone is blocked on a plain http Wi-Fi address.";
  } else if (err === 'no-speech') { msg = "I didn't hear anything — tap 🎤 and try again."; }
  else if (err === 'network') { msg = 'Talking needs an internet connection.'; }
  else { msg = "The microphone didn't work here. You can type instead, or try the Chrome browser."; }
  addBubble('guide', '🎤 ' + msg, false, false);
}
function toggleMic() {
  if (listening) { stopMic(); return; }
  if (!recog) { micError('unsupported'); return; }
  if (!window.isSecureContext) { micError('not-allowed'); return; } // http-over-WiFi blocks the mic
  stopAudio(); // so it doesn't hear itself
  try {
    recog.start(); listening = true;
    el('micBtn').classList.add('listening'); el('input').placeholder = 'Listening…';
  } catch (e) { stopMic(); }
}
function stopMic() {
  listening = false;
  const m = el('micBtn'); if (m) m.classList.remove('listening');
  el('input').placeholder = 'Type or tap 🎤 to talk…';
  try { if (recog) recog.stop(); } catch (e) {}
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

// Friendly in-app replacement for the browser's prompt(). Resolves to the
// trimmed text, or null if cancelled.
function askKid(question, placeholder) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ask-overlay';
    ov.innerHTML = `<div class="ask-card">
      <div style="font-size:2.2rem">🦉</div>
      <h3>${esc(question)}</h3>
      <input id="askInput" placeholder="${esc(placeholder || '')}" autocomplete="off" />
      <div class="row">
        <button class="btn mint" id="askGo">Let's go! →</button>
        <button class="btn ghost" id="askCancel">Never mind</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const input = ov.querySelector('#askInput');
    const done = (val) => { ov.remove(); resolve(val); };
    ov.querySelector('#askGo').onclick = () => done(input.value.trim() || null);
    ov.querySelector('#askCancel').onclick = () => done(null);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(input.value.trim() || null); }
      if (e.key === 'Escape') done(null);
    });
    ov.addEventListener('click', (e) => { if (e.target === ov) done(null); });
    setTimeout(() => input.focus(), 50);
  });
}

// Friendly yes/no (replaces confirm()).
function askYesNo(question, yesLabel, noLabel) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'ask-overlay';
    ov.innerHTML = `<div class="ask-card">
      <div style="font-size:2.2rem">🦉</div>
      <h3>${esc(question)}</h3>
      <div class="row">
        <button class="btn mint" id="ynYes">${esc(yesLabel || 'Yes! 🎉')}</button>
        <button class="btn ghost" id="ynNo">${esc(noLabel || 'Not yet')}</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    const done = (v) => { ov.remove(); resolve(v); };
    ov.querySelector('#ynYes').onclick = () => done(true);
    ov.querySelector('#ynNo').onclick = () => done(false);
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false); });
  });
}
// Brief floating message (replaces alert()).
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}

async function startFree() {
  const goal = await askKid('What do you want to learn or build today?', 'e.g. make slime, build a game, write a song');
  if (!goal) return;
  await start(null, goal);
}
async function start(objectiveId, goal) {
  try {
    const r = await api('/api/focus/start', { method: 'POST', body: { objectiveId, goal, targetMinutes: chosenMinutes } });
    FOCUS = r.focus; windDownShown = false;
    enterSession([]);
    addBubble('guide', firstPrompt(), false, true);
  } catch (e) { toast("Hmm, that didn't work — try again. 🌱"); }
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
  const title = await askKid('What do you want to explore or build?', 'a new idea…');
  if (!title) return;
  try {
    const r = await api('/api/quests', { method: 'POST', body: { title } });
    if (r.error) { addBubble('guide', r.error, true); return; }
    QUESTS.unshift(r.quest); activeQuest = r.quest.id; renderQuests();
    if (r.needsApproval) addBubble('guide', `Great idea! I asked your grown-up if we can explore "${r.quest.title}". As soon as they say yes, we'll start! 🌟`, false, true);
    else addBubble('guide', `Yes! Let's explore "${r.quest.title}"! What do you already know about it? 🚀`, false, true);
  } catch (e) { toast('Hmm, that didn\'t work — try again. 🌱'); }
}

// ---- Messaging ----
function addBubble(role, text, flagged, speakIt) {
  const div = document.createElement('div');
  div.className = `msg ${role === 'kid' ? 'kid' : 'guide'}${flagged ? ' flag' : ''}`;
  div.textContent = text;
  el('chat').appendChild(div);
  scrollDown();
  if (role === 'guide' && speakIt) speak(text); // only speak fresh replies, not replayed history
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
    addBubble('guide', r.reply, r.flagged, true);
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
    if (await askYesNo('Did you finish today\'s focus?  "' + FOCUS.goal + '"', 'Yes, I did it! 🎉', 'Not yet')) {
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
