@echo off
cd /d "%~dp0"

echo Eski server to'xtatilmoqda...
taskkill /F /IM node.exe >nul 2>&1

echo Eng yangi kod tortib olinmoqda...
git checkout -- package-lock.json >nul 2>&1
git pull origin claude/loving-keller-wjksm4

echo npm install...
npm install --silent

echo Server yangi oynada ishga tushirilmoqda...
start "SaTashkent Server" cmd /k "cd /d "%~dp0" && node server.js"
