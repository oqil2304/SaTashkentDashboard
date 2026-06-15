// ─── bot.js — SaTashkent Telegram Bot (native fetch, tashqi kutubxonasiz) ────
require('dotenv').config();
const { db, saveDb } = require('./db');

const BOT_TOKEN       = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID   = String(process.env.ADMIN_CHAT_ID || '');
const FINANCE_API_URL = process.env.FINANCE_API_URL || '';
const FINANCE_API_KEY = process.env.FINANCE_API_KEY || '';
const API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

// ── Telegram API chaqiruvi ─────────────────────────────────────────────────
async function tg(method, params = {}) {
  if (!API) return null;
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const data = await res.json();
    if (!data.ok) console.error(`[bot] ${method} xato:`, data.description);
    return data.ok ? data.result : null;
  } catch (e) {
    console.error(`[bot] ${method} tarmoq xatosi:`, e.message);
    return null;
  }
}

function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}
function editMessageText(chatId, messageId, text, extra = {}) {
  return tg('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', ...extra });
}
function editMessageReplyMarkup(chatId, messageId, reply_markup) {
  return tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup });
}
function answerCallbackQuery(id, extra = {}) {
  return tg('answerCallbackQuery', { callback_query_id: id, ...extra });
}
function forwardMessage(toChat, fromChat, messageId) {
  return tg('forwardMessage', { chat_id: toChat, from_chat_id: fromChat, message_id: messageId });
}
async function getFileLink(fileId) {
  const f = await tg('getFile', { file_id: fileId });
  return f ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${f.file_path}` : null;
}

// ── Sessiyalar (xotirada) ──────────────────────────────────────────────────
const approvalSessions = new Map();  // message_id → { items, chat_id }
const pendingInvoices  = new Map();  // supplier_chat_id → { order_id, ... }

const adminOnly = (chatId) => String(chatId) === ADMIN_CHAT_ID;

function qtyForOrder(p) {
  const TARGET_DAYS = 30;
  const raw = Math.max(0, TARGET_DAYS * (p.daily_usage || 0) - (p.current_stock || 0));
  const isWhole = /dona|quti|rulon|pachka|metr/i.test(p.unit || '');
  return isWhole ? Math.ceil(raw) : Math.ceil(raw * 10) / 10;
}

// ── Inline keyboard ────────────────────────────────────────────────────────
function buildApprovalKeyboard(items) {
  const rows = items.map((it, i) => [{
    text: `${it.selected ? '✅' : '☐'} ${it.name} — +${it.qty} ${it.unit || ''}${it.supplier_name ? ` (${it.supplier_name})` : " ⚠️ ta'minotchi yo'q"}`,
    callback_data: `tg_${i}`
  }]);
  const sel = items.filter(x => x.selected && x.supplier_id).length;
  const noSup = items.filter(x => x.selected && !x.supplier_id).length;
  let t = sel > 0 ? `✅ Tasdiqlash (${sel} ta)` : '— Tanlang —';
  if (noSup > 0) t += ` ⚠️ ${noSup} ta ta'minotchisiz`;
  rows.push([{ text: t, callback_data: 'tg_confirm' }]);
  rows.push([{ text: '❌ Bekor qilish', callback_data: 'tg_cancel' }]);
  return { inline_keyboard: rows };
}

function buildApprovalText(items) {
  const lines = items.map(it => {
    const icon = it.days_left <= 0 ? '🚨' : it.days_left <= 2 ? '⚠️' : '📦';
    const status = it.days_left <= 0 ? 'TUGAGAN' : `${Number(it.days_left).toFixed(1)} kun qoldi`;
    const sup = it.supplier_name ? `👤 ${it.supplier_name}` : "❌ Ta'minotchi biriktirilmagan";
    return `${icon} <b>${it.name}</b> — ${status}\n   Taklif: +${it.qty} ${it.unit || ''} | ${sup}`;
  });
  return `📋 <b>Omborda kam / tugagan tovarlar</b>\n\n${lines.join('\n\n')}\n\n✅ Keraklilarini tanlang va tasdiqlang:`;
}

