@echo off
REM ============================================================
REM  CurioKids family pilot launcher
REM  Starts (1) the local server and (2) a free Cloudflare
REM  https tunnel so the tablet APK can reach it from anywhere.
REM ============================================================
cd /d "%~dp0"

echo Starting the CurioKids server...
start "CurioKids server" cmd /k node --experimental-sqlite --no-warnings server/index.js

REM give the server a moment to bind port 3000
timeout /t 3 >nul

echo Starting the Cloudflare https tunnel...
start "CurioKids tunnel" "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000 --no-autoupdate

echo.
echo ------------------------------------------------------------
echo  Two windows just opened: SERVER and TUNNEL.
echo.
echo  In the TUNNEL window, find the line with:
echo      https://SOMETHING.trycloudflare.com
echo.
echo  That is the app URL. NOTE: with the free quick tunnel it
echo  is a NEW address every time you run this script. If it
echo  changed from last time, the tablet app must be rebuilt to
echo  point at the new URL (ask your AIOS: "rebuild the Curio
echo  APK with this URL").
echo.
echo  Leave BOTH windows open while the kids use the app.
echo  Close them (or Ctrl+C) to stop.
echo ------------------------------------------------------------
echo.
pause
