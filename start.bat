@echo off
echo ========================================
echo   Content Factory - Starting Dev Server
echo ========================================
echo.
echo Stopping any running Node/Vite processes...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM vite.exe 2>nul
timeout /t 1 /nobreak >nul
echo.
echo Starting Vite dev server...
echo.
start "" http://localhost:5173
npm run dev