// ── Kam tovarlar ────────────────────────────────────────────────────────────
async function getLowStockProducts() {
  const rows = await db.all2(`
    SELECT p.*, s.name AS supplier_name, s.id AS supplier_id,
           s.telegram_chat_id AS supplier_chat_id
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.daily_usage > 0 AND (p.current_stock / p.daily_usage) <= 7
    ORDER BY (p.current_stock / p.daily_usage) ASC`);
  const active = await db.all2(
    "SELECT product_id FROM supply_orders WHERE status NOT IN ('delivered','cancelled')");
  const activeIds = new Set(active.map(r => r.product_id));
  return rows.filter(p => !activeIds.has(p.id));
}

async function notifyLowStock(forceCheck = false) {
  if (!API || !ADMIN_CHAT_ID) return;
  const prods = await getLowStockProducts();
  if (!prods.length) {
    if (forceCheck) await sendMessage(ADMIN_CHAT_ID, '✅ Barcha tovarlar yetarli! Buyurtma kerak emas.');
    return;
  }
  const items = prods.map(p => ({
    product_id: p.id, name: p.name, unit: p.unit || '', qty: qtyForOrder(p),
    days_left: p.daily_usage > 0 ? p.current_stock / p.daily_usage : Infinity,
    supplier_id: p.supplier_id || null, supplier_name: p.supplier_name || null,
    supplier_chat_id: p.supplier_chat_id || null, selected: false
  }));
  const msg = await sendMessage(ADMIN_CHAT_ID, buildApprovalText(items), { reply_markup: buildApprovalKeyboard(items) });
  if (msg) approvalSessions.set(msg.message_id, { items, chat_id: ADMIN_CHAT_ID });
  console.log(`[bot] Admin ga ${prods.length} ta tovar ro'yxati yuborildi`);
}

// ── Ta'minotchiga xabar ─────────────────────────────────────────────────────
async function sendToSupplier(order) {
  if (!order.supplier_chat_id) return false;
  const text = `🏪 <b>SaTashkent Ta'minot Bo'limidan zakaz</b>\n\n` +
    `Salom, <b>${order.supplier_name}</b>!\n\n` +
    `Bizda <b>${order.product_name}</b> tugab bormoqda.\n` +
    `Zakaz miqdori: <b>${order.qty} ${order.unit}</b>\n\n` +
    `Schet-faktura yuboring — imkon qadar tezroq.\nRahmat! 🙏`;
  const sent = await sendMessage(order.supplier_chat_id, text);
  if (!sent) return false;
  pendingInvoices.set(String(order.supplier_chat_id), {
    order_id: order.id, product_name: order.product_name, qty: order.qty, unit: order.unit
  });
  await db.run2("UPDATE supply_orders SET status='awaiting_invoice', updated_at=datetime('now') WHERE id=?", [order.id]);
  saveDb();
  return true;
}

