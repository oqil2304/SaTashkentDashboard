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
let _botUsername = '';

const approvalSessions = new Map();  // message_id → { items, chat_id }
const pendingInvoices  = new Map();  // supplier_chat_id → [ {order_id, msg_id, ...}, ... ] (FIFO navbat)
const invoiceByReply   = new Map();  // bot_msg_id → entry  (ta'minotchi reply qilsa aniq topiladi)
const adminQtyFlow     = new Map();  // admin chat_id → { items, idx }
const pendingChecks    = new Map();  // admin chat_id → [ {order_id, prompt_msg_id, ...}, ... ] (FIFO navbat)
const checkByReply     = new Map();  // bot_prompt_msg_id → entry

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

function qtyForOrder(p) {
  const TARGET_DAYS = 30;
  let raw = Math.max(0, TARGET_DAYS * (p.daily_usage || 0) - (p.current_stock || 0));
  // Kunlik sarfi noma'lum, lekin tovar tugagan — kamida 1 birlik taklif qilamiz
  if (raw <= 0 && (p.current_stock || 0) <= 0) raw = 1;
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
  const items = buildGroupedItems(prods);
  const msg = await sendMessage(ADMIN_CHAT_ID, buildApprovalText(items), { reply_markup: buildApprovalKeyboard(items) });
  if (msg) approvalSessions.set(msg.message_id, { items, chat_id: ADMIN_CHAT_ID });
  console.log(`[bot] Admin ga ${items.length} ta guruh (${prods.length} ta tovar) ro'yxati yuborildi`);
}

// Bir xil nomli mahsulotlarni (sintaksisi boshqacha) bitta guruhga jamlash
function buildGroupedItems(prods) {
  const raw = prods.map(p => ({
    product_id: p.id, name: p.name, unit: p.unit || '', qty: qtyForOrder(p),
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
    const items = buildGroupedItems(fresh);
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

  for (const m of members) {
    if (!m.product_id || !(m.qty > 0)) continue;
    await db.run2(
      `INSERT INTO purchases (product_id, quantity, unit_price, purchase_date, supplier, note, remaining_qty, created_at)
       VALUES (?, ?, ?, date('now'), ?, 'Telegram bot orqali zakaz', ?, datetime('now'))`,
      [m.product_id, m.qty, order.unit_price || 0, order.supplier_name || '', m.qty]);
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
  await sendMessage(chatId,
    `📝 <b>${it.name}</b> — qancha zakas qilamiz?\n` +
    `Qoldiq: ${it.stock} ${it.unit} | Taklif: <b>${it.qty} ${it.unit}</b>\n\n` +
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

  // ── Admin holatlari: miqdor kiritish va to'lov cheki ──────────────────────
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

    // 2) To'lov cheki kutilmoqda (bir vaqtda bir nechta bo'lishi mumkin)
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

  // Ta'minotchidan faktura (admin emas + kutilayotgan zakaz bor)
  const queue = _qGet(pendingInvoices, chatId);
  if (!queue.length) return;

  // Qaysi zakaz uchun? reply qilingan bo'lsa — aniq, aks holda navbatdagi birinchisi (FIFO)
  const rid = msg.reply_to_message?.message_id;
  const pending = (rid && invoiceByReply.get(rid)) || queue[0];

  let fileId = null, mimeType = 'image/jpeg';
  if (msg.document) { fileId = msg.document.file_id; mimeType = msg.document.mime_type || 'application/pdf'; }
  else if (msg.photo) { fileId = msg.photo[msg.photo.length - 1].file_id; mimeType = 'image/jpeg'; }
  else if (text) { fileId = 'text:' + text; mimeType = 'text/plain'; }
  if (!fileId) return;

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
    const prompt = await sendMessage(chatId,
      `🧾 <b>${order.product_name}</b> — to'lov chekini (rasm yoki PDF) yuboring.\n` +
      `U ta'minotchiga yuboriladi va tovar omborga kiritiladi.\n` +
      `<i>💡 Bir nechta to'lov bo'lsa, chekni aynan shu xabarga "reply" qiling.</i>\n\n` +
      `(Cheksiz davom ettirish uchun shu xabarga <b>skip</b> deb yozing)`);
    const entry = {
      order_id: orderId, supplier_chat_id: order.supplier_chat_id,
      product_name: order.product_name, qty: order.qty, unit: order.unit,
      prompt_msg_id: prompt?.message_id
    };
    _qPush(pendingChecks, chatId, entry);
    if (prompt) checkByReply.set(prompt.message_id, entry);
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
