// ─── bot.js — SaTashkent Telegram Bot ────────────────────────────────────────
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

const BOT_TOKEN      = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID  = String(process.env.ADMIN_CHAT_ID || '');
const FINANCE_API_URL = process.env.FINANCE_API_URL || '';
const FINANCE_API_KEY = process.env.FINANCE_API_KEY || '';

if (!BOT_TOKEN) {
  console.log('[bot] BOT_TOKEN yo\'q — bot ishlamaydi');
  module.exports = { startBot: () => {}, notifyLowStock: () => {} };
  return;
}

let bot;

// ── Sessiyalar (xotirada) ──────────────────────────────────────────────────
// Admin tasdiqlash sessiyasi: { message_id → { items:[], chat_id } }
const approvalSessions = new Map();
// Ta'minotchidan faktura kutish: { supplier_chat_id → { order_id, product_name, qty, unit } }
const pendingInvoices  = new Map();

// ── Yordamchi funksiyalar ─────────────────────────────────────────────────
function adminOnly(chatId) {
  return String(chatId) === ADMIN_CHAT_ID;
}

function qtyForOrder(product) {
  const TARGET_DAYS = 30;
  const raw = Math.max(0, TARGET_DAYS * (product.daily_usage || 0) - (product.current_stock || 0));
  const isWhole = /dona|quti|rulon|pachka|metr/i.test(product.unit || '');
  return isWhole ? Math.ceil(raw) : Math.ceil(raw * 10) / 10;
}

// ── Inline keyboard qurish ────────────────────────────────────────────────
function buildApprovalKeyboard(items) {
  const rows = items.map((item, i) => [{
    text: `${item.selected ? '✅' : '☐'} ${item.name} — +${item.qty} ${item.unit || ''}${item.supplier_name ? ` (${item.supplier_name})` : ' ⚠️ ta\'minotchi yo\'q'}`,
    callback_data: `tg_${i}`
  }]);
  const sel = items.filter(x => x.selected && x.supplier_id).length;
  const noSupplier = items.filter(x => x.selected && !x.supplier_id).length;
  let confirmText = sel > 0
    ? `✅ Tasdiqlash (${sel} ta tovar buyurtma beriladi)`
    : '— Tasdiqlash uchun tanlang —';
  if (noSupplier > 0) confirmText += ` ⚠️ ${noSupplier} ta ta'minotchisiz`;
  rows.push([{ text: confirmText, callback_data: 'tg_confirm' }]);
  rows.push([{ text: '❌ Bekor qilish', callback_data: 'tg_cancel' }]);
  return { inline_keyboard: rows };
}

function buildApprovalText(items) {
  const lines = items.map((item, i) => {
    const icon = item.days_left <= 0 ? '🚨' : item.days_left <= 2 ? '⚠️' : '📦';
    const status = item.days_left <= 0 ? 'TUGAGAN' : `${Number(item.days_left).toFixed(1)} kun qoldi`;
    const sup = item.supplier_name ? `👤 ${item.supplier_name}` : '❌ Ta\'minotchi biriktirilmagan';
    return `${icon} <b>${item.name}</b> — ${status}\n   Taklif: +${item.qty} ${item.unit || ''} | ${sup}`;
  });
  return `📋 <b>Omborda kam / tugagan tovarlar</b>\n\n${lines.join('\n\n')}\n\n✅ Keraklilarini tanlang va tasdiqlang:`;
}

// ── Kam tovarlarni tekshirish ─────────────────────────────────────────────
async function getLowStockProducts() {
  const rows = await db.all2(`
    SELECT p.*, s.name as supplier_name, s.id as supplier_id,
           s.telegram_chat_id as supplier_chat_id
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.daily_usage > 0
      AND (p.current_stock / p.daily_usage) <= 7
    ORDER BY (p.current_stock / p.daily_usage) ASC
  `);
  // Allaqachon aktiv buyurtma bor bo'lgan tovarlarni chiqarib tashlash
  const active = await db.all2(
    "SELECT product_id FROM supply_orders WHERE status NOT IN ('delivered','cancelled')"
  );
  const activeIds = new Set(active.map(r => r.product_id));
  return rows.filter(p => !activeIds.has(p.id));
}

