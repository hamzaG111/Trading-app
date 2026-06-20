@echo off
chcp 65001 >nul
title AURUM - 1) Install
cd /d "%~dp0.."
echo ============================================
echo   AURUM - تثبيت المتطلبات (مرة واحدة فقط)
echo ============================================
echo.
echo [1/2] تثبيت حزم تطبيق الويب (Node)...
call npm install
echo.
echo [2/2] تثبيت حزمة جسر MetaTrader 5 (Python)...
pip install -r bridge\requirements.txt
echo.
echo ============================================
echo   تم التثبيت. اغلق هذه النافذة.
echo ============================================
pause
