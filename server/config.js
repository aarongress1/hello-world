'use strict';

const path = require('path');

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
};

if (config.appSecret === 'dev-insecure-secret-change-me') {
  console.warn(
    '[curio] WARNING: APP_SECRET is unset — using an insecure dev default. ' +
    'Set APP_SECRET in production or stored provider keys are not safe.'
  );
}

module.exports = config;
