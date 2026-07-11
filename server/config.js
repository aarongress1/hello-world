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

  // Natural text-to-speech (OpenAI voices). Falls back to the browser's built-in
  // voice if no key is available. Needs an OpenAI key: CURIO_TTS_KEY, or a
  // connected OpenAI provider (bundled or a parent's BYO key).
  tts: {
    key: process.env.CURIO_TTS_KEY || null,
    voice: process.env.CURIO_TTS_VOICE || 'nova',     // nova | fable | shimmer | alloy | echo | onyx
    model: process.env.CURIO_TTS_MODEL || 'tts-1',    // or 'gpt-4o-mini-tts'
  },
};

if (config.appSecret === 'dev-insecure-secret-change-me') {
  console.warn(
    '[curio] WARNING: APP_SECRET is unset — using an insecure dev default. ' +
    'Set APP_SECRET in production or stored provider keys are not safe.'
  );
}

module.exports = config;
