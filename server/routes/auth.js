'use strict';

const store = require('../store');
const llm = require('../llm');
const { tts: ttsCfg } = require('../config');
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
    const provider = store.getProviderMeta(ctx.parent.id);
    // Natural read-aloud voice needs an OpenAI key: env CURIO_TTS_KEY, a parent's
    // BYO OpenAI key, or a bundled OpenAI key. Without it the kid UI falls back to
    // the browser voice (which is silent in the Android WebView).
    const bundledSecret = llm.defaultSecret();
    const voiceReady = !!ttsCfg.key
      || (provider && provider.provider === 'openai')
      || (bundledSecret && bundledSecret.provider === 'openai');
    res.json({
      parent: publicParent(ctx.parent),
      provider,
      // "Real AI live?" = this parent connected a key, OR a server bundled key exists.
      aiConnected: !!provider || !!bundledSecret,
      bundled: !provider && !!bundledSecret,
      voiceReady: !!voiceReady,
      selectedKidId: ctx.session.kid_id || null,
      hasExitPin: store.hasExitPin(ctx.parent.id),
    });
  });

  // Choose plan (no payment processor wired — records intent).
  app.post('/api/plan', requireParent(async (req, res) => {
    const plan = String(req.body?.plan || '').toLowerCase();
    if (!['explorer', 'plus', 'max'].includes(plan)) return res.json({ error: 'Unknown plan.' }, 400);
    store.setPlan(req.parent.id, plan);
    res.json({ ok: true, plan });
  }));

  // Set / change the kid-screen parent-area exit PIN (4–8 digits).
  app.post('/api/exit-pin', requireParent(async (req, res) => {
    const pin = String(req.body?.pin || '').trim();
    if (!/^\d{4,8}$/.test(pin)) {
      return res.json({ error: 'Exit PIN must be 4–8 digits.' }, 400);
    }
    store.setExitPin(req.parent.id, pin);
    res.json({ ok: true, hasExitPin: true });
  }));

  app.del('/api/exit-pin', requireParent(async (req, res) => {
    store.clearExitPin(req.parent.id);
    res.json({ ok: true, hasExitPin: false });
  }));

  // Unlock "Parent area" from the kid screen. Accepts exit PIN (if set) or account password.
  // Allowed while a kid is selected — this is the escape hatch off the kid UI.
  app.post('/api/verify-exit', requireParent(async (req, res) => {
    const code = String(req.body?.code || '');
    if (!store.verifyParentExit(req.parent.id, code)) {
      return res.json({ error: 'That code did not match. Try again.' }, 401);
    }
    res.json({ ok: true });
  }));
};

function publicParent(p) {
  return { id: p.id, email: p.email, name: p.name, plan: p.plan };
}
