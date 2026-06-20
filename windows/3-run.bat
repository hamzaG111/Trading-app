@echo off
chcp 65001 >nul
title AURUM - 3) Run app (web + engine, MT5 mode)
cd /d "%~dp0.."
echo ============================================
echo   تشغيل AURUM (الويب + المحرّك) بوضع MT5
echo ------------------------------------------
echo   شغّل الجسر اولا (2-bridge.bat).
echo   ثم افتح المتصفح على:  http://localhost:5173
echo   ومن صفحة (الربط) اضغط: اتصل بحساب MT5
echo ============================================
echo.
set BROKER=mt5
call npm run dev:all
pause
