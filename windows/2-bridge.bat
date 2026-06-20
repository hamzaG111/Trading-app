@echo off
cd /d "%~dp0.."
echo ============================================
echo   MetaTrader 5 Bridge - REAL account
echo   Make sure MetaTrader 5 is open and logged in,
echo   and bridge\.env is filled with your details.
echo   Keep this window open while trading.
echo ============================================
echo.
python bridge\mt5_bridge.py
pause
