@echo off
REM ── SaTashkent panelni fonda DOIMIY ishlaydigan qilish (PM2) ──
REM Bu faylni ADMINISTRATOR sifatida ishga tushiring (o'ng tugma > Run as administrator)

cd /d "%~dp0"

echo ============================================
echo  SaTashkent panel - PM2 sozlash boshlandi
echo ============================================

echo [1/6] PM2 va auto-start moduli o'rnatilmoqda...
call npm install -g pm2 pm2-windows-startup

echo [2/6] Eng yangi kod tortib olinmoqda...
call git pull origin claude/loving-keller-wjksm4

echo [3/6] Eski jarayon (agar bo'lsa) to'xtatilmoqda...
call pm2 delete satashkent 2>nul

echo [4/6] Server fonda ishga tushirilmoqda...
call pm2 start server.js --name satashkent

echo [5/6] Holat saqlanmoqda...
call pm2 save

echo [6/6] Kompyuter yonganda avtomatik ishga tushirish yoqilmoqda...
call pm2-startup install

echo.
echo ============================================
echo  TAYYOR! Panel manzili: http://localhost:8080
echo ============================================
echo  Holatni ko'rish:   pm2 status
echo  Qayta ishga tush.: pm2 restart satashkent
echo  To'xtatish:        pm2 stop satashkent
echo  Loglar:            pm2 logs satashkent
echo ============================================
pause
