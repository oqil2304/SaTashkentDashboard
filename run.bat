@echo off
REM ── Serverni ishga tushirish (update.bat shu faylni chaqiradi) ──
cd /d "%~dp0"

npm install --silent

echo.
echo ============================================
echo  Server ishga tushdi: http://localhost:8080
echo  To'xtatish uchun: Ctrl+C
echo  Brauzerda Ctrl+F5 bosing!
echo ============================================
echo.
node server.js

echo.
echo ============================================
echo  Server TO'XTADI yoki XATOLIK yuz berdi.
echo  Yuqoridagi xato matnini o'qing.
echo ============================================
pause
