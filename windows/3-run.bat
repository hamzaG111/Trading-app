@echo off
cd /d "%~dp0.."
echo ============================================
echo   Running AURUM (web + engine) in MT5 mode
echo   Run the bridge first (2-bridge).
echo   Then open in your browser:  http://localhost:5173
echo   Go to the Connect page and click: Connect to MT5
echo ============================================
echo.
set BROKER=mt5
call npm run dev:all
pause
