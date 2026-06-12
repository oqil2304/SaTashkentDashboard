@echo off
cd /d "%~dp0"
taskkill /F /IM node.exe >nul 2>&1
start "SaTashkent Server" cmd /k "git checkout -- package-lock.json >nul 2>&1 && git pull origin claude/loving-keller-wjksm4 && npm install --silent && node server.js"
