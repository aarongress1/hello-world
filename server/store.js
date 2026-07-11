'use strict';

// Data-access layer. All SQL lives here so the rest of the app deals in
// plain objects. Swap this file (and db.js) for Postgres later without
// touching routes.

const db = require('./db');
const { hashPassword, verifyPassword, encrypt, decrypt } = require('./crypto');

// ---- Parents ---------------------------------------------------------------

function createParent({ email, name, password }) {
  const stmt = db.prepare(
    'INSERT INTO parents (email, name, password_hash) VALUES (?, ?, ?)'
  );
  const info = stmt.run(email.toLowerCase().trim(), name || null, hashPassword(password));
  return getParentById(info.lastInsertRowid);
}

function getParentByEmail(email) {
  return db.prepare('SELECT * FROM parents WHERE email = ?').get(email.toLowerCase().trim());
}

function getParentById(id) {
  return db.prepare('SELECT * FROM parents WHERE id = ?').get(id);
}

function authenticateParent(email, password) {
  const parent = getParentByEmail(email);
  if (!parent || !verifyPassword(password, parent.password_hash)) return null;
  return parent;
}

function setPlan(parentId, plan) {
  db.prepare('UPDATE parents SET plan = ? WHERE id = ?').run(plan, parentId);
}

// ---- Provider connection ---------------------------------------------------

function setProvider(parentId, { provider, apiKey, model }) {
  db.prepare(
    `INSERT INTO providers (parent_id, provider, api_key_enc, model, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(parent_id) DO UPDATE SET
       provider=excluded.provider, api_key_enc=excluded.api_key_enc,
       model=excluded.model, updated_at=datetime('now')`
  ).run(parentId, provider, encrypt(apiKey), model);
}

// Returns provider config WITHOUT the decrypted key (for display).
function getProviderMeta(parentId) {
  const row = db.prepare('SELECT provider, model, updated_at FROM providers WHERE parent_id = ?').get(parentId);
  return row || null;
}

// Returns provider config WITH the decrypted key (for making LLM calls).
function getProviderSecret(parentId) {
  const row = db.prepare('SELECT * FROM providers WHERE parent_id = ?').get(parentId);
  if (!row) return null;
  const apiKey = decrypt(row.api_key_enc);
  if (!apiKey) return null;
  return { provider: row.provider, model: row.model, apiKey };
}

function clearProvider(parentId) {
  db.prepare('DELETE FROM providers WHERE parent_id = ?').run(parentId);
}

// ---- Kids ------------------------------------------------------------------

