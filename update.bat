@echo off
cd /d "%~dp0"
taskkill /F /IM node.exe >nul 2>&1

git checkout -- package-lock.json >nul 2>&1
git pull origin claude/loving-keller-wjksm4
call npm install --silent

start "SaTashkent Server"    cmd /k "node server.js     & echo. & echo === SERVER TO'XTADI === & pause"
start "SaTashkent AdminBot"  cmd /k "node admin-bot.js  & echo. & echo === ADMIN BOT TO'XTADI === & pause"
start "SaTashkent ClientBot" cmd /k "node client-bot.js & echo. & echo === CLIENT BOT TO'XTADI === & pause"
