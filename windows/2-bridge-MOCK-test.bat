@echo off
chcp 65001 >nul
title AURUM - Bridge (MOCK - no MT5 needed)
cd /d "%~dp0.."
echo ============================================
echo   جسر بوضع المحاكاة (للتجربة بلا MetaTrader)
echo   حساب وهمي - بلا مال حقيقي ولا مخاطرة.
echo   اترك هذه النافذة مفتوحة.
echo ============================================
echo.
set MT5_MOCK=1
python bridge\mt5_bridge.py
pause