// ── Finance saytga faktura ──────────────────────────────────────────────────
async function forwardToFinance(orderId, fileId, mimeType) {
  if (!FINANCE_API_URL || FINANCE_API_URL.includes('YOUR_')) return false;
  try {
    const fileLink = fileId.startsWith('text:') ? null : await getFileLink(fileId);
    const res = await fetch(FINANCE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${FINANCE_API_KEY}` },
      body: JSON.stringify({ order_id: orderId, invoice_url: fileLink, mime_type: mimeType })
    });
    return res.ok;
  } catch (e) { console.error('[bot] Finance API xatosi:', e.message); return false; }
}

// ── Buyurtmani yakunlash — omborga qo'shish ────────────────────────────────
async function completeOrder(orderId) {
  const order = await db.get2('SELECT * FROM supply_orders WHERE id=?', [orderId]);
  if (!order) return;
  await db.run2(
    `INSERT INTO purchases (product_id, quantity, unit_price, purchase_date, supplier, note, remaining_qty, created_at)
     VALUES (?, ?, ?, date('now'), ?, 'Telegram bot orqali zakaz', ?, datetime('now'))`,
    [order.product_id, order.qty, order.unit_price || 0, order.supplier_name || '', order.qty]);
  await db.run2('UPDATE products SET current_stock = current_stock + ? WHERE id=?', [order.qty, order.product_id]);
  await db.run2("UPDATE supply_orders SET status='delivered', updated_at=datetime('now') WHERE id=?", [orderId]);
  saveDb();
  if (ADMIN_CHAT_ID)
    await sendMessage(ADMIN_CHAT_ID, `✅ <b>${order.product_name}</b> — ${order.qty} ${order.unit} omborga kiritildi!\nZakaz yakunlandi.`);
  console.log(`[bot] Zakaz #${orderId} yakunlandi — ombor yangilandi`);
}

// ── Update handlerlar ───────────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text || '';

  // /start supplier_N — ta'minotchi ulanishi
  let m = text.match(/^\/start supplier_(\d+)/);
  if (m) {
    const sid = parseInt(m[1]);
    await db.run2('UPDATE suppliers SET telegram_chat_id=? WHERE id=?', [chatId, sid]);
    saveDb();
    await sendMessage(chatId, `✅ Siz SaTashkent ta'minot tizimiga ta'minotchi sifatida ulandingiz!\n\nZakaz kelganda shu botdan xabar olasiz. Rahmat, ${msg.from.first_name || ''}!`);
    return;
  }

  // /start (admin)
  if (/^\/start$/.test(text)) {
    if (adminOnly(chatId))
      await sendMessage(chatId, `👋 <b>SaTashkent Ta'minot Bot</b>\n\nKomandalar:\n/check — Ombor holatini tekshirish\n/orders — Aktiv buyurtmalar`);
    else
      await sendMessage(chatId, `👋 Salom! Bu SaTashkent ta'minot boti. Ulanish uchun admindan maxsus havola so'rang.`);
    return;
  }

  if (/^\/check/.test(text) && adminOnly(chatId)) {
    await sendMessage(chatId, '🔍 Ombor tekshirilmoqda...');
    await notifyLowStock(true);
    return;
  }

  if (/^\/orders/.test(text) && adminOnly(chatId)) {
    const orders = await db.all2("SELECT * FROM supply_orders WHERE status NOT IN ('delivered','cancelled') ORDER BY created_at DESC LIMIT 20");
    if (!orders.length) { await sendMessage(chatId, "✅ Aktiv buyurtma yo'q."); return; }
    const t = orders.map(o => `• <b>${o.product_name}</b> — ${o.qty} ${o.unit}\n  📌 ${o.status} | ${o.supplier_name || '—'}`).join('\n\n');
    await sendMessage(chatId, `📋 <b>Aktiv buyurtmalar:</b>\n\n${t}`);
    return;
  }

  // Ta'minotchidan faktura (admin emas + kutilayotgan zakaz bor)
  if (adminOnly(chatId)) return;
  const pending = pendingInvoices.get(chatId);
  if (!pending) return;

  let fileId = null, mimeType = 'image/jpeg';
  if (msg.document) { fileId = msg.document.file_id; mimeType = msg.document.mime_type || 'application/pdf'; }
  else if (msg.photo) { fileId = msg.photo[msg.photo.length - 1].file_id; mimeType = 'image/jpeg'; }
  else if (text) { fileId = 'text:' + text; mimeType = 'text/plain'; }
  if (!fileId) return;

  await db.run2("UPDATE supply_orders SET invoice_file_id=?, status='invoice_received', updated_at=datetime('now') WHERE id=?", [fileId, pending.order_id]);
  saveDb();
  pendingInvoices.delete(chatId);
  await sendMessage(chatId, "✅ Schet-faktura qabul qilindi! Tez orada to'lov amalga oshiriladi.");

  if (ADMIN_CHAT_ID) {
    await sendMessage(ADMIN_CHAT_ID, `📄 <b>${pending.product_name}</b> uchun schet-faktura keldi!\nTa'minotchi: ${msg.from.first_name || chatId}\nMiqdor: ${pending.qty} ${pending.unit}`);
    if (msg.document || msg.photo) await forwardMessage(ADMIN_CHAT_ID, msg.chat.id, msg.message_id);
    await sendMessage(ADMIN_CHAT_ID, `To'lov tasdiqlash:`, {
      reply_markup: { inline_keyboard: [[
        { text: "✅ To'lov qilindi — omborga kiritish", callback_data: `pay_${pending.order_id}` },
        { text: '❌ Rad etish', callback_data: `reject_${pending.order_id}` }
      ]] }
    });
  }
  if (FINANCE_API_URL && !FINANCE_API_URL.includes('YOUR_')) {
    const ok = await forwardToFinance(pending.order_id, fileId, mimeType);
    if (ok && ADMIN_CHAT_ID) await sendMessage(ADMIN_CHAT_ID, '📤 Faktura finance saytga yuborildi.');
  }
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const data   = query.data || '';

  // To'lov tasdiqlash / rad etish
  if (data.startsWith('pay_')) {
    const orderId = parseInt(data.replace('pay_', ''));
    await answerCallbackQuery(query.id, { text: '✅ Ombor yangilanmoqda...' });
    await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
    await completeOrder(orderId);
    return;
  }
  if (data.startsWith('reject_')) {
    const orderId = parseInt(data.replace('reject_', ''));
    await db.run2("UPDATE supply_orders SET status='cancelled', updated_at=datetime('now') WHERE id=?", [orderId]);
    saveDb();
    await answerCallbackQuery(query.id, { text: '❌ Rad etildi' });
    await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
    await sendMessage(chatId, '❌ Buyurtma rad etildi.');
    return;
  }

  // Tasdiqlash sessiyasi
  const session = approvalSessions.get(msgId);
  if (!session) { await answerCallbackQuery(query.id, { text: 'Bu sessiya eskirgan.' }); return; }
  const { items } = session;

  if (data === 'tg_cancel') {
    approvalSessions.delete(msgId);
    await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
    await answerCallbackQuery(query.id, { text: 'Bekor qilindi.' });
    await sendMessage(chatId, '❌ Buyurtma bekor qilindi.');
    return;
  }

  if (data === 'tg_confirm') {
    const selected = items.filter(x => x.selected);
    if (!selected.length) { await answerCallbackQuery(query.id, { text: 'Hech narsa tanlanmagan!', show_alert: true }); return; }
    approvalSessions.delete(msgId);
    await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
    await answerCallbackQuery(query.id, { text: '✅ Yuborilmoqda...' });

    let sentCount = 0;
    for (const it of selected) {
      const r = await db.run2(
        `INSERT INTO supply_orders (product_id, product_name, qty, unit, supplier_id, supplier_name, supplier_chat_id, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
        [it.product_id, it.name, it.qty, it.unit, it.supplier_id, it.supplier_name, it.supplier_chat_id, 'approved']);
      saveDb();
      if (it.supplier_id && it.supplier_chat_id) {
        if (await sendToSupplier({ ...it, id: r.lastID, product_name: it.name })) sentCount++;
      } else {
        await sendMessage(chatId, `⚠️ <b>${it.name}</b> uchun ta'minotchi biriktirilmagan yoki u botga ulanmagan. Dashboard orqali sozlang.`);
      }
    }
    await sendMessage(chatId, `✅ ${selected.length} ta tovar tasdiqlandi.\n📨 ${sentCount} ta ta'minotchiga xabar yuborildi.`);
    return;
  }

  // Toggle (tg_N)
  const idx = parseInt(data.replace('tg_', ''));
  if (!isNaN(idx) && items[idx]) {
    items[idx].selected = !items[idx].selected;
    await editMessageText(chatId, msgId, buildApprovalText(items), { reply_markup: buildApprovalKeyboard(items) });
    await answerCallbackQuery(query.id);
  }
}

// ── Long polling ────────────────────────────────────────────────────────────
let _offset = 0;
let _polling = false;

async function pollLoop() {
  if (!_polling) return;
  const updates = await tg('getUpdates', { offset: _offset, timeout: 30 });
  if (updates && updates.length) {
    for (const u of updates) {
      _offset = u.update_id + 1;
      try {
        if (u.message) await handleMessage(u.message);
        else if (u.callback_query) await handleCallback(u.callback_query);
      } catch (e) { console.error('[bot] update xatosi:', e.message); }
    }
  }
  setTimeout(pollLoop, updates ? 0 : 3000); // xato bo'lsa 3s kutib qayta
}

async function startBot() {
  if (!API) { console.log("[bot] BOT_TOKEN yo'q — bot ishlamaydi"); return; }
  // Webhook o'chirilgan bo'lishi kerak (polling bilan ziddiyat bo'lmasligi uchun)
  await tg('deleteWebhook', { drop_pending_updates: false });
  const me = await tg('getMe');
  if (!me) { console.log('[bot] ❌ Token noto\'g\'ri yoki internet yo\'q — bot ishlamadi'); return; }
  _polling = true;
  _offset = 0; // navbatdagi xabarlardan boshlab o'qiymiz (birinchi /start ni o'tkazib yubormaslik)
  pollLoop();
  console.log(`[bot] ✅ Bot ishga tushdi: @${me.username} (long polling)`);
}

module.exports = { startBot, notifyLowStock, completeOrder };
