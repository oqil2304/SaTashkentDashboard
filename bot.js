// ─── bot.js — SaTashkent Telegram Bot (native fetch, tashqi kutubxonasiz) ────
require('dotenv').config();
const { db, saveDb } = require('./db');

const BOT_TOKEN       = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID   = String(process.env.ADMIN_CHAT_ID || '');
const FINANCE_API_URL = process.env.FINANCE_API_URL || '';
const FINANCE_API_KEY = process.env.FINANCE_API_KEY || '';
const API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

// ── AI yordamchi (ta'minotchilar bilan muloqot) ─────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL          = process.env.AI_MODEL || 'claude-opus-4-8';
const COMPANY_INFO = {
  name:         process.env.COMPANY_NAME    || "SaTashkent Ta'minot Bo'limi",
  address:      process.env.COMPANY_ADDRESS || "Toshkent shahri (manzil kiritilmagan)",
  phone:        process.env.COMPANY_PHONE   || "+998 (telefon kiritilmagan)",
  hours:        process.env.COMPANY_HOURS   || "Dushanba–Shanba, 09:00–18:00",
  location_url: process.env.COMPANY_LOCATION_URL || ''
};
const aiHistory = new Map(); // chat_id → [{role, content}, ...] (oxirgi suhbatlar)

