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

-- A homeschool / self-guided learning plan is a set of objectives per child.
CREATE TABLE IF NOT EXISTS plans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id     INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'custom', -- 'custom' | 'preset:<name>' | 'import'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS objectives (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id     INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  plan_id    INTEGER REFERENCES plans(id) ON DELETE CASCADE,
  subject    TEXT NOT NULL DEFAULT 'General',
  title      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'todo', -- 'todo' | 'in_progress' | 'done'
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at    TEXT
);

-- A time-boxed, intentional learning session. The product optimizes for
-- FINISHING these, not for maximizing minutes on screen.
CREATE TABLE IF NOT EXISTS focus_sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kid_id         INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  objective_id   INTEGER REFERENCES objectives(id) ON DELETE SET NULL,
  goal           TEXT NOT NULL,
  target_minutes INTEGER NOT NULL DEFAULT 30,
  started_at_ms  INTEGER NOT NULL,
  ended_at_ms    INTEGER,
  ended_reason   TEXT,
  exchanges      INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---- Lightweight migrations (add columns to existing tables) --------------
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('kids', 'blocked_topics', "blocked_topics TEXT NOT NULL DEFAULT ''");
ensureColumn('kids', 'priority_topics', "priority_topics TEXT NOT NULL DEFAULT ''");
ensureColumn('kids', 'homeschool', 'homeschool INTEGER NOT NULL DEFAULT 0');
ensureColumn('kids', 'session_minutes', 'session_minutes INTEGER NOT NULL DEFAULT 30');
ensureColumn('kids', 'model_tier', "model_tier TEXT NOT NULL DEFAULT 'auto'"); // auto|fast|balanced|capable
ensureColumn('sessions', 'focus_session_id', 'focus_session_id INTEGER');
// Parent exit PIN: blocks the kid UI "Parent area" button until verified.
ensureColumn('parents', 'exit_pin_hash', 'exit_pin_hash TEXT');
// Homeschool split-screen: optional practice link (e.g. IXL skill) + parent notes.
ensureColumn('objectives', 'resource_url', 'resource_url TEXT');
ensureColumn('objectives', 'notes', "notes TEXT NOT NULL DEFAULT ''");
ensureColumn('focus_sessions', 'kind', "kind TEXT NOT NULL DEFAULT 'explore'");

module.exports = db;
