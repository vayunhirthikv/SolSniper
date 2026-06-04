@echo off
title SolSniper Launcher
echo ===================================================
echo   Solana Memecoin Sniper Simulator Launcher
echo ===================================================
echo.

:: Start Backend Server
echo [1/2] Starting Backend Server...
start "SolSniper Backend" cmd /k "cd /d %~dp0server && node index.js"

:: Start Frontend Dev Server
echo [2/2] Starting Frontend Dev Server...
start "SolSniper Frontend" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo ===================================================
echo   Launch initiated!
echo   - Backend: http://localhost:3001
echo   - Frontend: http://localhost:5173
echo.
echo   You can close this main launcher window.
echo   Do NOT close the two new windows that popped up.
echo ===================================================
timeout /t 5
