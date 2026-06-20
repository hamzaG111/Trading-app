@echo off
cd /d "%~dp0.."
echo ============================================
echo   Bridge - MOCK mode (no MetaTrader needed)
echo   Simulated account - no real money, no risk.
echo   Keep this window open.
echo ============================================
echo.
set MT5_MOCK=1
python bridge\mt5_bridge.py
pause
