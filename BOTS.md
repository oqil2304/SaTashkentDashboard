# Telegram botlar — bitta yoki ikki bot rejimi

Tizim ikki xil rejimda ishlaydi. Rejim `.env` dagi `ADMIN_BOT_TOKEN` borligiga qarab avtomatik tanlanadi.

## 1. Bitta bot rejimi (oddiy, default)

`.env` da faqat `BOT_TOKEN` bo'lsa — admin ham, ta'minotchilar ham SHU bitta bot bilan ishlaydi.
Bot server jarayoni ichida ishga tushadi.

```bash
npm start        # server + bot (hammasi bitta jarayonda)
```

## 2. Ikki bot rejimi (admin va client alohida)

Maqsad: xavfsizlik yoki nosozlikni tuzatish paytida bir botni to'xtatib tuzatsangiz,
ikkinchisi ishlayveradi. Botlar bitta umumiy bazaga (SQLite WAL) ulanadi va o'zaro
`bot_outbox` jadvali orqali xabar/fayl uzatadi.

### Tayyorgarlik
1. @BotFather'da **ikkinchi** bot yarating (admin uchun).
2. `.env` ga ikkala tokenni yozing:
   ```
   BOT_TOKEN=<ta'minotchi (client) bot tokeni>
   ADMIN_BOT_TOKEN=<admin bot tokeni>
   ADMIN_CHAT_ID=<admin telegram chat id>
   ```
3. Admin Telegram'da **admin botni** /start qiling.
   Ta'minotchilar esa **client botga** ulanadi (dashboarddagi ulanish havolasi
   avtomatik client bot manziliga ishora qiladi).

### Ishga tushirish (3 ta alohida jarayon)
Avval serverni ishga tushiring (baza migratsiyasi va seed shu yerda bajariladi):

```bash
npm start          # 1) web server (bot YO'Q — ADMIN_BOT_TOKEN bor)
npm run admin-bot  # 2) admin bot
npm run client-bot # 3) client (ta'minotchi) bot
```

Har birini alohida terminalda yoki process-manager (pm2/systemd) bilan ishlating.
Endi `npm run admin-bot` ni to'xtatib qayta ishga tushirsangiz — client bot va server
ishlashda davom etadi (va aksincha).

> Eslatma: baza `node:sqlite` (WAL rejimi) — bir nechta jarayon bitta `data/dashboard.db`
> fayliga xavfsiz yozadi. PostgreSQL kabi alohida server kerak emas.
