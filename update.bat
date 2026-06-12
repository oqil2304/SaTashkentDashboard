@echo off
REM ── Yangi kodni tortib olib, fonda ishlayotgan serverni yangilash ──
cd /d "%~dp0"

echo Eng yangi kod tortib olinmoqda...
call git pull origin claude/loving-keller-wjksm4

echo Server qayta ishga tushirilmoqda...
call pm2 restart satashkent

echo.
echo TAYYOR! Brauzerda Ctrl+F5 bosing: http://localhost:8080
pause
