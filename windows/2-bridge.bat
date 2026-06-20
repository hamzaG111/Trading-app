@echo off
chcp 65001 >nul
title AURUM - 2) MT5 Bridge (real account)
cd /d "%~dp0.."
echo ============================================
echo   جسر MetaTrader 5 - الحساب الحقيقي
echo ------------------------------------------
echo   تأكد ان MetaTrader 5 مفتوح ومسجل دخوله،
echo   وان ملف bridge\.env معبأ ببياناتك.
echo   اترك هذه النافذة مفتوحة اثناء التداول.
echo ============================================
echo.
python bridge\mt5_bridge.py
pause