// ── Adminga buyurtma tasdiq xabarini yuborish ────────────────────────────
async function notifyLowStock(forceCheck = false) {
  if (!bot || !ADMIN_CHAT_ID) return;
  const prods = await getLowStockProducts();
  if (!prods.length) {
    if (forceCheck) await bot.sendMessage(ADMIN_CHAT_ID, '✅ Barcha tovarlar yetarli! Buyurtma kerak emas.');
    return;
  }
  const items = prods.map(p => ({
    product_id:   p.id,
    name:         p.name,
    unit:         p.unit || '',
    qty:          qtyForOrder(p),
    days_left:    p.daily_usage > 0 ? p.current_stock / p.daily_usage : Infinity,
    supplier_id:  p.supplier_id || null,
    supplier_name: p.supplier_name || null,
    supplier_chat_id: p.supplier_chat_id || null,
    selected:     false
  }));

  const msg = await bot.sendMessage(ADMIN_CHAT_ID, buildApprovalText(items), {
    parse_mode: 'HTML',
    reply_markup: buildApprovalKeyboard(items)
  });
  approvalSessions.set(msg.message_id, { items, chat_id: ADMIN_CHAT_ID });
  console.log(`[bot] Admin ga ${prods.length} ta tovar ro'yxati yuborildi`);
}

// ── Ta'minotchiga xabar yuborish ─────────────────────────────────────────
async function sendToSupplier(order) {
  if (!order.supplier_chat_id) return false;
  const text = `🏪 <b>SaTashkent Ta'minot Bo'limidan zakaz</b>\n\n` +
    `Salom, <b>${order.supplier_name}</b>!\n\n` +
    `Bizda <b>${order.product_name}</b> tugab bormoqda.\n` +
    `Zakaz miqdori: <b>${order.qty} ${order.unit}</b>\n\n` +
    `Schet-faktura yuboring — imkon qadar tezroq.\n` +
    `Rahmat! 🙏`;
  try {
    await bot.sendMessage(order.supplier_chat_id, text, { parse_mode: 'HTML' });
    pendingInvoices.set(String(order.supplier_chat_id), {
      order_id: order.id,
      product_name: order.product_name,
      qty: order.qty,
      unit: order.unit
    });
    await db.run2(
      "UPDATE supply_orders SET status='awaiting_invoice', updated_at=datetime('now') WHERE id=?",
      [order.id]
    );
    return true;
  } catch (e) {
    console.error('[bot] Ta\'minotchiga xabar yuborib bo\'lmadi:', e.message);
    return false;
  }
}

