// ─── reset-test-data.js ──────────────────────────────────────────────────────
// Test mahsulotlari, xaridlar, rasxodlar va buyurtmalarni o'chiradi.
// SAQLANADI: foydalanuvchilar, filiallar, ta'minotchilar, kategoriyalar.
//
// Ishlatish (server TO'XTATILGAN holatda):
//   node reset-test-data.js
//
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_FILE = path.join(__dirname, 'data', 'dashboard.db');

(async () => {
  if (!fs.existsSync(DB_FILE)) {
    console.log('❌ Baza topilmadi:', DB_FILE);
    process.exit(1);
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_FILE));

  const count = (t) => {
    try { const r = db.exec(`SELECT COUNT(*) FROM ${t}`); return r[0]?.values[0][0] ?? 0; }
    catch { return 0; }
  };

  console.log('── O\'chirishdan oldin ──');
  ['products', 'purchases', 'consumptions', 'supply_orders'].forEach(t =>
    console.log(`  ${t}: ${count(t)} ta`));

  // Mahsulotga bog'liq barcha ma'lumotlarni tozalash (jadval bo'lmasa o'tkazib yuboramiz)
  const wipe = (t) => { try { db.run(`DELETE FROM ${t}`); } catch (e) { console.log(`  (${t} jadvali yo'q — o'tkazildi)`); } };
  wipe('consumptions');
  wipe('purchases');
  wipe('supply_orders');
  wipe('products');
  // AUTOINCREMENT hisoblagichlarini nolga qaytarish (id qaytadan 1 dan boshlanadi)
  try { db.run("DELETE FROM sqlite_sequence WHERE name IN ('products','purchases','consumptions','supply_orders')"); } catch {}

  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));

  console.log('── O\'chirildi ✅ ──');
  console.log('Saqlandi: foydalanuvchilar, filiallar, ta\'minotchilar, kategoriyalar.');
  console.log('Endi serverni qayta ishga tushiring: node server.js');
  db.close();
})();
