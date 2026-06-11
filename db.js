const initSqlJs = require('sql.js');
const bcrypt    = require('bcryptjs');
const path      = require('path');
const fs        = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_FILE = path.join(dataDir, 'dashboard.db');

let sqlDb = null;

function saveDb() {
  const data = sqlDb.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// Wrap sql.js in promise-compatible API
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
    const cols = res[0].columns;
    const vals = res[0].values[0];
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return Promise.resolve(obj);
  },
  all2(sql, params = []) {
    const res = sqlDb.exec(sql, params);
    if (!res.length) return Promise.resolve([]);
    const cols = res[0].columns;
    return Promise.resolve(res[0].values.map(vals => {
      const obj = {};
      cols.forEach((c, i) => obj[c] = vals[i]);
      return obj;
    }));
  }
};

async function init() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    sqlDb = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin'
  )`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    manager TEXT,
    phone TEXT
  )`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT,
    daily_usage REAL DEFAULT 1,
    current_stock REAL DEFAULT 0,
    min_stock REAL DEFAULT 0,
    note TEXT
  )`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    quantity REAL,
    unit_price REAL,
    purchase_date TEXT,
    supplier TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  saveDb();
  await seedData();
}

async function seedData() {
  const row = await db.get2('SELECT COUNT(*) as cnt FROM users');
  if (row && row.cnt > 0) return;

  const hash = bcrypt.hashSync('admin123', 10);
  await db.run2("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')", ['admin', hash]);

  for (const c of ['Oziq-ovqat', "Yoqilg'i", "Uy-ro'zg'or", 'Elektr', 'Ofis'])
    await db.run2('INSERT OR IGNORE INTO categories (name) VALUES (?)', [c]);

  const branches = [
    ['Bosh ofis',  "Toshkent sh., Amir Temur ko'ch. 1",            'Aziz Karimov',    '+998901234567'],
    ['Filial №1',  "Chilonzor tumani, Bunyodkor ko'ch. 15",          'Sardor Yusupov',  '+998901234568'],
    ['Filial №2',  "Yunusobod tumani, Navoiy ko'ch. 45",             'Nilufar Rahimova','+998901234569'],
    ['Filial №3',  "Mirzo Ulug'bek tumani, Mustaqillik ko'ch. 22",   'Jasur Toshmatov', '+998901234570'],
  ];
  const bIds = [];
  for (const [name, addr, mgr, ph] of branches) {
    const r = await db.run2('INSERT INTO branches (name,address,manager,phone) VALUES (?,?,?,?)', [name, addr, mgr, ph]);
    bIds.push(r.lastID);
  }

  // [branch_idx, name, cat, unit, daily_usage, current_stock]
  const products = [
    [0,"Un (Bug'doy)",'Oziq-ovqat','kg',5,8],
    [0,'Guruch','Oziq-ovqat','kg',3,25],
    [0,'Benzin',"Yoqilg'i",'litr',20,15],
    [0,"Qog'oz (A4)",'Ofis','quti',2,12],
    [0,'Chiroq (LED)','Elektr','dona',0.5,1],
    [1,'Sabzi','Oziq-ovqat','kg',4,6],
    [1,'Piyoz','Oziq-ovqat','kg',3,20],
    [1,'Dizel yoqilgisi',"Yoqilg'i",'litr',15,5],
    [1,'Printer kartrij','Ofis','dona',0.5,3],
    [1,'Elektr simlar','Elektr','rulon',0.3,10],
    [2,'Kartoshka','Oziq-ovqat','kg',6,10],
    [2,"O'simlik yog'i",'Oziq-ovqat','litr',2,14],
    [2,'Gaz ballon',"Yoqilg'i",'dona',1,0],
    [2,'Ruchkalar (quti)','Ofis','quti',1,8],
    [2,'Rozetka (komplekt)','Elektr','dona',0.2,5],
    [3,'Makaron','Oziq-ovqat','kg',4,3],
    [3,'Tuz','Oziq-ovqat','kg',1,12],
    [3,'Moy (motor)',"Yoqilg'i",'litr',0.5,1],
    [3,"Uy jihozlari (to'plam)","Uy-ro'zg'or",'dona',0.1,8],
    [3,'Skotch lenta','Ofis','dona',2,20],
  ];
  const pIds = [];
  for (const [bi, name, cat, unit, du, stock] of products) {
    const r = await db.run2(
      'INSERT INTO products (branch_id,name,category,unit,daily_usage,current_stock) VALUES (?,?,?,?,?,?)',
      [bIds[bi], name, cat, unit, du, stock]
    );
    pIds.push(r.lastID);
  }

  function daysAgo(n) {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  // [prod_idx, qty, price, days_ago, supplier]
  const purchases = [
    [0,50,12000,60,'Anor Savdo'],[0,40,12500,30,'Bahor Bozor'],
    [1,100,8000,55,'Anor Savdo'],[1,60,8200,25,'Navbahor'],
    [2,100,10500,50,'Neft Savdo'],[2,200,11000,20,'Gasoline Co'],
    [3,20,45000,45,'Ofis Dunyo'],[3,25,46000,15,"Qog'oz Market"],
    [4,20,35000,40,'Elektr Bozor'],
    [5,40,3500,58,'Yangi Bozor'],[5,50,3800,28,'Fermer Mart'],
    [6,60,2500,53,'Yangi Bozor'],[6,80,2700,23,'Fermer Mart'],
    [7,200,9500,48,'Neft Savdo'],[7,180,10000,18,'Neft Savdo'],
    [8,10,45000,43,'TechStore'],
    [9,20,85000,38,'Elektr Bozor'],
    [10,100,2800,56,'Fermer Mart'],[10,120,3000,26,'Fermer Mart'],
    [11,50,15000,51,'Anor Savdo'],[11,60,15500,21,'Anor Savdo'],
    [12,10,55000,46,'Gaz Savdo'],
    [13,30,7000,41,'Ofis Dunyo'],
    [14,20,25000,36,'Elektr Bozor'],
    [15,80,6000,54,'Anor Savdo'],[15,100,6200,24,'Anor Savdo'],
    [16,50,1500,49,'Yangi Bozor'],
    [17,20,65000,44,'Neft Savdo'],
    [18,10,150000,39,'Uy-Joy Market'],
    [19,50,2500,34,'Ofis Dunyo'],[19,40,2700,4,'Ofis Dunyo'],
  ];
  for (const [pi, qty, price, ago, sup] of purchases) {
    await db.run2(
      'INSERT INTO purchases (product_id,quantity,unit_price,purchase_date,supplier) VALUES (?,?,?,?,?)',
      [pIds[pi], qty, price, daysAgo(ago), sup]
    );
  }
  console.log("✅ Ma'lumotlar bazasi tayyor (admin/admin123)");
}

module.exports = { db, init };
