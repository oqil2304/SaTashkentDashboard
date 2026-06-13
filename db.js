const initSqlJs = require('sql.js');
const bcrypt    = require('bcryptjs');
const path      = require('path');
const fs        = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_FILE = path.join(dataDir, 'dashboard.db');
let sqlDb = null;

function saveDb() {
  fs.writeFileSync(DB_FILE, Buffer.from(sqlDb.export()));
}

const db = {
  run2(sql, params = []) {
    sqlDb.run(sql, params);
    const id = sqlDb.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
    saveDb();
    return Promise.resolve({ lastID: id });
  },
  get2(sql, params = []) {
    const res = sqlDb.exec(sql, params);
    if (!res.length || !res[0].values.length) return Promise.resolve(null);
    const cols = res[0].columns, vals = res[0].values[0], obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return Promise.resolve(obj);
  },
  all2(sql, params = []) {
    const res = sqlDb.exec(sql, params);
    if (!res.length) return Promise.resolve([]);
    const cols = res[0].columns;
    return Promise.resolve(res[0].values.map(vals => {
      const obj = {}; cols.forEach((c, i) => obj[c] = vals[i]); return obj;
    }));
  }
};

async function init() {
  const SQL = await initSqlJs();
  sqlDb = fs.existsSync(DB_FILE)
    ? new SQL.Database(fs.readFileSync(DB_FILE))
    : new SQL.Database();

  sqlDb.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT DEFAULT 'admin')`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS branches (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, manager TEXT, phone TEXT)`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, branch_id INTEGER, name TEXT NOT NULL, category TEXT, unit TEXT, daily_usage REAL DEFAULT 1, current_stock REAL DEFAULT 0, min_stock REAL DEFAULT 0, note TEXT)`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, quantity REAL, unit_price REAL, purchase_date TEXT, supplier TEXT, note TEXT, created_at TEXT DEFAULT (datetime('now')))`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS consumptions (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, quantity REAL, from_branch_id INTEGER, to_branch_id INTEGER, consume_date TEXT, note TEXT, unit_price REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);

  // ── users jadvalini yangilash (eski bazada yangi ustunlar boʻlmasligi mumkin) ──
  ensureColumn('users', 'email', 'TEXT');
  ensureColumn('users', 'phone', 'TEXT');
  ensureColumn('users', 'full_name', 'TEXT');
  ensureColumn('users', 'status', "TEXT DEFAULT 'active'");
  ensureColumn('users', 'created_at', 'TEXT');
  ensureColumn('users', 'reset_code', 'TEXT');
  ensureColumn('users', 'reset_expires', 'INTEGER');
  ensureColumn('users', 'branch_id', 'INTEGER');
  ensureColumn('users', 'avatar', 'TEXT');
  ensureColumn('consumptions', 'unit_price', 'REAL DEFAULT 0');
  ensureColumn('purchases', 'remaining_qty', 'REAL');
  // Yangi ustun bo'sh bo'lsa — quantity bilan to'ldirish
  sqlDb.run('UPDATE purchases SET remaining_qty = quantity WHERE remaining_qty IS NULL');
  saveDb();
  await fifoInitRemainingQty();
  // Eski adminlar 'active' boʻlib qolsin
  sqlDb.run("UPDATE users SET status='active' WHERE status IS NULL OR status=''");

  // Filiallarning haqiqiy ma'lumotlari (faqat eski standart nomlar bo'lsa yangilanadi)
  for (const [oldName, name, addr, phone] of [
    ['Bosh ofis',  'Drujba filiali',    "Furqat ko'chasi, 15/1",            '+998 78 555 65 75'],
    ['Filial №1',  'Shahriston filiali', "Amir Temur shoh ko'chasi, 129B",  '+998 78 555 65 75'],
    ['Filial №2',  'Buxoro filiali',     "Buxoro, Mustaqillik ko'chasi, 19", '+998 78 555 65 75'],
    ['Filial №3',  'Andijon filiali',    "Andijon, Mashrab ko'chasi, 7",     '+998 78 555 65 75'],
  ]) {
    sqlDb.run('UPDATE branches SET name=?, address=?, phone=? WHERE name=?', [name, addr, phone, oldName]);
  }
  saveDb();

  saveDb();
  await seedData();
  await seedMoreProducts();
}

// Ustun mavjud boʻlmasa qoʻshish (sql.js da ALTER TABLE ADD COLUMN)
function ensureColumn(table, col, type) {
  const info = sqlDb.exec(`PRAGMA table_info(${table})`);
  const cols = info.length ? info[0].values.map(v => v[1]) : [];
  if (!cols.includes(col)) sqlDb.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
}

