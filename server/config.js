'use strict';

const path = require('path');

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  appSecret: process.env.APP_SECRET || 'dev-insecure-secret-change-me',
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'curio.db'),
  demoMode: (process.env.DEMO_MODE || 'true').toLowerCase() === 'true',
  sessionTtlMs: 1000 * 60 * 60 * 24 * 30, // 30 days
};

if (config.appSecret === 'dev-insecure-secret-change-me') {
  console.warn(
    '[curio] WARNING: APP_SECRET is unset — using an insecure dev default. ' +
    'Set APP_SECRET in production or stored provider keys are not safe.'
  );
}

module.exports = config;
