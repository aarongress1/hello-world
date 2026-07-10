# CurioKids container. Node 22 ships the built-in node:sqlite used by the app.
FROM node:22-alpine

WORKDIR /app

# No dependencies to install (zero-dep server) — copy the source.
COPY package.json ./
COPY server ./server
COPY public ./public

# Data (SQLite) lives here; mount a persistent volume at /data in production.
ENV DATABASE_PATH=/data/curio.db
ENV PORT=3000
EXPOSE 3000

# APP_SECRET must be provided at runtime (signs sessions, encrypts keys).
CMD ["node", "--experimental-sqlite", "--no-warnings", "server/index.js"]