// SQLite datetime('now') UTC qaytaradi — Toshkent vaqtiga o'tkazib, o'qiladigan formatga keltiramiz
function fmtTashkentTime(sqliteUtc) {
  if (!sqliteUtc) return '';
  const d = new Date(sqliteUtc.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  d.setHours(d.getHours() + 5); // Toshkent = UTC+5
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
let _botUsername = '';

const approvalSessions = new Map();  // message_id → { items, chat_id }
const pendingInvoices  = new Map();  // supplier_chat_id → [ {order_id, msg_id, ...}, ... ] (FIFO navbat)
const invoiceByReply   = new Map();  // bot_msg_id → entry  (ta'minotchi reply qilsa aniq topiladi)
const adminQtyFlow     = new Map();  // admin chat_id → { items, idx }
const pendingChecks    = new Map();  // admin chat_id → [ {order_id, prompt_msg_id, ...}, ... ] (FIFO navbat)
const checkByReply     = new Map();  // bot_prompt_msg_id → entry
const pendingPrices    = new Map();  // admin chat_id → [ {order_id, prompt_msg_id, ...}, ... ] (narx so'rash)

const adminOnly = (chatId) => String(chatId) === ADMIN_CHAT_ID;

// ── FIFO navbat yordamchilari (bir vaqtda bir nechta zakazni qo'llab-quvvatlash) ─
function _qGet(map, key) { return map.get(String(key)) || []; }
function _qPush(map, key, val) {
  const k = String(key);
  if (!map.has(k)) map.set(k, []);
  map.get(k).push(val);
}
function _qRemove(map, key, orderId) {
  const k = String(key); const arr = map.get(k);
  if (!arr) return;
  const i = arr.findIndex(x => x.order_id === orderId);
  if (i >= 0) arr.splice(i, 1);
  if (!arr.length) map.delete(k);
}

// Zakaz holatlari uchun chiroyli yorliqlar
const ORDER_STATUS = {
  approved:         '✅ Tasdiqlangan',
  manual_pending:   '⏳ Yuborildi',
  awaiting_invoice: '📄 Faktura kutilyapti',
  invoice_received: '✅ Faktura keldi',
  delivered:        '📦 Yetkazildi',
  cancelled:        '❌ Bekor qilingan'
};

// Admin uchun doimiy klaviatura (pastda turadigan tugmalar)
const adminKb = {
  keyboard: [[{ text: '🔍 Ombor tekshirish' }, { text: '📋 Buyurtmalar' }]],
  resize_keyboard: true,
  is_persistent: true
};

// Nomni normallashtirish — "suv", "Suv (ichimlik)", "SUV " hammasi → "suv"
function normName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')          // qavs ichidagini olib tashlash
    .replace(/[^0-9a-zа-яёўқғҳ\s]/gi, ' ') // faqat harf/raqam qoldirish
    .replace(/\s+/g, ' ')
    .trim();
}

function qtyForOrder(p, lastQty) {
  // Tugagan tovar uchun — oxirgi marta qancha zakas qilingan bo'lsa, shuni taklif qilamiz
  if ((p.current_stock || 0) <= 0 && lastQty > 0) return lastQty;
  const TARGET_DAYS = 30;
  let raw = Math.max(0, TARGET_DAYS * (p.daily_usage || 0) - (p.current_stock || 0));
  // Kunlik sarfi noma'lum, lekin tovar tugagan — oxirgi zakas yoki kamida 1 birlik
  if (raw <= 0 && (p.current_stock || 0) <= 0) raw = lastQty > 0 ? lastQty : 1;
  const isWhole = /dona|quti|rulon|pachka|metr/i.test(p.unit || '');
  return isWhole ? Math.ceil(raw) : Math.ceil(raw * 10) / 10;
}

// Har bir mahsulot uchun oxirgi zakas (sotib olish) miqdorini topish
async function getLastOrderQtyMap() {
  const rows = await db.all2(`
    SELECT pu.product_id AS pid, pu.quantity AS qty
    FROM purchases pu
    JOIN (SELECT product_id, MAX(id) AS mid FROM purchases GROUP BY product_id) last
      ON pu.id = last.mid`);
  const m = new Map();
  for (const r of rows) m.set(r.pid, r.qty);
  return m;
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
    const multi = it.members && it.members.length > 1 ? ` <i>(${it.members.length} ta filial birlashtirildi)</i>` : '';
    return `${icon} <b>${it.name}</b>${multi} — ${status}\n   Qoldiq: ${it.stock} ${it.unit || ''} | Taklif: +${it.qty} ${it.unit || ''}\n   ${sup}`;
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
    WHERE (p.daily_usage > 0 AND (p.current_stock / p.daily_usage) <= 7)
       OR (p.current_stock <= 0)
    ORDER BY CASE WHEN p.current_stock <= 0 THEN 0 ELSE 1 END,
             CASE WHEN p.daily_usage > 0 THEN p.current_stock / p.daily_usage ELSE 999999 END ASC`);
  const active = await db.all2(
    "SELECT product_id, members_json FROM supply_orders WHERE status NOT IN ('delivered','cancelled')");
  const activeIds = new Set();
  for (const r of active) {
    if (r.product_id) activeIds.add(r.product_id);
    try { (JSON.parse(r.members_json || '[]')).forEach(m => m.product_id && activeIds.add(m.product_id)); } catch (_) {}
  }
  return rows.filter(p => !activeIds.has(p.id));
}

async function notifyLowStock(forceCheck = false) {
  if (!API || !ADMIN_CHAT_ID) return;
  const prods = await getLowStockProducts();
  if (!prods.length) {
    if (forceCheck) await sendMessage(ADMIN_CHAT_ID, '✅ Barcha tovarlar yetarli! Buyurtma kerak emas.');
    return;
  }
  const items = buildGroupedItems(prods, await getLastOrderQtyMap());
  const msg = await sendMessage(ADMIN_CHAT_ID, buildApprovalText(items), { reply_markup: buildApprovalKeyboard(items) });
  if (msg) approvalSessions.set(msg.message_id, { items, chat_id: ADMIN_CHAT_ID });
  console.log(`[bot] Admin ga ${items.length} ta guruh (${prods.length} ta tovar) ro'yxati yuborildi`);
}

// Bir xil nomli mahsulotlarni (sintaksisi boshqacha) bitta guruhga jamlash
function buildGroupedItems(prods, lastQtyMap = new Map()) {
  const raw = prods.map(p => ({
    product_id: p.id, name: p.name, unit: p.unit || '', qty: qtyForOrder(p, lastQtyMap.get(p.id)),
    stock: p.current_stock || 0,
    days_left: (p.current_stock || 0) <= 0 ? 0 : (p.daily_usage > 0 ? p.current_stock / p.daily_usage : Infinity),
    supplier_id: p.supplier_id || null, supplier_name: p.supplier_name || null,
    supplier_chat_id: p.supplier_chat_id || null
  }));
  const groups = new Map();
  for (const it of raw) {
    const key = normName(it.name);
    let g = groups.get(key);
    if (!g) {
      g = { key, name: it.name, unit: it.unit, qty: 0, stock: 0, days_left: it.days_left,
            members: [], supplier_id: null, supplier_name: null, supplier_chat_id: null, selected: false };
      groups.set(key, g);
    }
    g.qty   = Math.round((g.qty + it.qty) * 10) / 10;
    g.stock = Math.round((g.stock + it.stock) * 10) / 10;
    g.days_left = Math.min(g.days_left, it.days_left);
    g.members.push({ product_id: it.product_id, name: it.name, qty: it.qty, unit: it.unit });
    // Ta'minotchi: guruhdagi birinchi biriktirilgan ta'minotchi (bitta ta'minotchi)
    if (!g.supplier_id && it.supplier_id) {
      g.supplier_id = it.supplier_id; g.supplier_name = it.supplier_name; g.supplier_chat_id = it.supplier_chat_id;
    }
  }
  return [...groups.values()];
}

// Ochiq approval sessiyalarida allaqachon turgan mahsulot id'lari (takror yubormaslik uchun)
function _productsInOpenSessions() {
  const ids = new Set();
  for (const sess of approvalSessions.values())
    for (const it of (sess.items || []))
      (it.members || []).forEach(m => m.product_id && ids.add(m.product_id));
  return ids;
}

// ── Avtomatik tekshiruv — tugagan + shoshilinch (≤2 kun) tovarlarni adminga yuborish ─
async function autoCheckUrgent() {
  if (!API || !ADMIN_CHAT_ID) return;
  try {
    const prods = await getLowStockProducts();
    // faqat tugagan (stock<=0) yoki shoshilinch (≤2 kun qolgan)
    const urgent = prods.filter(p =>
      (p.current_stock || 0) <= 0 ||
      (p.daily_usage > 0 && (p.current_stock / p.daily_usage) <= 2)
    );
    if (!urgent.length) return;
    // Allaqachon ochiq tasdiqlash xabarida turganlarni o'tkazib yuborish
    const inSession = _productsInOpenSessions();
    const fresh = urgent.filter(p => !inSession.has(p.id));
    if (!fresh.length) return;
    const items = buildGroupedItems(fresh, await getLastOrderQtyMap());
    const msg = await sendMessage(ADMIN_CHAT_ID,
      `🔔 <b>Avtomatik ogohlantirish</b> — shoshilinch / tugagan tovarlar:\n\n` +
      buildApprovalText(items).replace(/^📋 <b>.*<\/b>\n\n/, ''),
      { reply_markup: buildApprovalKeyboard(items) });
    if (msg) approvalSessions.set(msg.message_id, { items, chat_id: ADMIN_CHAT_ID });
    console.log(`[bot] Avto-tekshiruv: ${fresh.length} ta shoshilinch/tugagan tovar adminga yuborildi`);
  } catch (e) { console.error('[bot] autoCheckUrgent xatosi:', e.message); }
}

// ── Ta'minotchiga xabar ─────────────────────────────────────────────────────
async function sendToSupplier(order) {
  if (!order.supplier_chat_id) return false;
  let body;
  if (order.members && order.members.length > 1) {
    const list = order.members.map(m => `   • ${m.name}: <b>${m.qty} ${m.unit}</b>`).join('\n');
    body = `Bizda <b>${order.product_name}</b> tugab bormoqda.\nZakaz (jami ${order.qty} ${order.unit}):\n${list}\n`;
  } else {
    body = `Bizda <b>${order.product_name}</b> tugab bormoqda.\nZakaz miqdori: <b>${order.qty} ${order.unit}</b>\n`;
  }
  const text = `🏪 <b>SaTashkent Ta'minot Bo'limidan zakaz</b>\n\n` +
    `Salom, <b>${order.supplier_name}</b>!\n\n` +
    `${body}\n` +
    `Schet-faktura yuboring — imkon qadar tezroq.\n` +
    `<i>💡 Bir nechta zakaz bo'lsa, fakturani aynan shu xabarga "reply" qilib yuboring.</i>\nRahmat! 🙏`;
  const sent = await sendMessage(order.supplier_chat_id, text);
  if (!sent) return false;
  const entry = {
    order_id: order.id, product_name: order.product_name, qty: order.qty, unit: order.unit,
    msg_id: sent.message_id
  };
  _qPush(pendingInvoices, order.supplier_chat_id, entry);
  invoiceByReply.set(sent.message_id, entry);
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
  let members = null;
  try { members = order.members_json ? JSON.parse(order.members_json) : null; } catch (_) {}
  if (!members || !members.length)
    members = [{ product_id: order.product_id, name: order.product_name, qty: order.qty, unit: order.unit }];

  let firstRow = true;
  for (const m of members) {
    if (!m.product_id || !(m.qty > 0)) continue;
    // Dostavka narxi bitta zakazga tegishli — faqat birinchi qatorga yozamiz (takrorlanmasin)
    const delivery = firstRow ? (order.delivery_cost || 0) : 0;
    firstRow = false;
    await db.run2(
      `INSERT INTO purchases (product_id, quantity, unit_price, purchase_date, supplier, note, remaining_qty, delivery_cost, created_at)
       VALUES (?, ?, ?, date('now'), ?, 'Telegram bot orqali zakaz', ?, ?, datetime('now'))`,
      [m.product_id, m.qty, order.unit_price || 0, order.supplier_name || '', m.qty, delivery]);
    await db.run2('UPDATE products SET current_stock = current_stock + ? WHERE id=?', [m.qty, m.product_id]);
  }
  await db.run2("UPDATE supply_orders SET status='delivered', updated_at=datetime('now') WHERE id=?", [orderId]);
  saveDb();
  if (ADMIN_CHAT_ID)
    await sendMessage(ADMIN_CHAT_ID, `✅ <b>${order.product_name}</b> — ${order.qty} ${order.unit} omborga kiritildi!\nZakaz yakunlandi.`);
  console.log(`[bot] Zakaz #${orderId} yakunlandi — ${members.length} ta pozitsiya ombori yangilandi`);
}

// ── Miqdor so'rash oqimi (admin tasdiqlagandan keyin) ───────────────────────
async function askNextQty(chatId) {
  const flow = adminQtyFlow.get(String(chatId));
  if (!flow) return;
  if (flow.idx >= flow.items.length) {
    adminQtyFlow.delete(String(chatId));
    await finalizeOrders(chatId, flow.items);
    return;
  }
  const it = flow.items[flow.idx];
  const hint = (it.stock || 0) <= 0 ? ' <i>(oxirgi zakas miqdori)</i>' : '';
  await sendMessage(chatId,
    `📝 <b>${it.name}</b> — qancha zakas qilamiz?\n` +
    `Qoldiq: ${it.stock} ${it.unit} | Taklif: <b>${it.qty} ${it.unit}</b>${hint}\n\n` +
    `Sonni yuboring yoki taklifni qabul qilish uchun <b>ok</b> deb yozing:`);
}

// Guruh umumiy miqdorini a'zo mahsulotlarga ulush qilib taqsimlash
function splitMembers(group) {
  const members = group.members || [{ product_id: group.product_id, name: group.name, qty: group.qty, unit: group.unit }];
  const baseSum = members.reduce((s, m) => s + (m.qty || 0), 0) || 1;
  const factor = group.qty / baseSum;
  let assigned = 0;
  return members.map((m, i) => {
    let share;
    if (i === members.length - 1) share = Math.round((group.qty - assigned) * 10) / 10;
    else { share = Math.round((m.qty || 0) * factor * 10) / 10; assigned += share; }
    return { product_id: m.product_id, name: m.name, unit: m.unit, qty: Math.max(0, share) };
  });
}

async function finalizeOrders(chatId, items) {
  let sentCount = 0;
  for (const it of items) {
    const members = splitMembers(it);
    const r = await db.run2(
      `INSERT INTO supply_orders (product_id, product_name, qty, unit, supplier_id, supplier_name, supplier_chat_id, status, members_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [members[0].product_id, it.name, it.qty, it.unit, it.supplier_id, it.supplier_name, it.supplier_chat_id, 'approved', JSON.stringify(members)]);
    saveDb();
    if (it.supplier_id && it.supplier_chat_id) {
      if (await sendToSupplier({ ...it, id: r.lastID, product_name: it.name, members })) sentCount++;
    } else {
      await sendMessage(chatId, `⚠️ <b>${it.name}</b> uchun ta'minotchi biriktirilmagan yoki u botga ulanmagan. Dashboard orqali sozlang.`);
    }
  }
  await sendMessage(chatId, `✅ ${items.length} ta pozitsiya tasdiqlandi.\n📨 ${sentCount} ta ta'minotchiga zakaz yuborildi.`);
}

// Chek so'rash — narx kiritilgandan keyin chaqiriladi
async function _askForCheck(chatId, entry) {
  const order = await db.get2('SELECT * FROM supply_orders WHERE id=?', [entry.order_id]);
  if (!order) return;
  const prompt = await sendMessage(chatId,
    `🧾 <b>${entry.product_name}</b> — to'lov chekini (rasm yoki PDF) yuboring.\n` +
    `U ta'minotchiga yuboriladi va tovar omborga kiritiladi.\n` +
    `<i>💡 Bir nechta to'lov bo'lsa, chekni aynan shu xabarga "reply" qiling.</i>\n\n` +
    `(Cheksiz davom ettirish uchun shu xabarga <b>skip</b> deb yozing)`);
  const checkEntry = {
    order_id: entry.order_id, supplier_chat_id: order.supplier_chat_id,
    product_name: entry.product_name, qty: entry.qty, unit: entry.unit,
    prompt_msg_id: prompt?.message_id
  };
  _qPush(pendingChecks, chatId, checkEntry);
  if (prompt) checkByReply.set(prompt.message_id, checkEntry);
}

// ── Ta'minotchi konteksti: aktiv zakazlar + tegishli filiallar ──────────────
async function buildSupplierContext(sup, chatId, queue) {
  const key = String(chatId);
  let orders = [];
  try {
    orders = await db.all2(
      `SELECT so.product_name, so.qty, so.unit, so.status, b.id as branch_id, b.name as branch_name,
              b.address as branch_address, b.phone as branch_phone, b.manager as branch_manager,
              b.location_url as branch_location_url
       FROM supply_orders so
       LEFT JOIN products p ON so.product_id = p.id
       LEFT JOIN branches b ON b.id = COALESCE(so.branch_id, p.branch_id)
       WHERE so.supplier_chat_id=? AND so.status NOT IN ('delivered','cancelled')
       ORDER BY so.created_at DESC LIMIT 10`,
      [key]);
  } catch (_) {}
  const orderLines = orders.length
    ? orders.map(o => `- ${o.product_name}: ${o.qty} ${o.unit} (${ORDER_STATUS[o.status] || o.status})${o.branch_name ? ` — filial: ${o.branch_name}` : ''}`).join('\n')
    : "Hozircha aktiv zakaz yo'q.";
  const waiting = queue && queue.length
    ? `Ta'minotchidan ayni vaqtda quyidagi zakaz(lar) uchun schet-faktura kutilyapti: ${queue.map(q => q.product_name).join(', ')}.`
    : "Ayni vaqtda kutilayotgan faktura yo'q.";

  // Aktiv zakazlar bog'liq bo'lgan filiallar (takrorlarsiz) — har birining o'z manzili/telefoni
  const branchMap = new Map();
  for (const o of orders) {
    if (o.branch_id && !branchMap.has(o.branch_id)) {
      branchMap.set(o.branch_id, { name: o.branch_name, address: o.branch_address, phone: o.branch_phone, manager: o.branch_manager, location_url: o.branch_location_url });
    }
  }
  // Agar aktiv zakazda filial topilmasa, ta'minotchiga bog'langan filiallarni ko'rsatamiz
  if (!branchMap.size && sup.branch_ids) {
    const ids = String(sup.branch_ids).split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length) {
      try {
        const rows = await db.all2(`SELECT id, name, address, phone, manager, location_url FROM branches WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        for (const b of rows) branchMap.set(b.id, b);
      } catch (_) {}
    }
  }
  const branchInfoText = branchMap.size
    ? [...branchMap.values()].map(b =>
        `- ${b.name}: manzil: ${b.address || 'kiritilmagan'}; telefon: ${b.phone || COMPANY_INFO.phone}${b.manager ? `; mas'ul: ${b.manager}` : ''}${b.location_url ? `; Yandex Maps lokatsiya: ${b.location_url}` : ''}`
      ).join('\n')
    : `- ${COMPANY_INFO.name}: manzil: ${COMPANY_INFO.address}; telefon: ${COMPANY_INFO.phone}`;

  return { orders, orderLines, waiting, branchMap, branchInfoText };
}

// ── AIsiz oddiy javob (kalit so'zlar bo'yicha) — API kerak emas, bepul ───────
function ruleBasedReply(ctx, text) {
  const t = (text || '').toLowerCase();
  const has = (...arr) => arr.some(w => t.includes(w));
  const branches = [...ctx.branchMap.values()];

  // Lokatsiya / manzil
  if (has('lokatsiya', 'lokatsia', 'manzil', 'qayer', 'qaerda', 'qayerda', 'address', 'адрес', 'локац', 'где')) {
    if (!branches.length) return `Manzil: ${COMPANY_INFO.address}\nTelefon: ${COMPANY_INFO.phone}`;
    if (branches.length === 1) {
      const b = branches[0];
      return `📍 ${b.name} filiali\nManzil: ${b.address || 'kiritilmagan'}\nTelefon: ${b.phone || COMPANY_INFO.phone}${b.manager ? `\nMas'ul: ${b.manager}` : ''}${b.location_url ? `\n🗺 Yandex Maps lokatsiya: ${b.location_url}` : ''}`;
    }
    return `Buyurtmangiz quyidagi filiallarga tegishli:\n` +
      branches.map(b => `📍 ${b.name}\n   Manzil: ${b.address || 'kiritilmagan'}\n   Telefon: ${b.phone || COMPANY_INFO.phone}${b.location_url ? `\n   🗺 ${b.location_url}` : ''}`).join('\n');
  }

  // Telefon
  if (has('telefon', 'nomer', 'nomeri', 'raqam', 'tel ', 'тел', 'номер', 'phone')) {
    if (!branches.length) return `Telefon: ${COMPANY_INFO.phone}`;
    if (branches.length === 1) {
      const b = branches[0];
      return `📞 ${b.name} filiali telefoni: ${b.phone || COMPANY_INFO.phone}`;
    }
    return branches.map(b => `📞 ${b.name}: ${b.phone || COMPANY_INFO.phone}`).join('\n');
  }

  // Chek / to'lov
  if (has('chek', 'to\'lov', 'tolov', 'pul', 'oplata', 'чек', 'оплат', 'деньг', 'payment')) {
    return `To'lov amalga oshirilgandan so'ng, to'lov cheki shu botda avtomatik sizga yuboriladi. ✅`;
  }

  // Faktura / schet
  if (has('faktura', 'schet', 'счет', 'счёт', 'invoice', 'фактура')) {
    return `Schet-fakturani shu chatga rasm yoki PDF ko'rinishida yuboring. Agar bir nechta zakaz bo'lsa, tegishli zakaz xabariga "reply" qilib yuboring. 📄`;
  }

  // Zakaz holati
  if (has('zakaz', 'buyurtma', 'holat', 'status', 'заказ', 'статус')) {
    return ctx.orders.length
      ? `Sizning aktiv zakazlaringiz:\n${ctx.orderLines}`
      : `Hozircha aktiv zakazingiz yo'q.`;
  }

  // Ish vaqti
  if (has('ish vaqt', 'soat', 'qachon', 'vaqt', 'часы', 'время', 'работа')) {
    return `Ish vaqti: ${COMPANY_INFO.hours}`;
  }

  // Salom
  if (has('salom', 'assalom', 'привет', 'здравств', 'salam', 'hello', 'hi ')) {
    return `Assalomu alaykum! 👋 Sizga qanday yordam bera olaman? Lokatsiya, telefon yoki zakaz holati haqida so'rashingiz mumkin.`;
  }

  // Tushunilmadi
  return `Savolingiz qabul qilindi 🙏 Quyidagilar haqida so'rashingiz mumkin: lokatsiya/manzil, telefon, zakaz holati, faktura yoki to'lov.\nShoshilinch bo'lsa: ${branches[0]?.phone || COMPANY_INFO.phone}`;
}

// ── AI yordamchi: ta'minotchi savollariga javob berish ──────────────────────
async function aiReply(sup, chatId, text, queue) {
  const key = String(chatId);
  const ctx = await buildSupplierContext(sup, chatId, queue);
  const { orderLines, waiting, branchInfoText } = ctx;

  // API kaliti yo'q — bepul kalit-so'zli javob
  if (!ANTHROPIC_API_KEY) {
    await sendMessage(chatId, ruleBasedReply(ctx, text), { parse_mode: undefined });
    return;
  }
  tg('sendChatAction', { chat_id: chatId, action: 'typing' });

  const system =
`Sen "${COMPANY_INFO.name}" kompaniyasining Telegram yordamchisisan. Ta'minotchilar (yetkazib beruvchilar) bilan muloyim, qisqa va aniq muloqot qilasan. Foydalanuvchi qaysi tilda yozsa (o'zbek yoki rus), shu tilda javob ber.

Kompaniyaning bir nechta filiali bor, har birining manzili va telefoni boshqacha. Ta'minotchining buyurtmasi qaysi filialga tegishli bo'lsa, lokatsiya/manzil/telefon so'ralganda FAQAT shu filial(lar) ma'lumotini ber (pastdagi "Tegishli filial(lar)" ro'yxatidan):

Tegishli filial(lar):
${branchInfoText}

Umumiy ish vaqti: ${COMPANY_INFO.hours}

Ta'minotchi: ${sup.name}${sup.phone ? ` (tel: ${sup.phone})` : ''}
Uning aktiv zakazlari:
${orderLines}
${waiting}

Qoidalar:
- Lokatsiya yoki manzil so'rasa — yuqoridagi "Tegishli filial(lar)" ro'yxatidan, ta'minotchining hozirgi zakazi tegishli bo'lgan filial(lar)ning manzilini va (mavjud bo'lsa) Yandex Maps lokatsiya havolasini to'liq ber. Agar bir nechta filial bo'lsa, har birini nomi bilan ajratib ko'rsat. Yandex Maps havolasini hech qachon o'zgartirma yoki qisqartirma — to'liq nusxalab ber.
- Telefon raqam so'rasa — tegishli filialning telefonini ber (agar filialda telefon kiritilmagan bo'lsa, kompaniya umumiy telefonini ber: ${COMPANY_INFO.phone}).
- Chek yoki to'lov haqida so'rasa: to'lov amalga oshirilgach, chek shu botda avtomatik yuborilishini tushuntir.
- Schet-faktura haqida so'rasa: fakturani shu chatga rasm yoki PDF ko'rinishida yuborishini ayt (kerak bo'lsa tegishli zakaz xabariga "reply" qilib).
- Zakaz holati haqida so'rasa — yuqoridagi ro'yxatga tayanib javob ber.
- O'zingda yo'q ma'lumotni o'ylab topma; bunday holda operator bilan bog'lanishni (kompaniya telefoni orqali) taklif qil.
- Javoblar qisqa bo'lsin (1-4 jumla). Emoji o'rtacha ishlat. Markdown/HTML teglar ishlatma — oddiy matn.`;

  // Suhbat tarixi (oxirgi 8 ta xabar)
  const hist = aiHistory.get(key) || [];
  const messages = [...hist, { role: 'user', content: text }];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 600, system, messages })
    });
    const data = await res.json();
    if (!res.ok) { console.error('[bot] AI xato:', data.error || data); throw new Error('ai'); }
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const out = reply || "Kechirasiz, javob berolmadim. Iltimos, operator bilan bog'laning.";
    await sendMessage(chatId, out, { parse_mode: undefined });
    // Tarixni yangilash (oxirgi 8 ta)
    const next = [...messages, { role: 'assistant', content: out }].slice(-8);
    aiHistory.set(key, next);
  } catch (e) {
    // AI ishlamasa (masalan, kredit tugagan) — bepul kalit-so'zli javobga o'tamiz
    await sendMessage(chatId, ruleBasedReply(ctx, text), { parse_mode: undefined });
  }
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
    await tg('setMyCommands', {
      commands: [
        { command: 'myzakaz', description: '📦 Mening zakazlarim' },
        { command: 'jarayon', description: '⏳ Jarayondagi zakazlar' },
        { command: 'help',    description: '❓ Yordam' }
      ],
      scope: { type: 'chat', chat_id: Number(chatId) }
    });
    await sendMessage(chatId,
      `✅ Siz <b>SaTashkent</b> ta'minot tizimiga ta'minotchi sifatida ulandingiz!\n\n` +
      `Zakaz kelganda shu botdan xabar olasiz.\nQuyidagi tugmalar orqali zakazlarni kuzatib boring 👇`,
      {
        reply_markup: {
          keyboard: [[{ text: '📦 Zakazlarim' }, { text: '⏳ Jarayon' }]],
          resize_keyboard: true, is_persistent: true
        }
      }
    );
    return;
  }

  // /start, /help (admin)
  if (/^\/(start|help)$/.test(text)) {
    if (adminOnly(chatId)) {
      await sendMessage(chatId,
        `👋 <b>SaTashkent Ta'minot Bot</b>\n\n` +
        `🔍 /check — Ombor holatini tekshirish\n` +
        `📋 /orders — Aktiv buyurtmalar\n` +
        `⏳ /pending — Jarayondagi zakazlar\n` +
        `✅ /done — Yetkazilgan zakazlar\n` +
        `🚚 /suppliers — Ta'minotchilar ro'yxati\n` +
        `📊 /stats — Umumiy holat\n\n` +
        `Quyidagi tugmalardan ham foydalanishingiz mumkin 👇`,
        { reply_markup: adminKb }
      );
    } else {
      // Ta'minotchi ulangan bo'lsa — uning menyusini ko'rsatish
      const sup = await db.get2("SELECT id FROM suppliers WHERE telegram_chat_id=?", [chatId]);
      if (sup) {
        await sendMessage(chatId, `👋 Salom! SaTashkent ta'minot botiga xush kelibsiz.\n\nZakazlaringizni kuzatib boring 👇`, {
          reply_markup: {
            keyboard: [[{ text: '📦 Zakazlarim' }, { text: '⏳ Jarayon' }]],
            resize_keyboard: true, is_persistent: true
          }
        });
      } else {
        await sendMessage(chatId, `👋 Salom! Bu SaTashkent ta'minot boti. Ulanish uchun admindan maxsus havola so'rang.`);
      }
    }
    return;
  }

  if ((/^\/check/.test(text) || text === '🔍 Ombor tekshirish') && adminOnly(chatId)) {
    await sendMessage(chatId, '🔍 Ombor tekshirilmoqda...');
    await notifyLowStock(true);
    return;
  }

  if ((/^\/orders/.test(text) || text === '📋 Buyurtmalar') && adminOnly(chatId)) {
    const orders = await db.all2("SELECT * FROM supply_orders WHERE status NOT IN ('delivered','cancelled') ORDER BY created_at DESC LIMIT 20");
    if (!orders.length) { await sendMessage(chatId, "✅ Aktiv buyurtma yo'q."); return; }
    const t = orders.map(o => `• <b>${o.product_name}</b> — ${o.qty} ${o.unit}\n  📌 ${ORDER_STATUS[o.status] || o.status} | ${o.supplier_name || '—'}`).join('\n\n');
    await sendMessage(chatId, `📋 <b>Aktiv buyurtmalar:</b>\n\n${t}`);
    return;
  }

  if (/^\/pending/.test(text) && adminOnly(chatId)) {
    const orders = await db.all2("SELECT * FROM supply_orders WHERE status IN ('approved','manual_pending','awaiting_invoice','invoice_received') ORDER BY created_at DESC LIMIT 30");
    if (!orders.length) { await sendMessage(chatId, "✅ Jarayonda zakaz yo'q."); return; }
    const t = orders.map(o => `• <b>${o.product_name}</b> — ${o.qty} ${o.unit}\n  ${ORDER_STATUS[o.status] || o.status} | ${o.supplier_name || '—'} | ${(o.created_at||'').slice(0,10)}`).join('\n\n');
    await sendMessage(chatId, `⏳ <b>Jarayondagi zakazlar:</b>\n\n${t}`);
    return;
  }

  if (/^\/done/.test(text) && adminOnly(chatId)) {
    const orders = await db.all2("SELECT * FROM supply_orders WHERE status='delivered' ORDER BY updated_at DESC LIMIT 20");
    if (!orders.length) { await sendMessage(chatId, "📭 Yetkazilgan zakaz yo'q."); return; }
    const t = orders.map(o => `• <b>${o.product_name}</b> — ${o.qty} ${o.unit}\n  📦 ${o.supplier_name || '—'} | ${(o.updated_at||'').slice(0,10)}`).join('\n\n');
    await sendMessage(chatId, `✅ <b>Yetkazilgan zakazlar:</b>\n\n${t}`);
    return;
  }

  if (/^\/suppliers/.test(text) && adminOnly(chatId)) {
    const sups = await db.all2("SELECT * FROM suppliers ORDER BY name");
    if (!sups.length) { await sendMessage(chatId, "🚚 Ta'minotchi yo'q. Dashboard orqali qo'shing."); return; }
    const t = sups.map(s => `• <b>${s.name}</b>${s.telegram_chat_id ? ' ✅' : ' ⏳'}\n  ${s.products_note || '—'}${s.phone ? ' | 📞 '+s.phone : ''}`).join('\n\n');
    await sendMessage(chatId, `🚚 <b>Ta'minotchilar:</b>\n\n${t}`);
    return;
  }

  if (/^\/stats/.test(text) && adminOnly(chatId)) {
    const pc = await db.get2('SELECT COUNT(*) AS c FROM products');
    const low = await db.get2('SELECT COUNT(*) AS c FROM products WHERE daily_usage>0 AND (current_stock/daily_usage)<=7');
    const fin = await db.get2('SELECT COUNT(*) AS c FROM products WHERE daily_usage>0 AND current_stock<=0');
    const act = await db.get2("SELECT COUNT(*) AS c FROM supply_orders WHERE status NOT IN ('delivered','cancelled')");
    const sup = await db.get2("SELECT COUNT(*) AS c FROM suppliers WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id!=''");
    await sendMessage(chatId,
      `📊 <b>Umumiy holat</b>\n\n` +
      `📦 Mahsulotlar: <b>${pc?.c||0}</b>\n` +
      `⏰ Kam qolgan (≤7 kun): <b>${low?.c||0}</b>\n` +
      `🚨 Tugagan: <b>${fin?.c||0}</b>\n` +
      `⏳ Aktiv zakazlar: <b>${act?.c||0}</b>\n` +
      `🚚 Ulangan ta'minotchilar: <b>${sup?.c||0}</b>`);
    return;
  }

  // ── Admin holatlari: miqdor kiritish, narx va to'lov cheki ──────────────────
  if (adminOnly(chatId)) {
    // 1) Miqdor so'rash oqimi
    const flow = adminQtyFlow.get(chatId);
    if (flow) {
      const it = flow.items[flow.idx];
      let q;
      if (/^ok$/i.test(text.trim())) q = it.qty;
      else {
        q = parseFloat(text.replace(',', '.'));
        if (isNaN(q) || q <= 0) { await sendMessage(chatId, '❌ Iltimos, to\'g\'ri son yuboring yoki <b>ok</b> deb yozing.'); return; }
      }
      it.qty = q;
      flow.idx++;
      await askNextQty(chatId);
      return;
    }

    // 2) Narx so'rash oqimi (to'lovdan oldin)
    const prices = _qGet(pendingPrices, chatId);
    if (prices.length) {
      const rid = msg.reply_to_message?.message_id;
      const pe = (rid && pendingPrices._byReply?.get(rid)) || prices[0];

      if (/^skip$/i.test((text || '').trim())) {
        _qRemove(pendingPrices, chatId, pe.order_id);
        // Narxsiz chekka o'tish
        await _askForCheck(chatId, pe);
        return;
      }
      const price = parseFloat((text || '').replace(/\s/g,'').replace(',', '.'));
      if (isNaN(price) || price < 0) {
        await sendMessage(chatId, `💰 Iltimos, to'g'ri narx kiriting (so'm da).\nYoki <b>skip</b> deb yozing (narxsiz yakunlash).`);
        return;
      }
      _qRemove(pendingPrices, chatId, pe.order_id);
      await db.run2('UPDATE supply_orders SET unit_price=? WHERE id=?', [price, pe.order_id]);
      saveDb();
      const total = Math.round(pe.qty * price);
      await sendMessage(chatId, `✅ Narx saqlandi: <b>${price.toLocaleString()} so'm/${pe.unit}</b>\nJami: <b>${total.toLocaleString()} so'm</b>`);
      await _askForCheck(chatId, pe);
      return;
    }

    // 3) To'lov cheki kutilmoqda (bir vaqtda bir nechta bo'lishi mumkin)
    const checks = _qGet(pendingChecks, chatId);
    if (checks.length) {
      // Qaysi zakaz uchun? reply qilingan bo'lsa — aniq, aks holda navbatdagi birinchisi (FIFO)
      const rid = msg.reply_to_message?.message_id;
      const check = (rid && checkByReply.get(rid)) || checks[0];

      if (/^skip$/i.test((text || '').trim())) {
        _qRemove(pendingChecks, chatId, check.order_id);
        if (check.prompt_msg_id) checkByReply.delete(check.prompt_msg_id);
        await sendMessage(chatId, `🧾 <b>${check.product_name}</b> cheksiz yakunlanmoqda...`);
        await completeOrder(check.order_id);
        return;
      }
      let fileId = null;
      if (msg.document) fileId = msg.document.file_id;
      else if (msg.photo) fileId = msg.photo[msg.photo.length - 1].file_id;
      if (!fileId) { await sendMessage(chatId, '🧾 To\'lov chekini rasm yoki PDF ko\'rinishida yuboring (yoki <b>skip</b> deb yozing).'); return; }
      _qRemove(pendingChecks, chatId, check.order_id);
      if (check.prompt_msg_id) checkByReply.delete(check.prompt_msg_id);
      if (check.supplier_chat_id) {
        await sendMessage(check.supplier_chat_id, `✅ <b>${check.product_name}</b> (${check.qty} ${check.unit}) uchun to'lov amalga oshirildi! To'lov cheki:`);
        await forwardMessage(check.supplier_chat_id, msg.chat.id, msg.message_id);
        await db.run2('UPDATE supply_orders SET payment_check_file_id=? WHERE id=?', [fileId, check.order_id]);
        saveDb();
        const remaining = _qGet(pendingChecks, chatId).length;
        await sendMessage(chatId, `🧾 <b>${check.product_name}</b> cheki ta'minotchiga yuborildi.` +
          (remaining ? `\n📌 Yana ${remaining} ta zakaz uchun chek kutilmoqda.` : ''));
      }
      await completeOrder(check.order_id);
      return;
    }
    return;
  }

  // Ta'minotchi buyruqlari
  if (/^\/(myzakaz|jarayon)/.test(text) || text === '📦 Zakazlarim' || text === '⏳ Jarayon') {
    const onlyActive = /jarayon/.test(text) || text === '⏳ Jarayon';
    const statuses = onlyActive
      ? "('approved','manual_pending','awaiting_invoice','invoice_received')"
      : "('approved','manual_pending','awaiting_invoice','invoice_received','delivered')";
    const orders = await db.all2(
      `SELECT * FROM supply_orders WHERE supplier_chat_id=? AND status IN ${statuses} ORDER BY created_at DESC LIMIT 20`,
      [chatId]
    );
    if (!orders.length) { await sendMessage(chatId, onlyActive ? '✅ Jarayonda zakaz yo\'q.' : "📭 Zakaz tarixi bo'sh."); return; }
    const statusLabel = { approved: '✅ Tasdiqlangan', manual_pending: '⏳ Yuborildi', awaiting_invoice: '📄 Faktura kutilyapti', invoice_received: '✅ Faktura keldi', delivered: '📦 Yetkazildi' };
    const t = orders.map(o => `• <b>${o.product_name}</b> — ${o.qty} ${o.unit}\n  ${statusLabel[o.status] || o.status} | ${(o.created_at||'').slice(0,10)}`).join('\n\n');
    const title = onlyActive ? '⏳ Jarayondagi zakazlar:' : '📋 Zakazlar tarixi:';
    await sendMessage(chatId, `${title}\n\n${t}`, {
      reply_markup: {
        keyboard: [[{ text: '📦 Zakazlarim' }, { text: '⏳ Jarayon' }]],
        resize_keyboard: true, is_persistent: true
      }
    });
    return;
  }

  // Ta'minotchini aniqlash (faqat ulangan ta'minotchilarga xizmat ko'rsatamiz)
  const sup = await db.get2("SELECT * FROM suppliers WHERE telegram_chat_id=?", [chatId]);

  // Fayl (faktura) keldimi?
  let fileId = null, mimeType = 'image/jpeg';
  if (msg.document) { fileId = msg.document.file_id; mimeType = msg.document.mime_type || 'application/pdf'; }
  else if (msg.photo) { fileId = msg.photo[msg.photo.length - 1].file_id; mimeType = 'image/jpeg'; }

  const queue = _qGet(pendingInvoices, chatId);

  // Matnli savol (fayl emas) — AI yordamchi javob beradi
  if (!fileId) {
    if (sup && text) { await aiReply(sup, chatId, text, queue); }
    return;
  }

  // Fayl keldi, lekin kutilayotgan zakaz yo'q
  if (!queue.length) {
    if (sup) await sendMessage(chatId, "Rahmat! Ayni paytda sizdan faktura kutilayotgan faol zakaz yo'q. Savolingiz bo'lsa, yozib qoldiring.");
    return;
  }

  // Qaysi zakaz uchun? reply qilingan bo'lsa — aniq, aks holda navbatdagi birinchisi (FIFO)
  const rid = msg.reply_to_message?.message_id;
  const pending = (rid && invoiceByReply.get(rid)) || queue[0];

  await db.run2("UPDATE supply_orders SET invoice_file_id=?, status='invoice_received', updated_at=datetime('now') WHERE id=?", [fileId, pending.order_id]);
  saveDb();
  _qRemove(pendingInvoices, chatId, pending.order_id);
  if (pending.msg_id) invoiceByReply.delete(pending.msg_id);
  const remainingInv = _qGet(pendingInvoices, chatId).length;
  await sendMessage(chatId, `✅ <b>${pending.product_name}</b> uchun schet-faktura qabul qilindi! Tez orada to'lov amalga oshiriladi.` +
    (remainingInv ? `\n\n📌 Yana ${remainingInv} ta zakaz uchun faktura kutilmoqda.` : ''));

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
    await answerCallbackQuery(query.id, { text: "✅ To'lov cheki so'ralmoqda..." });
    await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
    const order = await db.get2('SELECT * FROM supply_orders WHERE id=?', [orderId]);
    if (!order) { await sendMessage(chatId, '❌ Buyurtma topilmadi.'); return; }
    const entry = {
      order_id: orderId, supplier_chat_id: order.supplier_chat_id,
      product_name: order.product_name, qty: order.qty, unit: order.unit
    };
    // Narx dashboardda kiritilgan bo'lsa — qayta so'ramaymiz, to'g'ridan chekka o'tamiz
    if (order.unit_price && order.unit_price > 0) {
      const total = Math.round(order.qty * order.unit_price);
      await sendMessage(chatId,
        `💰 Narx allaqachon kiritilgan: <b>${order.unit_price.toLocaleString()} so'm/${order.unit}</b>\n` +
        `Jami: <b>${total.toLocaleString()} so'm</b>`);
      await _askForCheck(chatId, entry);
      return;
    }
    // Avval birlik narxini so'raymiz
    const pricePrompt = await sendMessage(chatId,
      `💰 <b>${order.product_name}</b> — birlik narxini kiriting (so'm da).\n` +
      `Miqdor: <b>${order.qty} ${order.unit}</b>\n\n` +
      `<i>Narxni bilmasangiz yoki kiritmoqchi bo'lmasangiz — <b>skip</b> deb yozing.</i>`);
    entry.prompt_msg_id = pricePrompt?.message_id;
    _qPush(pendingPrices, chatId, entry);
    return;
  }
  if (data.startsWith('reject_')) {
    const orderId = parseInt(data.replace('reject_', ''));
    const rejOrder = await db.get2("SELECT * FROM supply_orders WHERE id=?", [orderId]);
    await db.run2("UPDATE supply_orders SET status='cancelled', updated_at=datetime('now') WHERE id=?", [orderId]);
    saveDb();
    await answerCallbackQuery(query.id, { text: '❌ Rad etildi' });
    await editMessageReplyMarkup(chatId, msgId, { inline_keyboard: [] });
    await sendMessage(chatId, '❌ Buyurtma rad etildi.');
    // Ta'minotchiga ham xabar beramiz
    if (rejOrder && rejOrder.supplier_chat_id) {
      const invoiceTime = fmtTashkentTime(rejOrder.updated_at);
      await sendMessage(rejOrder.supplier_chat_id,
        `❌ <b>${rejOrder.product_name}</b> (${rejOrder.qty} ${rejOrder.unit}) uchun to'lov rad etildi.\n` +
        (invoiceTime ? `Siz ${invoiceTime} da yuborgan schet-faktura bo'yicha.\n` : '') +
        `Savollar bo'lsa operator bilan bog'laning: ${COMPANY_INFO.phone}`);
    }
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
    await answerCallbackQuery(query.id, { text: '✅ Miqdorlar so\'ralmoqda...' });
    // Har bir tovar uchun zakaz miqdorini admindan so'raymiz
    adminQtyFlow.set(String(chatId), { items: selected.map(it => ({ ...it })), idx: 0 });
    await sendMessage(chatId, `📦 <b>${selected.length} ta tovar tanlandi.</b>\nEndi har biri uchun zakaz miqdorini kiriting:`);
    await askNextQty(chatId);
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
  _botUsername = me.username || '';
  console.log(`[bot] ✅ @${_botUsername} tayyor`);

  // Bot tavsifi va bio
  await tg('setMyDescription', { description: 'SaTashkent Ta\'minot Bo\'limi boti.\n\nAdmin: ombor nazorati, zakaz tasdiqlash.\nTa\'minotchi: zakaz qabul qilish va schet-faktura yuborish.' });
  await tg('setMyShortDescription', { short_description: 'SaTashkent — Ta\'minot boshqaruv tizimi' });

  // Admin uchun buyruqlar (chat scope bilan)
  if (ADMIN_CHAT_ID) {
    await tg('setMyCommands', {
      commands: [
        { command: 'check',     description: '🔍 Ombor holatini tekshirish' },
        { command: 'orders',    description: '📋 Aktiv buyurtmalar' },
        { command: 'pending',   description: '⏳ Jarayondagi zakazlar' },
        { command: 'done',      description: '✅ Yetkazilgan zakazlar' },
        { command: 'suppliers', description: '🚚 Ta\'minotchilar ro\'yxati' },
        { command: 'stats',     description: '📊 Umumiy holat' },
        { command: 'help',      description: '❓ Yordam' }
      ],
      scope: { type: 'chat', chat_id: Number(ADMIN_CHAT_ID) }
    });
  }

  // Barcha ta'minotchilar uchun buyruqlar
  const sups = await db.all2("SELECT telegram_chat_id FROM suppliers WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id != ''");
  for (const s of sups) {
    await tg('setMyCommands', {
      commands: [
        { command: 'myzakaz',  description: '📦 Mening zakazlarim' },
        { command: 'jarayon',  description: '⏳ Jarayondagi zakazlar' },
        { command: 'help',     description: '❓ Yordam' }
      ],
      scope: { type: 'chat', chat_id: Number(s.telegram_chat_id) }
    });
  }
  _polling = true;
  _offset = 0; // navbatdagi xabarlardan boshlab o'qiymiz (birinchi /start ni o'tkazib yubormaslik)
  pollLoop();
  console.log(`[bot] ✅ Bot ishga tushdi: @${me.username} (long polling)`);

  // Avtomatik tekshiruv: startdan biroz keyin + har soatda bir marta
  const AUTO_CHECK_MS = 60 * 60 * 1000;
  setTimeout(autoCheckUrgent, 15000);
  setInterval(autoCheckUrgent, AUTO_CHECK_MS);
}

module.exports = { startBot, notifyLowStock, autoCheckUrgent, completeOrder, sendToSupplier, getBotUsername: () => _botUsername };
