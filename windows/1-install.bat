@echo off
cd /d "%~dp0.."
echo ============================================
echo   AURUM - Installing requirements (one time)
echo ============================================
echo.
echo [1/2] Installing web app packages (Node)...
call npm install
echo.
echo [2/2] Installing MetaTrader 5 bridge (Python)...
pip install -r bridge\requirements.txt
echo.
echo ============================================
echo   Done. You can close this window.
echo ============================================
pause