// ── Finance saytga faktura yuborish ──────────────────────────────────────
async function forwardToFinance(orderId, fileId, mimeType) {
  if (!FINANCE_API_URL || FINANCE_API_URL.includes('YOUR_')) return false;
  try {
    const fileLink = await bot.getFileLink(fileId);
    const res = await fetch(FINANCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FINANCE_API_KEY}`
      },
      body: JSON.stringify({ order_id: orderId, invoice_url: fileLink, mime_type: mimeType })
    });
    return res.ok;
  } catch (e) {
    console.error('[bot] Finance API xatosi:', e.message);
    return false;
  }
}

// ── Buyurtma bajarildi: omborga qo'shish ─────────────────────────────────
async function completeOrder(orderId) {
  const order = await db.get2('SELECT * FROM supply_orders WHERE id=?', [orderId]);
  if (!order) return;
  // Omborga qo'shish (xarid sifatida kiritish — FIFO uchun)
  await db.run2(
    `INSERT INTO purchases (product_id, quantity, unit_price, purchase_date, supplier, note, remaining_qty, created_at)
     VALUES (?, ?, ?, date('now'), ?, 'Telegram bot orqali zakaz', ?, datetime('now'))`,
    [order.product_id, order.qty, order.unit_price || 0, order.supplier_name || '', order.qty]
  );
  // Stokni yangilash
  await db.run2('UPDATE products SET current_stock = current_stock + ? WHERE id=?', [order.qty, order.product_id]);
  // Orderga yakuniy status
  await db.run2("UPDATE supply_orders SET status='delivered', updated_at=datetime('now') WHERE id=?", [orderId]);
  await db.saveDb();
  // Adminga xabar
  if (ADMIN_CHAT_ID) {
    await bot.sendMessage(ADMIN_CHAT_ID,
      `✅ <b>${order.product_name}</b> — ${order.qty} ${order.unit} omborga kiritildi!\nZakaz yakunlandi.`,
      { parse_mode: 'HTML' }
    );
  }
  console.log(`[bot] Zakaz #${orderId} yakunlandi — ombor yangilandi`);
}

// ── Bot eventlarini ulash ────────────────────────────────────────────────
function attachHandlers() {

  // /start — ta'minotchi o'zini ro'yxatdan o'tkazadi
  bot.onText(/\/start supplier_(\d+)/, async (msg, match) => {
    const supplierId = parseInt(match[1]);
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'Ta\'minotchi';
    await db.run2('UPDATE suppliers SET telegram_chat_id=? WHERE id=?', [String(chatId), supplierId]);
    await db.saveDb();
    await bot.sendMessage(chatId,
      `✅ Siz SaTashkent ta'minot tizimiga ta'minotchi sifatida ulangansiz!\n\nZakaz kelganda shu botdan xabar olasiz. Rahmat, ${name}!`
    );
  });

  // /start — admin buyurtma tekshiruvi
  bot.onText(/^\/start$/, async (msg) => {
    if (!adminOnly(msg.chat.id)) return;
    await bot.sendMessage(msg.chat.id,
      `👋 <b>SaTashkent Ta'minot Bot</b>\n\nKomandalar:\n/check — Ombor holatini tekshirish\n/orders — Aktiv buyurtmalar`,
      { parse_mode: 'HTML' }
    );
  });

  bot.onText(/\/check/, async (msg) => {
    if (!adminOnly(msg.chat.id)) return;
    await bot.sendMessage(msg.chat.id, '🔍 Ombor tekshirilmoqda...');
    await notifyLowStock(true);
  });

  bot.onText(/\/orders/, async (msg) => {
    if (!adminOnly(msg.chat.id)) return;
    const orders = await db.all2(
      "SELECT * FROM supply_orders WHERE status NOT IN ('delivered','cancelled') ORDER BY created_at DESC LIMIT 20"
    );
    if (!orders.length) { await bot.sendMessage(msg.chat.id, '✅ Aktiv buyurtma yo\'q.'); return; }
    const text = orders.map(o =>
      `• <b>${o.product_name}</b> — ${o.qty} ${o.unit}\n  📌 ${o.status} | ${o.supplier_name || '—'}`
    ).join('\n\n');
    await bot.sendMessage(msg.chat.id, `📋 <b>Aktiv buyurtmalar:</b>\n\n${text}`, { parse_mode: 'HTML' });
  });

  // Inline keyboard callback (toggle, confirm, cancel)
  bot.on('callback_query', async (query) => {
    const msgId = query.message.message_id;
    const data  = query.data;

    const session = approvalSessions.get(msgId);
    if (!session) {
      await bot.answerCallbackQuery(query.id, { text: 'Bu sessiya eskirgan.' });
      return;
    }
    const { items } = session;

    if (data.startsWith('tg_') && data !== 'tg_confirm' && data !== 'tg_cancel') {
      const idx = parseInt(data.replace('tg_', ''));
      if (!isNaN(idx) && items[idx]) {
        items[idx].selected = !items[idx].selected;
        await bot.editMessageText(buildApprovalText(items), {
          chat_id: query.message.chat.id,
          message_id: msgId,
          parse_mode: 'HTML',
          reply_markup: buildApprovalKeyboard(items)
        });
        await bot.answerCallbackQuery(query.id);
      }
      return;
    }

    if (data === 'tg_cancel') {
      approvalSessions.delete(msgId);
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id, message_id: msgId
      });
      await bot.answerCallbackQuery(query.id, { text: 'Bekor qilindi.' });
      await bot.sendMessage(query.message.chat.id, '❌ Buyurtma bekor qilindi.');
      return;
    }

    if (data === 'tg_confirm') {
      const selected = items.filter(x => x.selected);
      if (!selected.length) {
        await bot.answerCallbackQuery(query.id, { text: 'Hech narsa tanlanmagan!', show_alert: true });
        return;
      }
      approvalSessions.delete(msgId);
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id, message_id: msgId
      });
      await bot.answerCallbackQuery(query.id, { text: '✅ Tasdiqlandi! Buyurtmalar yuborilmoqda...' });

      let sentCount = 0;
      for (const item of selected) {
        // supply_orders ga yozish
        const r = await db.run2(
          `INSERT INTO supply_orders (product_id, product_name, qty, unit, supplier_id, supplier_name, supplier_chat_id, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          [item.product_id, item.name, item.qty, item.unit,
           item.supplier_id, item.supplier_name, item.supplier_chat_id, 'approved']
        );
        await db.saveDb();

        if (item.supplier_id && item.supplier_chat_id) {
          const sent = await sendToSupplier({ ...item, id: r.lastID });
          if (sent) sentCount++;
        } else {
          await bot.sendMessage(query.message.chat.id,
            `⚠️ <b>${item.name}</b> uchun ta'minotchi biriktirilmagan. Dashboard orqali qo'shing.`,
            { parse_mode: 'HTML' }
          );
        }
      }

      await bot.sendMessage(query.message.chat.id,
        `✅ ${selected.length} ta tovar tasdiqlandi.\n📨 ${sentCount} ta ta'minotchiga xabar yuborildi.`
      );
      return;
    }
  });

  // Xabarlar — ta'minotchidan faktura qabul qilish
  bot.on('message', async (msg) => {
    if (!msg.document && !msg.photo && !msg.text) return;
    const chatId = String(msg.chat.id);
    if (chatId === ADMIN_CHAT_ID) return; // admin xabarlarini bu yerda ishlamaymiz

    const pending = pendingInvoices.get(chatId);
    if (!pending) return;

    let fileId = null, mimeType = 'image/jpeg';
    if (msg.document) { fileId = msg.document.file_id; mimeType = msg.document.mime_type || 'application/pdf'; }
    else if (msg.photo) { fileId = msg.photo[msg.photo.length - 1].file_id; mimeType = 'image/jpeg'; }
    else if (msg.text) {
      // Matnli xabar — faktura sifatida qayd qilamiz
      fileId = 'text:' + msg.text;
      mimeType = 'text/plain';
    }

    if (!fileId) return;

    // Orderni yangilash
    await db.run2(
      "UPDATE supply_orders SET invoice_file_id=?, status='invoice_received', updated_at=datetime('now') WHERE id=?",
      [fileId, pending.order_id]
    );
    await db.saveDb();
    pendingInvoices.delete(chatId);

    await bot.sendMessage(chatId, '✅ Schet-faktura qabul qilindi! Tez orada to\'lov amalga oshiriladi.');

    // Adminga fakturani forward qilish
    if (ADMIN_CHAT_ID) {
      await bot.sendMessage(ADMIN_CHAT_ID,
        `📄 <b>${pending.product_name}</b> uchun schet-faktura keldi!\nTa'minotchi: ${msg.from.first_name || chatId}\nMiqdor: ${pending.qty} ${pending.unit}`,
        { parse_mode: 'HTML' }
      );
      if (msg.document) await bot.forwardMessage(ADMIN_CHAT_ID, msg.chat.id, msg.message_id);
      else if (msg.photo) await bot.forwardMessage(ADMIN_CHAT_ID, msg.chat.id, msg.message_id);

      // Adminga tasdiqlash tugmalari
      await bot.sendMessage(ADMIN_CHAT_ID,
        `To'lov tasdiqlash:`,
        { reply_markup: { inline_keyboard: [[
          { text: "✅ To'lov qilindi — omborga kiritish", callback_data: `pay_${pending.order_id}` },
          { text: "❌ Rad etish", callback_data: `reject_${pending.order_id}` }
        ]] }}
      );
    }

    // Finance API ga yuborish (agar sozlangan bo'lsa)
    if (FINANCE_API_URL && !FINANCE_API_URL.includes('YOUR_')) {
      const ok = await forwardToFinance(pending.order_id, fileId, mimeType);
      if (ok) await bot.sendMessage(ADMIN_CHAT_ID || chatId, '📤 Faktura finance saytga yuborildi.');
    }
  });

  // Admin: to'lov tasdiqlash inline keyboard
  bot.on('callback_query', async (query) => {
    const data = query.data;
    if (data.startsWith('pay_')) {
      const orderId = parseInt(data.replace('pay_', ''));
      await bot.answerCallbackQuery(query.id, { text: '✅ Tasdiqlandi! Ombor yangilanmoqda...' });
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id, message_id: query.message.message_id
      });
      await completeOrder(orderId);
    }
    if (data.startsWith('reject_')) {
      const orderId = parseInt(data.replace('reject_', ''));
      await db.run2("UPDATE supply_orders SET status='cancelled', updated_at=datetime('now') WHERE id=?", [orderId]);
      await db.saveDb();
      await bot.answerCallbackQuery(query.id, { text: '❌ Rad etildi' });
      await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: query.message.chat.id, message_id: query.message.message_id
      });
      await bot.sendMessage(query.message.chat.id, '❌ Buyurtma rad etildi.');
    }
  });

  bot.on('polling_error', (err) => console.error('[bot] polling xatosi:', err.message));
  console.log('[bot] ✅ SaTashkent Bot ishga tushdi');
}

// ── Bot ishga tushirish ──────────────────────────────────────────────────
function startBot() {
  if (!BOT_TOKEN) return;
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  attachHandlers();
}

module.exports = { startBot, notifyLowStock };
