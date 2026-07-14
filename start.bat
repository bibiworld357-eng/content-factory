@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================
echo   Content Factory - Starting Dev Server
echo ========================================
echo.

REM --- Check Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo Install Node.js 20.19+ ^(or 22.12+^) from https://nodejs.org and re-run this file.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo Node.js version: !NODE_VER!
echo.

REM --- Install dependencies on first run (or after a fresh download) ---
if not exist "node_modules" (
  echo Dependencies not found. Running "npm install" ^(first run, may take a few minutes^)...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] "npm install" failed. See the messages above.
    echo.
    pause
    exit /b 1
  )
  echo.
)

REM --- Open the browser shortly after the server starts ---
echo Opening http://localhost:5173 in your browser...
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:5173'"

echo Starting Vite dev server ^(press Ctrl+C to stop^)...
echo.
call npm run dev

echo.
echo [INFO] The dev server has stopped.
pause
