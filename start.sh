#!/usr/bin/env bash
# Run CurioKids on this machine (macOS/Linux). Configure via .env
# (copy .env.example to .env). Requires Node.js 22.5+.  Usage: bash start.sh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (version 22.5+)."
  exit 1
fi

if [ ! -f .env ]; then
  echo "No .env found — copying .env.example to .env. Edit .env to add your AI key."
  cp .env.example .env
fi

echo "Starting CurioKids… open http://localhost:3000  (Ctrl+C to stop)"
exec node --experimental-sqlite --no-warnings server/index.js
