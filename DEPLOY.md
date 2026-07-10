# Deploying CurioKids (so your family can use it)

This gets the current web app online and installable on phones/tablets as an app
("add to home screen"). It's the fastest path to real use while the native
iOS/Android apps are built. Native store apps come later; this same backend
powers both.

> ⚠️ This uses SQLite on a single instance with a persistent disk — perfect for
> personal/family use and a pilot. Before a public launch we migrate to Postgres
> (Backend pillar).

## Option A — Render (recommended, ~10 min)

1. Push this branch to GitHub (already done).
2. Go to **render.com** → **New → Blueprint** → connect this repo and pick the
   branch. Render reads `render.yaml` and provisions a web service + a 1 GB disk.
3. It auto-generates `APP_SECRET`. Click **Apply**. You'll get a URL like
   `https://curiokids.onrender.com`.
4. **Turn on real AI (bundled mode):** in the service's **Environment** tab add:
   - `CURIO_AI_PROVIDER = anthropic`
   - `CURIO_AI_KEY = <your Anthropic API key>`  ← get one at
     `console.anthropic.com` (this is an **API** key, separate from a Claude.ai
     subscription)
   - `CURIO_AI_MODEL = claude-sonnet-5`
   Save → it redeploys. Now kids chat with the real model, no per-parent setup.
   *(Leave these unset to run in friendly demo mode.)*

## Option B — Any Docker host (Railway, Fly.io, Cloud Run, a VPS)

```bash
docker build -t curiokids .
docker run -p 3000:3000 \
  -e APP_SECRET="$(openssl rand -hex 32)" \
  -e DEMO_MODE=true \
  -e CURIO_AI_PROVIDER=anthropic \
  -e CURIO_AI_KEY=sk-ant-... \
  -e CURIO_AI_MODEL=claude-sonnet-5 \
  -v curio-data:/data \
  curiokids
```

Mount a volume at `/data` so the database survives restarts.

## Install it on your kid's device (PWA)

Once it's online at your URL:
- **iPhone/iPad (Safari):** open the URL → Share → **Add to Home Screen**.
- **Android (Chrome):** open the URL → menu → **Install app / Add to Home Screen**.

It launches full-screen with the Curio icon, like a native app.

## First-run checklist
1. Open your URL → **Get started** → create your parent account.
2. **Children** → add each kid (grade, interests, off-limit/priority topics, focus length).
3. **Learning plans** → import or paste their objectives.
4. **Start session** on a child → hand them the device (or install on theirs).
5. Later, review **Activity / Safety / Approvals** from your own device.

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `APP_SECRET` | Signs sessions, encrypts stored keys | required in prod |
| `DATABASE_PATH` | SQLite file location | `./data/curio.db` |
| `DEMO_MODE` | Canned replies when no AI key is available | `true` |
| `CURIO_AI_PROVIDER` | `anthropic` or `openai` (bundled mode) | unset |
| `CURIO_AI_KEY` | Server-side API key for bundled mode | unset |
| `CURIO_AI_MODEL` | Model id | provider default |
| `PORT` | Port to listen on | `3000` |
