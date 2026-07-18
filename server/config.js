'use strict';

const fs = require('fs');
const path = require('path');

// Minimal .env loader (no dependency). Reads KEY=VALUE lines from a .env file in
// the project root so local pilots can configure without setting shell vars.
// Real environment variables always win over .env.
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch { /* ignore malformed .env */ }
})();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  appSecret: process.env.APP_SECRET || 'dev-insecure-secret-change-me',
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'curio.db'),
  demoMode: (process.env.DEMO_MODE || 'true').toLowerCase() === 'true',
  sessionTtlMs: 1000 * 60 * 60 * 24 * 30, // 30 days

  // Bundled ("we run the model") mode: a single server-side provider key used
  // for all families unless a parent has connected their own key (BYO / Pro
  // mode). Set these env vars to run real AI without per-parent setup.
  bundled: {
    provider: process.env.CURIO_AI_PROVIDER || null, // 'anthropic' | 'openai'
    apiKey: process.env.CURIO_AI_KEY || null,
    model: process.env.CURIO_AI_MODEL || null,        // optional; defaults per provider
  },

  // Natural voice (OpenAI). TTS speaks Curio's replies; STT transcribes the
  // kid's mic audio (transcribe-and-discard — audio is never stored). Both need
  // an OpenAI key: CURIO_TTS_KEY, or a connected OpenAI provider (bundled or a
  // parent's BYO key). Falls back to the browser's built-in voice otherwise.
  // Pilot decision 2026-07-12: Curio pays for voice via CURIO_TTS_KEY.
  tts: {
    key: process.env.CURIO_TTS_KEY || null,
    voice: process.env.CURIO_TTS_VOICE || 'nova',     // nova | fable | shimmer | alloy | echo | onyx
    model: process.env.CURIO_TTS_MODEL || 'gpt-4o-mini-tts', // steerable + natural ('tts-1' also works)
    // Style steering for gpt-4o-mini-tts (ignored on tts-1).
    instructions: process.env.CURIO_TTS_STYLE ||
      'Speak like a warm, playful learning guide talking with a young child: clear, gentle, upbeat but calm, natural pacing, never rushed or theatrical.',
  },
  stt: {
    model: process.env.CURIO_STT_MODEL || 'gpt-4o-mini-transcribe', // mic transcription
  },
};

const INSECURE_DEFAULT_SECRET = 'dev-insecure-secret-change-me';

// The app secret both signs session cookies AND derives the AES key that
// encrypts stored provider keys and child data. A KNOWN default means forgeable
// sessions and decryptable data — so we FAIL CLOSED (refuse to boot) whenever
// the default is in use in a real context (production, or non-demo mode where
// real provider keys/child data are handled). Local demo keeps only a warning.
// Deliberate local override: ALLOW_INSECURE_SECRET=true.
function assertSecretSafe(cfg = config, env = process.env) {
  if (cfg.appSecret !== INSECURE_DEFAULT_SECRET) return;
  const isProduction = String(env.NODE_ENV || '').toLowerCase() === 'production';
  const allowInsecure = String(env.ALLOW_INSECURE_SECRET || '').toLowerCase() === 'true';
  const unsafeContext = isProduction || !cfg.demoMode;
  if (unsafeContext && !allowInsecure) {
    throw new Error(
      '[curio] FATAL: APP_SECRET is unset (using the insecure dev default) in a ' +
      'production/non-demo context. Generate a strong secret (e.g. `openssl rand -hex 32`) ' +
      'and set APP_SECRET. To override for a deliberate local test, set ALLOW_INSECURE_SECRET=true.'
    );
  }
  console.warn(
    '[curio] WARNING: APP_SECRET is unset — using an insecure dev default. ' +
    'Fine for local demo only; set APP_SECRET before handling real data.'
  );
}

config.assertSecretSafe = assertSecretSafe;
config.INSECURE_DEFAULT_SECRET = INSECURE_DEFAULT_SECRET;

assertSecretSafe();

module.exports = config;
