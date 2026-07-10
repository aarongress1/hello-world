# CurioKids — Android app (WebView wrapper)

A lightweight native Android app that loads the CurioKids web app. It gives you a
real, installable APK for your kids' Android tablets **without rebuilding the UI**
— ideal for the family pilot. (For a Play Store release we'd move to React Native
or add native features; this wrapper is perfect for personal/sideloaded use.)

## Prerequisites
- **Android Studio** (2024.1 "Koala" or newer recommended).
- The CurioKids **server running** and reachable (see `../LOCAL_PILOT.md`).

## Open & build (first time)
1. Android Studio → **Open** → select this **`android/`** folder (not the repo root).
2. Let **Gradle sync** finish. It will download Gradle 8.7 and any missing SDK
   packages — click through the prompts to install them. If it mentions the
   **Gradle wrapper**, accept the suggested setup.
3. Set the URL the app loads: open
   **`app/src/main/res/values/strings.xml`** and edit `app_url`:
   - **Emulator** reaching your PC: `http://10.0.2.2:3000`
   - **Physical tablet** on the same WiFi: `http://YOUR-PC-IP:3000`
     (find it with `ipconfig`, e.g. `http://192.168.1.42:3000`)
   - **Best (works anywhere):** your free Cloudflare tunnel `https://…` URL.

## Run it
- Pick an emulator or a plugged-in tablet (with **USB debugging** on) → click
  **Run ▶**. The app opens straight into CurioKids.

## Make an APK to sideload onto a tablet
1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
2. When done, click **locate** → `app/build/outputs/apk/debug/app-debug.apk`.
3. Copy that file to the tablet (USB, Google Drive, email).
4. On the tablet, tap it → allow **Install unknown apps** for that source →
   **Install**. The Curio icon appears in the app drawer.

## Notes
- Plain `http://` to your PC is enabled via `network_security_config.xml` for the
  pilot. For a public release, use `https://` and remove that allowance.
- The app keeps the parent's login (cookies) and uses the Android back button to
  navigate the app's history.
- `applicationId` is `com.curiokids.app` and app name is set in
  `res/values/strings.xml`.
