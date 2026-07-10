@echo off
REM Double-click to run CurioKids on this PC. Configure via the .env file
REM (copy .env.example to .env first). Requires Node.js 22.5 or newer.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org ^(version 22.5+^).
  pause
  exit /b 1
)

if not exist ".env" (
  echo No .env found - copying .env.example to .env. Open .env to add your AI key.
  copy ".env.example" ".env" >nul
)

echo Starting CurioKids...  Open http://localhost:3000 in your browser.
echo Press Ctrl+C to stop.
node --experimental-sqlite --no-warnings server\index.js
pause
