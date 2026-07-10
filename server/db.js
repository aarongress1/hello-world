'use strict';

// Thin wrapper around Node's built-in SQLite (node:sqlite, experimental).
// Requires the process to be started with --experimental-sqlite (see package.json).

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { databasePath } = require('./config');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS parents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'explorer',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS providers (
  parent_id   INTEGER PRIMARY KEY REFERENCES parents(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,               -- 'anthropic' | 'openai'
  api_key_enc TEXT NOT NULL,
  model       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kids (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id  INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  grade      TEXT NOT NULL,                -- 'K','1'..'8'
  interests  TEXT NOT NULL DEFAULT '',     -- comma-separated
  gate_mode  TEXT NOT NULL DEFAULT 'every',-- 'every' | 'daily' | 'weekly' | 'off'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id      INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT 'General',
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | approved | declined | done
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at  TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id     INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  quest_id   INTEGER REFERENCES quests(id) ON DELETE SET NULL,
  role       TEXT NOT NULL,               -- 'kid' | 'guide'
  content    TEXT NOT NULL,
  topic      TEXT,
  flagged    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS safety_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id     INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  severity   TEXT NOT NULL,               -- 'info' | 'warn' | 'block'
  category   TEXT NOT NULL,
  snippet    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS digests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id      INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  summary     TEXT NOT NULL,
  from_time   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  parent_id  INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  kid_id     INTEGER REFERENCES kids(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL
);
`);

module.exports = db;
