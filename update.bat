@echo off
REM ── Yangi kodni tortib, serverni qaytadan ishga tushirish ──
REM DIQQAT: bu fayl boshqa o'zgartirilmaydi (o'zini-o'zi yangilash muammosini oldini olish uchun)
cd /d "%~dp0"

echo Eski server to'xtatilmoqda...
taskkill /F /IM node.exe >nul 2>&1

echo Eng yangi kod tortib olinmoqda...
git checkout -- package-lock.json >nul 2>&1
git pull origin claude/loving-keller-wjksm4

REM Serverni alohida (yangilangan) skript orqali ishga tushiramiz
call run.bat
