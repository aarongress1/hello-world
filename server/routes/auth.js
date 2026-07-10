'use strict';

const store = require('../store');
const { startSession, endSession, currentSession, requireParent } = require('../session');

function validEmail(e) { return typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }

module.exports = function registerAuth(app) {
  // Create a parent account.
  app.post('/api/signup', async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!validEmail(email)) return res.json({ error: 'Please enter a valid email.' }, 400);
    if (!password || String(password).length < 8) return res.json({ error: 'Password must be at least 8 characters.' }, 400);
    if (store.getParentByEmail(email)) return res.json({ error: 'An account with that email already exists.' }, 409);
    const parent = store.createParent({ email, name, password });
    startSession(res, parent.id);
    res.json({ ok: true, parent: publicParent(parent) });
  });

  // Sign in.
  app.post('/api/login', async (req, res) => {
    const { email, password } = req.body || {};
    const parent = store.authenticateParent(email || '', password || '');
    if (!parent) return res.json({ error: 'Wrong email or password.' }, 401);
    startSession(res, parent.id);
    res.json({ ok: true, parent: publicParent(parent) });
  });

  app.post('/api/logout', async (req, res) => {
    endSession(req, res);
    res.json({ ok: true });
  });

  // Who am I? (used by the frontend to decide what to render)
  app.get('/api/me', async (req, res) => {
    const ctx = currentSession(req);
    if (!ctx) return res.json({ parent: null });
    res.json({
      parent: publicParent(ctx.parent),
      provider: store.getProviderMeta(ctx.parent.id),
      selectedKidId: ctx.session.kid_id || null,
    });
  });

  // Choose plan (no payment processor wired — records intent).
  app.post('/api/plan', requireParent(async (req, res) => {
    const plan = String(req.body?.plan || '').toLowerCase();
    if (!['explorer', 'plus', 'max'].includes(plan)) return res.json({ error: 'Unknown plan.' }, 400);
    store.setPlan(req.parent.id, plan);
    res.json({ ok: true, plan });
  }));
};

function publicParent(p) {
  return { id: p.id, email: p.email, name: p.name, plan: p.plan };
}
