# 🦉 CurioKids

**Where curiosity becomes mastery.**

A K–8 learning companion that turns curiosity into real projects — build a game,
start a little business, write a song — with first-principles coaching and safety
rails the parent controls. Curio is powered by **the parent's own Claude
(Anthropic) or OpenAI account**, so families pay their provider directly and Curio
never marks up model usage.

This repo is a working **MVP** you can run locally with zero `npm install`.

---

## Why Curio

- **Find the spark.** Curio's mission is to help a child discover what excites them
  and go deep on it — coaching from first principles, asking guiding questions, and
  celebrating effort to build real confidence.
- **Parents stay in control.** You connect the model, set per-child oversight, read
  every transcript, approve new topics, and get a plain-English debrief.
- **Safety by design.** Defense in depth — no single mechanism is trusted alone.

## Safety rails

1. **Age-tuned by grade** — vocabulary, topics, and reply length adapt to K–2, 3–5,
   or 6–8 via a per-child system prompt.
2. **Two-way screening** — every message *in* and *out* is scanned. Off-limits
   subjects (sexual, weapons, drugs, hate, graphic violence) are refused gently and
   redirected; the parent is alerted.
3. **Care path** — signals of sadness or self-harm trigger a warm response that
   steers the child to a trusted adult, and flag the parent immediately.
4. **Topic approval gates** — per child, choose: approve *every* new topic (best for
   younger kids), or get a *daily* / *weekly* debrief, or open exploration.
5. **Full transcripts + parent debriefs** — read everything, anytime; generate an
   AI-written (or local fallback) summary of topics explored and follow-ups.
6. **Your key, encrypted** — the provider API key is AES-256-GCM encrypted at rest
   and never exposed to the child or their device.

## Pricing (platform only — model usage billed by your provider)

| Plan | Price | For |
|------|-------|-----|
| **Explorer** | $0 | 1 child, core safety, weekly debrief |
| **Curio Plus** | $12/mo | up to 3 children, all oversight modes, AI debriefs, quest library |
| **Curio Max** | $29/mo | up to 6 children, real-time per-message approval, multi-provider, analytics |

## Run it

Requires **Node ≥ 22.5** (uses the built-in `node:sqlite`).

```bash
npm start          # → http://localhost:3000
```

No dependencies to install. By default it runs in **demo mode** (canned guide
replies, no API key needed) so you can try the whole flow. To use a real model,
sign up, open the parent dashboard → **AI account**, and connect a Claude or OpenAI
key.

Configuration (all optional — see `.env.example`):

```bash
PORT=3000
APP_SECRET=<long-random-string>   # signs sessions + encrypts provider keys
DATABASE_PATH=./data/curio.db
DEMO_MODE=true                    # false = require a connected provider
```

## Try the flow

1. **Get started** → create a parent account.
2. **AI account** → (optional) connect your Claude/OpenAI key & pick a model.
3. **Children** → add a child (name, grade, interests, oversight mode) → **Start session**.
4. As the kid: propose a project ("Build a dinosaur game"), chat with Curio.
5. Back in the parent dashboard: **Approvals**, **Activity** (transcript + debrief),
   **Safety** events.

## Architecture

```
server/
  index.js        entry — wires routes, boots SQLite
  web.js          tiny zero-dependency http router / static server
  config.js       env config
  db.js           node:sqlite schema
  store.js        data-access layer (swap for Postgres later)
  crypto.js       scrypt password hashing, AES key encryption, cookie signing
  session.js      cookie sessions + requireParent guard
  safety.js       grade bands, in/out screening, system-prompt builder, care notes
  llm.js          Anthropic + OpenAI clients, moderation, demo guide
  routes/         auth · parent · chat (the core loop)
public/           landing + pricing, parent dashboard, kid chat (vanilla JS)
```

## Notes & next steps

This is an MVP scaffold, not a finished production service. Natural next steps:
payment processor (Stripe) for plans, scheduled email/push debriefs, per-message
real-time approval for the Max tier, a separate kid PIN login, richer analytics,
and moving storage from SQLite to a managed Postgres. Not affiliated with Anthropic
or OpenAI. Parent-supervised; not a substitute for adult care.
