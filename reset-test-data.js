// ─── reset-test-data.js ──────────────────────────────────────────────────────
// Test mahsulotlari, xaridlar, rasxodlar va buyurtmalarni o'chiradi.
// SAQLANADI: foydalanuvchilar, filiallar, ta'minotchilar, kategoriyalar.
//
// Ishlatish (server TO'XTATILGAN holatda):
//   node reset-test-data.js
//
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_FILE = path.join(__dirname, 'data', 'dashboard.db');

if (!fs.existsSync(DB_FILE)) {
  console.log('❌ Baza topilmadi:', DB_FILE);
  process.exit(1);
}
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');

const count = (t) => {
  try { return db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c ?? 0; }
  catch { return 0; }
};

console.log('── O\'chirishdan oldin ──');
['products', 'purchases', 'consumptions', 'supply_orders'].forEach(t =>
  console.log(`  ${t}: ${count(t)} ta`));

const wipe = (t) => { try { db.prepare(`DELETE FROM ${t}`).run(); } catch (e) { console.log(`  (${t} jadvali yo'q — o'tkazildi)`); } };
wipe('consumptions');
wipe('purchases');
wipe('supply_orders');
wipe('products');
// AUTOINCREMENT hisoblagichlarini nolga qaytarish (id qaytadan 1 dan boshlanadi)
try { db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('products','purchases','consumptions','supply_orders')").run(); } catch {}

// Test mahsulotlari qayta qo'shilmasligi uchun seed bayrog'ini o'rnatamiz
try {
  db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
  db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('demo_seeded','1')").run();
} catch (e) { console.log('  (bayroq o\'rnatishda xato:', e.message, ')'); }

console.log('── O\'chirildi ✅ ──');
console.log('Saqlandi: foydalanuvchilar, filiallar, ta\'minotchilar, kategoriyalar.');
console.log('Endi serverni qayta ishga tushiring: node server.js');
db.close();
