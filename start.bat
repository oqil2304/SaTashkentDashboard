@echo off
REM ── Serverni ishga tushirish (eski jarayonni to'xtatib, yangi kod bilan) ──
cd /d "%~dp0"

echo Eski server (agar bor bo'lsa) to'xtatilmoqda...
taskkill /F /IM node.exe >nul 2>&1

echo Eng yangi kod tortib olinmoqda...
git pull origin claude/loving-keller-wjksm4

echo.
echo ============================================
echo  Server ishga tushdi: http://localhost:8080
echo  To'xtatish uchun: Ctrl+C
echo ============================================
echo.
node server.js