function createKid(parentId, k) {
  const info = db.prepare(
    `INSERT INTO kids (parent_id, name, grade, interests, gate_mode, blocked_topics, priority_topics, homeschool, session_minutes, model_tier)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    parentId, k.name, k.grade, k.interests || '', k.gate_mode || 'every',
    k.blocked_topics || '', k.priority_topics || '', k.homeschool ? 1 : 0,
    k.session_minutes || 30, k.model_tier || 'auto'
  );
  return getKid(info.lastInsertRowid);
}

function updateKid(kidId, k) {
  db.prepare(
    `UPDATE kids SET name=?, grade=?, interests=?, gate_mode=?,
       blocked_topics=?, priority_topics=?, homeschool=?, session_minutes=?, model_tier=? WHERE id=?`
  ).run(
    k.name, k.grade, k.interests || '', k.gate_mode || 'every',
    k.blocked_topics || '', k.priority_topics || '', k.homeschool ? 1 : 0,
    k.session_minutes || 30, k.model_tier || 'auto', kidId
  );
  return getKid(kidId);
}

function getKid(kidId) {
  return db.prepare('SELECT * FROM kids WHERE id = ?').get(kidId);
}

function listKids(parentId) {
  return db.prepare('SELECT * FROM kids WHERE parent_id = ? ORDER BY created_at').all(parentId);
}

function kidBelongsToParent(kidId, parentId) {
  const k = getKid(kidId);
  return k && k.parent_id === parentId;
}

function deleteKid(kidId) {
  db.prepare('DELETE FROM kids WHERE id = ?').run(kidId);
}

// ---- Quests ----------------------------------------------------------------

function createQuest(kidId, { title, subject, status }) {
  const info = db.prepare(
    'INSERT INTO quests (kid_id, title, subject, status) VALUES (?, ?, ?, ?)'
  ).run(kidId, title, subject || 'General', status || 'pending');
  return getQuest(info.lastInsertRowid);
}

function getQuest(id) {
  return db.prepare('SELECT * FROM quests WHERE id = ?').get(id);
}

function listQuests(kidId) {
  return db.prepare('SELECT * FROM quests WHERE kid_id = ? ORDER BY created_at DESC').all(kidId);
}

function setQuestStatus(id, status) {
  db.prepare("UPDATE quests SET status=?, decided_at=datetime('now') WHERE id=?").run(status, id);
  return getQuest(id);
}

function listPendingQuestsForParent(parentId) {
  return db.prepare(
    `SELECT q.*, k.name AS kid_name FROM quests q
     JOIN kids k ON k.id = q.kid_id
     WHERE k.parent_id = ? AND q.status = 'pending'
     ORDER BY q.created_at DESC`
  ).all(parentId);
}

// ---- Messages --------------------------------------------------------------

function addMessage(kidId, { quest_id, role, content, topic, flagged }) {
  const info = db.prepare(
    'INSERT INTO messages (kid_id, quest_id, role, content, topic, flagged) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(kidId, quest_id || null, role, content, topic || null, flagged ? 1 : 0);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
}

function listMessages(kidId, questId, limit = 50) {
  if (questId) {
    return db.prepare(
      'SELECT * FROM messages WHERE kid_id = ? AND quest_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(kidId, questId, limit);
  }
  return db.prepare(
    'SELECT * FROM messages WHERE kid_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(kidId, limit);
}

function recentMessagesForDigest(kidId, sinceIso) {
  return db.prepare(
    `SELECT m.*, q.title AS quest_title FROM messages m
     LEFT JOIN quests q ON q.id = m.quest_id
     WHERE m.kid_id = ? AND (? IS NULL OR m.created_at > ?)
     ORDER BY m.created_at ASC`
  ).all(kidId, sinceIso || null, sinceIso || null);
}

// ---- Safety events ---------------------------------------------------------

function addSafetyEvent(kidId, { severity, category, snippet }) {
  db.prepare(
    'INSERT INTO safety_events (kid_id, severity, category, snippet) VALUES (?, ?, ?, ?)'
  ).run(kidId, severity, category, snippet.slice(0, 300));
}

function listSafetyEvents(parentId, limit = 50) {
  return db.prepare(
    `SELECT s.*, k.name AS kid_name FROM safety_events s
     JOIN kids k ON k.id = s.kid_id
     WHERE k.parent_id = ? ORDER BY s.created_at DESC LIMIT ?`
  ).all(parentId, limit);
}

// ---- Digests ---------------------------------------------------------------

function addDigest(kidId, { summary, from_time }) {
  const info = db.prepare(
    'INSERT INTO digests (kid_id, summary, from_time) VALUES (?, ?, ?)'
  ).run(kidId, summary, from_time || null);
  return db.prepare('SELECT * FROM digests WHERE id = ?').get(info.lastInsertRowid);
}

function listDigests(kidId, limit = 20) {
  return db.prepare('SELECT * FROM digests WHERE kid_id = ? ORDER BY created_at DESC LIMIT ?').all(kidId, limit);
}

function lastDigestTime(kidId) {
  const row = db.prepare('SELECT created_at FROM digests WHERE kid_id = ? ORDER BY created_at DESC LIMIT 1').get(kidId);
  return row ? row.created_at : null;
}

// ---- Learning plans & objectives (homeschool / self-guided) ---------------

function createPlan(kidId, { title, source }) {
  const info = db.prepare('INSERT INTO plans (kid_id, title, source) VALUES (?, ?, ?)')
    .run(kidId, title, source || 'custom');
  return db.prepare('SELECT * FROM plans WHERE id = ?').get(info.lastInsertRowid);
}

function listPlans(kidId) {
  return db.prepare('SELECT * FROM plans WHERE kid_id = ? ORDER BY created_at DESC').all(kidId);
}

function addObjective(kidId, { plan_id, subject, title, sort }) {
  const info = db.prepare(
    'INSERT INTO objectives (kid_id, plan_id, subject, title, sort) VALUES (?, ?, ?, ?, ?)'
  ).run(kidId, plan_id || null, subject || 'General', title, sort || 0);
  return db.prepare('SELECT * FROM objectives WHERE id = ?').get(info.lastInsertRowid);
}

function listObjectives(kidId) {
  return db.prepare(
    `SELECT * FROM objectives WHERE kid_id = ?
     ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, sort, created_at`
  ).all(kidId);
}

function getObjective(id) {
  return db.prepare('SELECT * FROM objectives WHERE id = ?').get(id);
}

function nextObjective(kidId) {
  return db.prepare(
    `SELECT * FROM objectives WHERE kid_id = ? AND status != 'done'
     ORDER BY CASE status WHEN 'in_progress' THEN 0 ELSE 1 END, sort, created_at LIMIT 1`
  ).get(kidId);
}

function setObjectiveStatus(id, status) {
  const doneAt = status === 'done' ? "datetime('now')" : 'NULL';
  db.prepare(`UPDATE objectives SET status=?, done_at=${doneAt} WHERE id=?`).run(status, id);
  return getObjective(id);
}

function deleteObjective(id) {
  db.prepare('DELETE FROM objectives WHERE id = ?').run(id);
}

// ---- Focus sessions --------------------------------------------------------

function startFocus(kidId, { objective_id, goal, target_minutes }) {
  const info = db.prepare(
    'INSERT INTO focus_sessions (kid_id, objective_id, goal, target_minutes, started_at_ms) VALUES (?, ?, ?, ?, ?)'
  ).run(kidId, objective_id || null, goal, target_minutes || 30, Date.now());
  if (objective_id) setObjectiveStatus(objective_id, 'in_progress');
  return getFocus(info.lastInsertRowid);
}

function getFocus(id) {
  return db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id);
}

function bumpFocusExchanges(id) {
  db.prepare('UPDATE focus_sessions SET exchanges = exchanges + 1 WHERE id = ?').run(id);
}

function endFocus(id, reason) {
  db.prepare('UPDATE focus_sessions SET ended_at_ms=?, ended_reason=? WHERE id=? AND ended_at_ms IS NULL')
    .run(Date.now(), reason || 'done', id);
  return getFocus(id);
}

function recentFocusSessions(kidId, limit = 20) {
  return db.prepare(
    `SELECT f.*, o.title AS objective_title FROM focus_sessions f
     LEFT JOIN objectives o ON o.id = f.objective_id
     WHERE f.kid_id = ? ORDER BY f.started_at_ms DESC LIMIT ?`
  ).all(kidId, limit);
}

// ---- Sessions --------------------------------------------------------------

function createSession(id, parentId, expiresAt) {
  db.prepare('INSERT INTO sessions (id, parent_id, expires_at) VALUES (?, ?, ?)').run(id, parentId, expiresAt);
}

function getSession(id) {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(id);
    return null;
  }
  return row;
}

function setSessionKid(id, kidId) {
  db.prepare('UPDATE sessions SET kid_id = ?, focus_session_id = NULL WHERE id = ?').run(kidId, id);
}

function setSessionFocus(id, focusId) {
  db.prepare('UPDATE sessions SET focus_session_id = ? WHERE id = ?').run(focusId, id);
}

function destroySession(id) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

module.exports = {
  createParent, getParentByEmail, getParentById, authenticateParent, setPlan,
  setProvider, getProviderMeta, getProviderSecret, clearProvider,
  createKid, updateKid, getKid, listKids, kidBelongsToParent, deleteKid,
  createQuest, getQuest, listQuests, setQuestStatus, listPendingQuestsForParent,
  addMessage, listMessages, recentMessagesForDigest,
  addSafetyEvent, listSafetyEvents,
  addDigest, listDigests, lastDigestTime,
  createPlan, listPlans, addObjective, listObjectives, getObjective, nextObjective,
  setObjectiveStatus, deleteObjective,
  startFocus, getFocus, bumpFocusExchanges, endFocus, recentFocusSessions,
  createSession, getSession, setSessionKid, setSessionFocus, destroySession,
};
