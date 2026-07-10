'use strict';

const store = require('./store');
const { sign, unsign, randomToken } = require('./crypto');
const { sessionTtlMs } = require('./config');

const COOKIE = 'curio_sid';

function startSession(res, parentId) {
  const sid = randomToken();
  store.createSession(sid, parentId, Date.now() + sessionTtlMs);
  res.setCookie(COOKIE, sign(sid), { maxAge: sessionTtlMs });
  return sid;
}

function endSession(req, res) {
  const sid = readSid(req);
  if (sid) store.destroySession(sid);
  res.setCookie(COOKIE, '', { maxAge: 0 });
}

function readSid(req) {
  const signed = req.cookies[COOKIE];
  return signed ? unsign(signed) : null;
}

// Attaches req.session and req.parent when logged in; returns null otherwise.
function currentSession(req) {
  const sid = readSid(req);
  if (!sid) return null;
  const session = store.getSession(sid);
  if (!session) return null;
  const parent = store.getParentById(session.parent_id);
  if (!parent) return null;
  return { sid, session, parent };
}

// Route guard: calls handler only when authenticated; else 401.
function requireParent(handler) {
  return async (req, res) => {
    const ctx = currentSession(req);
    if (!ctx) return res.json({ error: 'Not signed in.' }, 401);
    req.session = ctx.session;
    req.sid = ctx.sid;
    req.parent = ctx.parent;
    return handler(req, res);
  };
}

module.exports = { startSession, endSession, currentSession, requireParent, COOKIE };
