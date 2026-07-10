// Kid chat experience.
let KID = null, QUESTS = [], activeQuest = null;

async function boot() {
  let ctx;
  try { ctx = await api('/api/kid-context'); }
  catch (e) {
    if (e.status === 401) { window.location.href = '/'; return; }
    document.querySelector('.chat').innerHTML = '<div class="welcome"><div class="big">🦉</div><p>Ask your grown-up to start a session for you from the parent dashboard.</p><a class="btn" href="/parent.html">Go to parent area</a></div>';
    return;
  }
  KID = ctx.kid; QUESTS = ctx.quests || [];
  el('hello').textContent = `Hi ${KID.name}!`;
  renderQuests();
  if (ctx.messages && ctx.messages.length) {
    ctx.messages.forEach(m => addBubble(m.role, m.content, m.flagged));
  } else {
    renderWelcome();
  }
  scrollDown();
}

function renderWelcome() {
  const chat = el('chat');
  chat.innerHTML = `
    <div class="welcome">
      <div class="big">🦉✨</div>
      <h2>Hi ${esc(KID.name)}! I'm Curio.</h2>
      <p>What sounds fun today? Pick one, or just start typing!</p>
      <div class="starter">
        <button onclick="starter('I want to build a game!')">🎮 Build a game</button>
        <button onclick="starter('I want to start a business!')">💡 Start a business</button>
        <button onclick="starter('I want to write a song!')">🎵 Write a song</button>
        <button onclick="starter('Teach me something cool!')">🚀 Surprise me</button>
      </div>
    </div>`;
}
function starter(text) { el('input').value = text; send(new Event('submit')); }

function renderQuests() {
  const q = el('quests');
  q.innerHTML = QUESTS.map(x => `<button class="qchip ${x.id === activeQuest ? 'active' : ''} ${x.status === 'pending' ? 'pending' : ''}" onclick="pickQuest(${x.id})">${x.status === 'pending' ? '⏳ ' : ''}${esc(x.title)}</button>`).join('')
    + `<button class="qchip add" onclick="newQuest()">＋ New idea</button>`;
}
function pickQuest(id) {
  activeQuest = activeQuest === id ? null : id;
  renderQuests();
  const q = QUESTS.find(x => x.id === id);
  if (q && q.status === 'pending') addBubble('guide', `I asked your grown-up if we can explore "${q.title}". As soon as they say yes, we'll dive in! 🌟`, false);
}
async function newQuest() {
  const title = prompt('What do you want to explore or build?');
  if (!title || !title.trim()) return;
  try {
    const r = await api('/api/quests', { method: 'POST', body: { title: title.trim() } });
    if (r.error) { addBubble('guide', r.error, true); return; }
    QUESTS.unshift(r.quest); activeQuest = r.quest.id; renderQuests();
    if (r.needsApproval) addBubble('guide', `Great idea! I asked your grown-up if we can explore "${r.quest.title}" together. As soon as they say yes, we'll start! 🌟`, false);
    else addBubble('guide', `Yes! Let's explore "${r.quest.title}"! What do you already know about it? 🚀`, false);
  } catch (e) { alert(e.message); }
}

function addBubble(role, text, flagged) {
  if (el('chat').querySelector('.welcome')) el('chat').innerHTML = '';
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
  } catch (err) {
    typing.remove();
    addBubble('guide', 'Oops, something hiccuped. Try again! 🌱', false);
  }
  el('sendBtn').disabled = false; input.focus();
  return false;
}

async function exitKid() {
  await api('/api/select-kid', { method: 'POST', body: { kidId: null } }).catch(() => {});
  window.location.href = '/parent.html';
}

boot();
