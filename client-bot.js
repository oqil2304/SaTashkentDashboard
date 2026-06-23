// ─── client-bot.js — Ta'minotchilar uchun Telegram boti (alohida jarayon) ────
// Ishlatish:  node client-bot.js
// .env da BOT_TOKEN bo'lishi shart.
require('dotenv').config();
const { init } = require('./db');
const { startBot } = require('./bot');

init({ seed: false })
  .then(() => startBot('client'))
  .catch(e => { console.error('[client-bot] init xatosi:', e); process.exit(1); });
