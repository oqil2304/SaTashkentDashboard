@echo off
REM ── Yangi kodni tortib, serverni qaytadan toza ishga tushirish ──
cd /d "%~dp0"

echo Eski server to'xtatilmoqda...
taskkill /F /IM node.exe >nul 2>&1

echo Eng yangi kod tortib olinmoqda...
git pull origin claude/loving-keller-wjksm4

echo.
echo ============================================
echo  Server ishga tushdi: http://localhost:8080
echo  To'xtatish uchun: Ctrl+C
echo  Brauzerda Ctrl+F5 bosing!
echo ============================================
echo.
node server.js
