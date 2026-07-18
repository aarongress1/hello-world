# Run CurioKids for your family — free, on your own PC

No hosting bill. You run the server on your computer and open it on your kids'
devices over your home WiFi (or a free HTTPS tunnel). Perfect for a pilot.

---

## 1. One-time setup
1. Install **Node.js 22.5+** from [nodejs.org](https://nodejs.org).
2. You already cloned the project to
   `C:\Users\aaron\Documents\Gress-2\OtherWorlds\CurioKids`.
3. In that folder, copy **`.env.example`** to **`.env`** and set `APP_SECRET` to any
   long random string. (`start.bat` will create `.env` for you if you skip this.)

> **Turning on real AI — the easy way:** you do **not** need to edit `.env` for the
> API key. Once the app is running, open the **parent dashboard → 🔌 AI account**,
> paste your Anthropic key, and click **Test connection**. Green = real tutoring is
> on. (Editing `CURIO_AI_KEY` in `.env` is only for the "bundled" server setup.)

## 2. Start it
- **Windows:** double-click **`start.bat`** (or run `npm start`).
- **Mac/Linux:** `bash start.sh` (or `npm start`).

You'll see `Curio is running at http://localhost:3000`. Open that on the same PC
to create your parent account and set up your kids.

## 3. Open it on your kids' devices (same WiFi)
1. Find your PC's local IP:
   - **Windows:** open Command Prompt → `ipconfig` → look for **IPv4 Address**
     (like `192.168.1.42`).
   - **Mac:** System Settings → Wi-Fi → Details → IP address.
2. On the kid's iPad/tablet browser, go to **`http://YOUR-PC-IP:3000`**
   (e.g. `http://192.168.1.42:3000`).
3. **Install it like an app:**
   - **iPad/iPhone (Safari):** Share → **Add to Home Screen**.
   - **Android (Chrome):** menu → **Add to Home Screen / Install app**.

> **Windows firewall:** the first time, Windows may ask to allow Node.js on
> **Private networks** — click **Allow**. (If devices can't connect, that's
> usually why.)

## 4. The HTTPS link — required for voice (still free)
Plain `http://` over WiFi works for typing, but **the microphone is blocked by
every browser on a plain http address**, and the https link also enables full
app install + access off your home network. If your kids will *talk* to Curio,
use **Cloudflare Tunnel** (free):
1. Install `cloudflared` ([guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)).
2. With the server running, in another terminal:
   ```
   cloudflared tunnel --url http://localhost:3000
   ```
3. It prints a `https://something.trycloudflare.com` URL — open that on any
   device and **Add to Home Screen**. (This quick URL changes each run; a free
   Cloudflare account + a domain gives you a permanent one.)

> **Android APK users:** set `app_url` in `android/.../res/values/strings.xml`
> to this https URL — the in-app mic only works from a secure (https) page.

## 4½. Turn on Curio's natural voice (speaking *and* listening)
Out of the box Curio uses the robotic built-in browser voice. For the warm,
natural voice + a mic that works on tablets and the Android app:
1. Get an OpenAI API key at `platform.openai.com` (this is Curio's *voice*, it
   works fine alongside an Anthropic key for the *brain*).
2. In `.env`, set `CURIO_TTS_KEY=sk-...` and restart the server.
3. Open Curio via the **https link** (step 4) on the kids' devices.

That one key powers both the spoken replies (`gpt-4o-mini-tts`) and mic
transcription (`gpt-4o-mini-transcribe`). The kid's audio is transcribed and
immediately discarded — it is never stored.

## 5. Day-to-day
- **Your data** lives in `data/curio.db` on your PC. Back it up by copying that
  file. Deleting it resets everything.
- **Stop** the server with **Ctrl+C** in its window.
- **Update** to the latest build: in the project folder,
  `git pull origin claude/kids-learning-llm-app-bz7f3y`, then start again.

## Which device gets what
| Device | How to use it |
|---|---|
| Your PC | The server + your parent dashboard |
| iPad / iPhone | Browser → Add to Home Screen (no Mac needed) |
| Android tablet | Browser → Add to Home Screen, **or** the native APK (see `android/`) |