async function seedData() {
  const row = await db.get2('SELECT COUNT(*) as cnt FROM users');
  if (row && row.cnt > 0) return;

  await db.run2("INSERT INTO users (username,password_hash,role,status,full_name,email,created_at) VALUES (?,?,'admin','active',?,?,datetime('now'))",
    ['admin', bcrypt.hashSync('admin123', 10), 'Administrator', 'admin@satashkent.uz']);
  for (const c of ['Oziq-ovqat', "Yoqilg'i", "Uy-ro'zg'or", 'Elektr', 'Ofis'])
    await db.run2('INSERT OR IGNORE INTO categories (name) VALUES (?)', [c]);

  const bIds = [];
  for (const [n, a, m, p] of [
    ['Drujba filiali', "Furqat ko'chasi, 15/1", 'Aziz Karimov', '+998 78 555 65 75'],
    ['Shahriston filiali', "Amir Temur shoh ko'chasi, 129B", 'Sardor Yusupov', '+998 78 555 65 75'],
    ['Buxoro filiali', "Buxoro, Mustaqillik ko'chasi, 19", 'Nilufar Rahimova', '+998 78 555 65 75'],
    ['Andijon filiali', "Andijon, Mashrab ko'chasi, 7", 'Jasur Toshmatov', '+998 78 555 65 75'],
  ]) { const r = await db.run2('INSERT INTO branches (name,address,manager,phone) VALUES (?,?,?,?)', [n,a,m,p]); bIds.push(r.lastID); }

  const pIds = [];
  for (const [bi,n,c,u,du,s] of [
    [0,"Un (Bug'doy)",'Oziq-ovqat','kg',5,8],[0,'Guruch','Oziq-ovqat','kg',3,25],
    [0,'Benzin',"Yoqilg'i",'litr',20,15],[0,"Qog'oz (A4)",'Ofis','quti',2,12],[0,'Chiroq (LED)','Elektr','dona',0.5,1],
    [1,'Sabzi','Oziq-ovqat','kg',4,6],[1,'Piyoz','Oziq-ovqat','kg',3,20],
    [1,'Dizel yoqilgisi',"Yoqilg'i",'litr',15,5],[1,'Printer kartrij','Ofis','dona',0.5,3],[1,'Elektr simlar','Elektr','rulon',0.3,10],
    [2,'Kartoshka','Oziq-ovqat','kg',6,10],[2,"O'simlik yog'i",'Oziq-ovqat','litr',2,14],
    [2,'Gaz ballon',"Yoqilg'i",'dona',1,0],[2,'Ruchkalar (quti)','Ofis','quti',1,8],[2,'Rozetka (komplekt)','Elektr','dona',0.2,5],
    [3,'Makaron','Oziq-ovqat','kg',4,3],[3,'Tuz','Oziq-ovqat','kg',1,12],
    [3,'Moy (motor)',"Yoqilg'i",'litr',0.5,1],[3,"Uy jihozlari (to'plam)","Uy-ro'zg'or",'dona',0.1,8],[3,'Skotch lenta','Ofis','dona',2,20],
  ]) { const r = await db.run2('INSERT INTO products (branch_id,name,category,unit,daily_usage,current_stock) VALUES (?,?,?,?,?,?)',[bIds[bi],n,c,u,du,s]); pIds.push(r.lastID); }

  function dA(n) { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
  for (const [pi,q,p,ago,s] of [
    [0,50,12000,60,'Anor Savdo'],[0,40,12500,30,'Bahor Bozor'],
    [1,100,8000,55,'Anor Savdo'],[1,60,8200,25,'Navbahor'],
    [2,100,10500,50,'Neft Savdo'],[2,200,11000,20,'Gasoline Co'],
    [3,20,45000,45,'Ofis Dunyo'],[3,25,46000,15,"Qog'oz Market"],
    [4,20,35000,40,'Elektr Bozor'],
    [5,40,3500,58,'Yangi Bozor'],[5,50,3800,28,'Fermer Mart'],
    [6,60,2500,53,'Yangi Bozor'],[6,80,2700,23,'Fermer Mart'],
    [7,200,9500,48,'Neft Savdo'],[7,180,10000,18,'Neft Savdo'],
    [8,10,45000,43,'TechStore'],[9,20,85000,38,'Elektr Bozor'],
    [10,100,2800,56,'Fermer Mart'],[10,120,3000,26,'Fermer Mart'],
    [11,50,15000,51,'Anor Savdo'],[11,60,15500,21,'Anor Savdo'],
    [12,10,55000,46,'Gaz Savdo'],[13,30,7000,41,'Ofis Dunyo'],
    [14,20,25000,36,'Elektr Bozor'],
    [15,80,6000,54,'Anor Savdo'],[15,100,6200,24,'Anor Savdo'],
    [16,50,1500,49,'Yangi Bozor'],[17,20,65000,44,'Neft Savdo'],
    [18,10,150000,39,'Uy-Joy Market'],
    [19,50,2500,34,'Ofis Dunyo'],[19,40,2700,4,'Ofis Dunyo'],
  ]) await db.run2('INSERT INTO purchases (product_id,quantity,unit_price,purchase_date,supplier) VALUES (?,?,?,?,?)',[pIds[pi],q,p,dA(ago),s]);

  console.log("✅ Ma'lumotlar bazasi tayyor (admin/admin123)");
}

async function seedMoreProducts() {
  const row = await db.get2('SELECT COUNT(*) as cnt FROM products');
  if (row && row.cnt >= 35) return;

  // Filiallarni topamiz
  const branchRows = await db.all2('SELECT id, name FROM branches ORDER BY id');
  if (branchRows.length < 4) return;
  const bIds = branchRows.map(b => b.id);

  function dA(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; }

  // Qo'shimcha mahsulotlar: [branch_index, name, category, unit, daily_usage, current_stock]
  const extraProducts = [
    [0, 'Choy (qora)',        'Oziq-ovqat',   'kg',   0.3,  2],
    [0, 'Shakar',             'Oziq-ovqat',   'kg',   1.5,  18],
    [0, 'Printer qog\'oz',   'Ofis',          'quti', 0.8,  5],
    [0, 'Qo\'l sovuni',      "Uy-ro'zg'or",  'dona', 2,    4],
    [1, 'Limon',              'Oziq-ovqat',   'kg',   1,    3],
    [1, 'Pomidor',            'Oziq-ovqat',   'kg',   5,    8],
    [1, 'Bolg\'or qalampir', 'Oziq-ovqat',   'kg',   2,    6],
    [1, 'Stol uchun lampa',  'Elektr',        'dona', 0.1,  1],
    [2, 'Non (bug\'doy)',     'Oziq-ovqat',   'dona', 10,   20],
    [2, 'Sut',               'Oziq-ovqat',    'litr', 3,    5],
    [2, 'Tvorog',            'Oziq-ovqat',    'kg',   1,    2],
    [2, 'Sanitariya spirt',  "Uy-ro'zg'or",  'litr', 0.5,  1],
    [3, 'Yog\' (sariyog\')', 'Oziq-ovqat',   'kg',   1,    3],
    [3, 'Qahva',             'Oziq-ovqat',    'gr',   50,   400],
    [3, 'Suv (ichimlik)',    'Oziq-ovqat',    'litr', 20,   60],
    [3, 'Printer kartrij',   'Ofis',          'dona', 0.3,  1],
    [0, 'Kleynoks',          "Uy-ro'zg'or",  'quti', 3,    10],
    [1, 'Avtobus gazi',      "Yoqilg'i",     'litr', 25,   30],
    [2, 'USB flesh karta',   'Ofis',          'dona', 0.1,  3],
    [3, 'Elektr uzaytirkich','Elektr',        'dona', 0.1,  2],
  ];

  const newPids = [];
  for (const [bi, n, c, u, du, s] of extraProducts) {
    const r = await db.run2(
      'INSERT INTO products (branch_id,name,category,unit,daily_usage,current_stock) VALUES (?,?,?,?,?,?)',
      [bIds[bi], n, c, u, du, s]
    );
    newPids.push(r.lastID);
  }

  // Har xil oylarda xaridlar: [product_index, qty, price, days_ago, supplier]
  const extraPurchases = [
    [0,  5,  85000, 175, 'Hamkor Savdo'],  [0,  4,  87000, 145, 'Hamkor Savdo'],
    [0,  6,  86000,  90, 'Hamkor Savdo'],  [0,  3,  88000,  30, 'Hamkor Savdo'],
    [1, 50,   7500, 170, 'Ulgurji Bozor'], [1, 60,   7800, 130, 'Ulgurji Bozor'],
    [1, 40,   7600,  80, 'Yangi Bozor'],   [1, 55,   8000,  20, 'Yangi Bozor'],
    [2, 10,  32000, 165, 'Ofis Pro'],      [2,  8,  33000, 110, 'Ofis Pro'],
    [2, 12,  34000,  60, 'Ofis Dunyo'],    [2,  5,  35000,  10, 'Ofis Dunyo'],
    [3, 20,  15000, 160, 'Arzon Bozor'],   [3, 25,  15500, 100, 'Arzon Bozor'],
    [3, 30,  16000,  50, 'Hamkor Savdo'],
    [4, 30,   3500, 180, 'Fermer Mart'],   [4, 40,   3700, 120, 'Fermer Mart'],
    [4, 50,   3600,  70, 'Yangi Bozor'],   [4, 35,   3800,  15, 'Yangi Bozor'],
    [5, 20,   5000, 175, 'Uzum Fermer'],   [5, 25,   5200, 115, 'Uzum Fermer'],
    [5, 18,   5100,  65, 'Yangi Bozor'],
    [6, 15,   4500, 170, 'Fermer Mart'],   [6, 20,   4700, 110, 'Fermer Mart'],
    [7,  5,  95000, 155, 'TechStore'],     [7,  3, 100000,  85, 'TechStore'],
    [8, 30,  12000, 168, 'Non Zavod'],     [8, 40,  12500, 108, 'Non Zavod'],
    [8, 35,  13000,  58, 'Non Zavod'],     [8, 50,  13200,   8, 'Non Zavod'],
    [9, 20,  18000, 162, 'Sut Ferma'],     [9, 25,  18500, 102, 'Sut Ferma'],
    [9, 15,  19000,  52, 'Sut Ferma'],
    [10,  5, 35000, 158, 'Sut Ferma'],     [10,  4, 36000,  98, 'Sut Ferma'],
    [11,  5, 45000, 150, 'Med Savdo'],     [11,  3, 46000,  90, 'Med Savdo'],
    [12,  8, 95000, 145, 'Yog\' Savdo'],   [12, 10, 97000,  85, 'Yog\' Savdo'],
    [13, 500, 3500, 140, 'Hamkor Savdo'],  [13, 400, 3600,  80, 'Hamkor Savdo'],
    [14, 100,  9500, 135, 'Suv Savdo'],    [14, 150,  9800,  75, 'Suv Savdo'],
    [14, 200, 10000,  25, 'Suv Savdo'],
    [15,  3, 85000, 130, 'TechStore'],     [15,  2, 87000,  70, 'TechStore'],
    [16, 50,  8500, 125, 'Arzon Bozor'],   [16, 40,  8700,  65, 'Arzon Bozor'],
    [17, 100, 9000, 120, 'Neft Savdo'],    [17, 150, 9200,  60, 'Neft Savdo'],
    [17, 200, 9500,  10, 'Neft Savdo'],
    [18,  5, 55000, 115, 'TechStore'],     [19,  5, 75000, 110, 'Elektr Bozor'],
  ];

  for (const [pi, q, p, ago, s] of extraPurchases) {
    if (pi >= newPids.length) continue;
    await db.run2(
      'INSERT INTO purchases (product_id,quantity,unit_price,purchase_date,supplier) VALUES (?,?,?,?,?)',
      [newPids[pi], q, p, dA(ago), s]
    );
  }

  console.log(`✅ Qo'shimcha ${extraProducts.length} ta mahsulot va ${extraPurchases.length} ta xarid qo'shildi`);
}

// FIFO: har mahsulot uchun remaining_qty ni current_stock asosida hisoblash
async function fifoInitRemainingQty() {
  // Faqat birinchi marta yoki ma'lumotlar mos kelmasa ishlaydi
  const prods = await db.all2('SELECT id, current_stock FROM products');
  for (const p of prods) {
    const batches = await db.all2(
      'SELECT * FROM purchases WHERE product_id=? ORDER BY purchase_date ASC, id ASC', [p.id]
    );
    if (!batches.length) continue;
    const totalPurchased = batches.reduce((s, b) => s + (b.quantity || 0), 0);
    let consumed = totalPurchased - (p.current_stock || 0);
    if (consumed < 0) consumed = 0;
    for (const batch of batches) {
      const take = Math.min(batch.quantity, consumed);
      const rem  = +(batch.quantity - take).toFixed(4);
      sqlDb.run('UPDATE purchases SET remaining_qty=? WHERE id=?', [rem, batch.id]);
      consumed -= take;
      if (consumed <= 0) break;
    }
  }
  saveDb();
}

module.exports = { db, init };
