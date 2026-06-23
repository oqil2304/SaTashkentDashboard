// ─── admin-bot.js — Admin Telegram boti (alohida jarayon) ────────────────────
// Ishlatish:  node admin-bot.js
// .env da ADMIN_BOT_TOKEN va ADMIN_CHAT_ID bo'lishi shart.
require('dotenv').config();
const { init } = require('./db');
const { startBot } = require('./bot');

init({ seed: false })
  .then(() => startBot('admin'))
  .catch(e => { console.error('[admin-bot] init xatosi:', e); process.exit(1); });
