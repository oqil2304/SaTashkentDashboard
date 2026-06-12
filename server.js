const express      = require('express');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const path         = require('path');
const { db, init } = require('./db');

const app        = express();
const JWT_SECRET = 'satashkent_jwt_2026';
const PORT       = 8080;

app.use(express.json());
app.use(cookieParser());
// Statik fayllarni keshlamaslik — brauzer doim yangi app.js/style.css oladi
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
}));

function auth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Kirish talab etiladi' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Token noto'g'ri" }); }
}

// Faqat admin uchun (foydalanuvchilarni boshqarish, maʼlumot oʻzgartirish)
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Bu amal uchun administrator huquqi kerak' });
  next();
}

function noCache(res) { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); }

app.get('/', (req, res) => {
  noCache(res);
  const token = req.cookies.token;
  if (token) { try { jwt.verify(token, JWT_SECRET); return res.redirect('/dashboard'); } catch {} }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
// Toza login sahifasi — brauzer keshidan qatʼiy nazar har doim login formani koʻrsatadi
app.get('/login', (req, res) => {
  noCache(res);
  res.clearCookie('token');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
// Sessiya yaroqsiz boʻlsa — 401 JSON emas, login sahifasiga yoʻnaltirish (sikl boʻlmaydi)
app.get('/dashboard', (req, res) => {
  noCache(res);
  const token = req.cookies.token;
  if (!token) return res.redirect('/');
  try { jwt.verify(token, JWT_SECRET); }
  catch { return res.redirect('/'); }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login — username YOKI email bilan kirish; status tekshiriladi
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Login va parol kerak' });
  try {
    const id = String(username).trim().toLowerCase();
    const user = await db.get2('SELECT * FROM users WHERE lower(username)=? OR lower(email)=?', [id, id]);
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: "Login yoki parol noto'g'ri" });
    if (user.status === 'pending')
      return res.status(403).json({ error: 'Akkauntingiz hali admin tomonidan tasdiqlanmagan' });
    if (user.status === 'blocked')
      return res.status(403).json({ error: 'Akkauntingiz bloklangan' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7*24*60*60*1000 });
    res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Roʻyxatdan oʻtish — status 'pending', rol 'user' (admin tasdiqlaydi)
app.post('/api/auth/register', async (req, res) => {
  const { username, password, email, phone, full_name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Login va parol kerak' });
  if (!email && !phone) return res.status(400).json({ error: 'Gmail yoki telefon raqam kerak' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Parol kamida 4 belgidan iborat boʻlsin' });
  try {
    const uname = String(username).trim();
    const exists = await db.get2('SELECT id FROM users WHERE lower(username)=? OR (email IS NOT NULL AND email<>"" AND lower(email)=?)',
      [uname.toLowerCase(), String(email||'').trim().toLowerCase()]);
    if (exists) return res.status(409).json({ error: 'Bu login yoki email allaqachon mavjud' });
    await db.run2(
      "INSERT INTO users (username,password_hash,role,status,email,phone,full_name,created_at) VALUES (?,?,'user','pending',?,?,?,datetime('now'))",
      [uname, bcrypt.hashSync(password, 10), String(email||'').trim(), String(phone||'').trim(), String(full_name||'').trim()]
    );
    res.status(201).json({ success: true, message: 'Akkaunt yaratildi. Admin tasdiqlagach kira olasiz.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Parolni unutdim — tiklash kodini yaratish (ekranda koʻrsatiladi)
app.post('/api/auth/forgot', async (req, res) => {
  const { account } = req.body || {};
  if (!account) return res.status(400).json({ error: 'Login yoki email kiriting' });
  try {
    const id = String(account).trim().toLowerCase();
    const user = await db.get2('SELECT * FROM users WHERE lower(username)=? OR lower(email)=?', [id, id]);
    // Maxfiylik uchun foydalanuvchi yoʻqligini oshkor qilmaymiz, lekin localhost — kodni qaytaramiz
    if (!user) return res.status(404).json({ error: 'Bunday login yoki email topilmadi' });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = Date.now() + 15 * 60 * 1000; // 15 daqiqa
    await db.run2('UPDATE users SET reset_code=?, reset_expires=? WHERE id=?', [code, expires, user.id]);
    res.json({ success: true, code, username: user.username, message: 'Tiklash kodi yaratildi (15 daqiqa amal qiladi)' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kod orqali yangi parol oʻrnatish
app.post('/api/auth/reset', async (req, res) => {
  const { account, code, password } = req.body || {};
  if (!account || !code || !password) return res.status(400).json({ error: 'Barcha maydonlar kerak' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Parol kamida 4 belgidan iborat boʻlsin' });
  try {
    const id = String(account).trim().toLowerCase();
    const user = await db.get2('SELECT * FROM users WHERE lower(username)=? OR lower(email)=?', [id, id]);
    if (!user || !user.reset_code || String(user.reset_code) !== String(code).trim())
      return res.status(400).json({ error: "Kod noto'g'ri" });
    if (!user.reset_expires || Date.now() > user.reset_expires)
      return res.status(400).json({ error: 'Kod muddati tugagan, qaytadan urinib koʻring' });
    await db.run2('UPDATE users SET password_hash=?, reset_code=NULL, reset_expires=NULL WHERE id=?',
      [bcrypt.hashSync(password, 10), user.id]);
    res.json({ success: true, message: 'Parol yangilandi, endi kirishingiz mumkin' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/logout', (req, res) => { res.clearCookie('token'); res.json({ success: true }); });

app.get('/api/me', auth, async (req, res) => {
  try {
    const u = await db.get2('SELECT id,username,role,email,phone,full_name,status,created_at FROM users WHERE id=?', [req.user.id]);
    res.json(u || { id: req.user.id, username: req.user.username, role: req.user.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Shaxsiy kabinet — oʻz maʼlumotlarini yangilash ──
app.put('/api/profile', auth, async (req, res) => {
  const { full_name, email, phone, current_password, new_password } = req.body || {};
  try {
    const user = await db.get2('SELECT * FROM users WHERE id=?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    // Parol oʻzgartirilayotgan boʻlsa — joriy parol tekshiriladi
    let passHash = user.password_hash;
    if (new_password) {
      if (!current_password || !bcrypt.compareSync(current_password, user.password_hash))
        return res.status(400).json({ error: "Joriy parol noto'g'ri" });
      if (String(new_password).length < 4) return res.status(400).json({ error: 'Yangi parol kamida 4 belgidan iborat boʻlsin' });
      passHash = bcrypt.hashSync(new_password, 10);
    }
    await db.run2('UPDATE users SET full_name=?, email=?, phone=?, password_hash=? WHERE id=?',
      [String(full_name||'').trim(), String(email||'').trim(), String(phone||'').trim(), passHash, req.user.id]);
    res.json({ success: true, message: 'Maʼlumotlar yangilandi' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: foydalanuvchilarni boshqarish ──
app.get('/api/users', auth, adminOnly, async (req, res) => {
  try {
    res.json(await db.all2('SELECT id,username,role,email,phone,full_name,status,created_at FROM users ORDER BY id'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Holatni oʻzgartirish (tasdiqlash/bloklash)
app.put('/api/users/:id/status', auth, adminOnly, async (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'pending', 'blocked'].includes(status)) return res.status(400).json({ error: 'Notoʻgʻri holat' });
  try {
    await db.run2('UPDATE users SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Rolni oʻzgartirish
app.put('/api/users/:id/role', auth, adminOnly, async (req, res) => {
  const { role } = req.body || {};
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Notoʻgʻri rol' });
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Oʻz rolingizni oʻzgartira olmaysiz' });
  try {
    await db.run2('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Boshqa foydalanuvchi parolini almashtirish
app.put('/api/users/:id/password', auth, adminOnly, async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 4) return res.status(400).json({ error: 'Parol kamida 4 belgidan iborat boʻlsin' });
  try {
    await db.run2('UPDATE users SET password_hash=?, reset_code=NULL, reset_expires=NULL WHERE id=?',
      [bcrypt.hashSync(password, 10), req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Foydalanuvchini oʻchirish
app.delete('/api/users/:id', auth, adminOnly, async (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Oʻzingizni oʻchira olmaysiz' });
  try {
    await db.run2('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Branches
app.get('/api/branches', auth, async (req, res) => {
  try { res.json(await db.all2('SELECT * FROM branches ORDER BY id')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/branches', auth, adminOnly, async (req, res) => {
  const { name, address, manager, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'Nomi kerak' });
  try {
    const r = await db.run2('INSERT INTO branches (name,address,manager,phone) VALUES (?,?,?,?)', [name, address||'', manager||'', phone||'']);
    res.status(201).json(await db.get2('SELECT * FROM branches WHERE id=?', [r.lastID]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/branches/:id', auth, adminOnly, async (req, res) => {
  const { name, address, manager, phone } = req.body;
  try {
    await db.run2('UPDATE branches SET name=?,address=?,manager=?,phone=? WHERE id=?', [name, address||'', manager||'', phone||'', req.params.id]);
    res.json(await db.get2('SELECT * FROM branches WHERE id=?', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/branches/:id', auth, adminOnly, async (req, res) => {
  try { await db.run2('DELETE FROM branches WHERE id=?', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Products
app.get('/api/products', auth, async (req, res) => {
  let sql = 'SELECT p.*,b.name as branch_name FROM products p LEFT JOIN branches b ON p.branch_id=b.id WHERE 1=1';
  const params = [];
  if (req.query.branch_id) { sql += ' AND p.branch_id=?'; params.push(req.query.branch_id); }
  if (req.query.category)  { sql += ' AND p.category=?';  params.push(req.query.category); }
  try { res.json(await db.all2(sql + ' ORDER BY p.id', params)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/products', auth, adminOnly, async (req, res) => {
  const { branch_id, name, category, unit, daily_usage, current_stock, min_stock, note } = req.body;
  if (!name) return res.status(400).json({ error: 'Nomi kerak' });
  try {
    const r = await db.run2(
      'INSERT INTO products (branch_id,name,category,unit,daily_usage,current_stock,min_stock,note) VALUES (?,?,?,?,?,?,?,?)',
      [branch_id||null, name, category||'', unit||'', daily_usage||0, current_stock||0, min_stock||0, note||'']
    );
    res.status(201).json(await db.get2('SELECT p.*,b.name as branch_name FROM products p LEFT JOIN branches b ON p.branch_id=b.id WHERE p.id=?', [r.lastID]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/products/:id', auth, adminOnly, async (req, res) => {
  const { branch_id, name, category, unit, daily_usage, current_stock, min_stock, note } = req.body;
  try {
    await db.run2('UPDATE products SET branch_id=?,name=?,category=?,unit=?,daily_usage=?,current_stock=?,min_stock=?,note=? WHERE id=?',
      [branch_id||null, name, category||'', unit||'', daily_usage||0, current_stock||0, min_stock||0, note||'', req.params.id]);
    res.json(await db.get2('SELECT p.*,b.name as branch_name FROM products p LEFT JOIN branches b ON p.branch_id=b.id WHERE p.id=?', [req.params.id]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/products/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.run2('DELETE FROM purchases WHERE product_id=?', [req.params.id]);
    await db.run2('DELETE FROM consumptions WHERE product_id=?', [req.params.id]);
    await db.run2('DELETE FROM products WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Purchases
app.get('/api/purchases', auth, async (req, res) => {
  let sql = `SELECT pu.*,pr.name as product_name,pr.unit,b.name as branch_name,b.id as branch_id
             FROM purchases pu LEFT JOIN products pr ON pu.product_id=pr.id LEFT JOIN branches b ON pr.branch_id=b.id WHERE 1=1`;
  const params = [];
  if (req.query.product_id) { sql += ' AND pu.product_id=?'; params.push(req.query.product_id); }
  if (req.query.branch_id)  { sql += ' AND b.id=?'; params.push(req.query.branch_id); }
  if (req.query.date_from)  { sql += ' AND pu.purchase_date>=?'; params.push(req.query.date_from); }
  if (req.query.date_to)    { sql += ' AND pu.purchase_date<=?'; params.push(req.query.date_to); }
  try { res.json(await db.all2(sql + ' ORDER BY pu.purchase_date DESC,pu.id DESC', params)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/purchases', auth, adminOnly, async (req, res) => {
  const { product_id, quantity, unit_price, purchase_date, supplier, note } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'Mahsulot va miqdor kerak' });
  try {
    const r = await db.run2(
      'INSERT INTO purchases (product_id,quantity,unit_price,purchase_date,supplier,note) VALUES (?,?,?,?,?,?)',
      [product_id, quantity, unit_price||0, purchase_date||new Date().toISOString().split('T')[0], supplier||'', note||'']
    );
    await db.run2('UPDATE products SET current_stock=current_stock+? WHERE id=?', [quantity, product_id]);
    res.status(201).json(await db.get2(
      'SELECT pu.*,pr.name as product_name,pr.unit,b.name as branch_name,b.id as branch_id FROM purchases pu LEFT JOIN products pr ON pu.product_id=pr.id LEFT JOIN branches b ON pr.branch_id=b.id WHERE pu.id=?',
      [r.lastID]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/purchases/:id', auth, adminOnly, async (req, res) => {
  const { product_id, quantity, unit_price, purchase_date, supplier, note } = req.body;
  try {
    const old = await db.get2('SELECT * FROM purchases WHERE id=?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Topilmadi' });
    await db.run2('UPDATE products SET current_stock=current_stock-? WHERE id=?', [old.quantity, old.product_id]);
    await db.run2('UPDATE products SET current_stock=current_stock+? WHERE id=?', [quantity, product_id]);
    await db.run2('UPDATE purchases SET product_id=?,quantity=?,unit_price=?,purchase_date=?,supplier=?,note=? WHERE id=?',
      [product_id, quantity, unit_price||0, purchase_date, supplier||'', note||'', req.params.id]);
    res.json(await db.get2(
      'SELECT pu.*,pr.name as product_name,pr.unit,b.name as branch_name,b.id as branch_id FROM purchases pu LEFT JOIN products pr ON pu.product_id=pr.id LEFT JOIN branches b ON pr.branch_id=b.id WHERE pu.id=?',
      [req.params.id]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/purchases/:id', auth, adminOnly, async (req, res) => {
  try {
    const p = await db.get2('SELECT * FROM purchases WHERE id=?', [req.params.id]);
    if (p) await db.run2('UPDATE products SET current_stock=current_stock-? WHERE id=?', [p.quantity, p.product_id]);
    await db.run2('DELETE FROM purchases WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Consumptions (Rasxod — ombordan chiqim)
const CONS_SELECT = `SELECT co.*, pr.name as product_name, pr.unit,
    fb.name as from_branch_name, tb.name as to_branch_name
  FROM consumptions co
  LEFT JOIN products pr ON co.product_id=pr.id
  LEFT JOIN branches fb ON co.from_branch_id=fb.id
  LEFT JOIN branches tb ON co.to_branch_id=tb.id`;

app.get('/api/consumptions', auth, async (req, res) => {
  let sql = CONS_SELECT + ' WHERE 1=1';
  const params = [];
  if (req.query.to_branch_id) { sql += ' AND co.to_branch_id=?'; params.push(req.query.to_branch_id); }
  if (req.query.date_from)    { sql += ' AND co.consume_date>=?'; params.push(req.query.date_from); }
  if (req.query.date_to)      { sql += ' AND co.consume_date<=?'; params.push(req.query.date_to); }
  try { res.json(await db.all2(sql + ' ORDER BY co.consume_date DESC, co.id DESC', params)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/consumptions', auth, adminOnly, async (req, res) => {
  const { product_id, quantity, to_branch_id, consume_date, note } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'Mahsulot va miqdor kerak' });
  try {
    const prod = await db.get2('SELECT * FROM products WHERE id=?', [product_id]);
    if (!prod) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    if (Number(quantity) > Number(prod.current_stock))
      return res.status(400).json({ error: `Omborda yetarli emas (mavjud: ${prod.current_stock} ${prod.unit || ''})` });
    const r = await db.run2(
      'INSERT INTO consumptions (product_id,quantity,from_branch_id,to_branch_id,consume_date,note) VALUES (?,?,?,?,?,?)',
      [product_id, quantity, prod.branch_id, to_branch_id || prod.branch_id, consume_date || new Date().toISOString().split('T')[0], note || '']
    );
    await db.run2('UPDATE products SET current_stock=current_stock-? WHERE id=?', [quantity, product_id]);
    res.status(201).json(await db.get2(CONS_SELECT + ' WHERE co.id=?', [r.lastID]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/consumptions/:id', auth, adminOnly, async (req, res) => {
  try {
    const c = await db.get2('SELECT * FROM consumptions WHERE id=?', [req.params.id]);
    if (c) await db.run2('UPDATE products SET current_stock=current_stock+? WHERE id=?', [c.quantity, c.product_id]);
    await db.run2('DELETE FROM consumptions WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Dashboard
app.get('/api/dashboard/stats', auth, async (req, res) => {
  try {
    const [tp, tb, al, ms] = await Promise.all([
      db.get2('SELECT COUNT(*) as cnt FROM products'),
      db.get2('SELECT COUNT(*) as cnt FROM branches'),
      db.get2('SELECT COUNT(*) as cnt FROM products WHERE daily_usage>0 AND (current_stock/daily_usage)<=2'),
      db.get2("SELECT COALESCE(SUM(quantity*unit_price),0) as total FROM purchases WHERE strftime('%Y-%m',purchase_date)=strftime('%Y-%m','now')")
    ]);
    res.json({ total_products: tp.cnt, total_branches: tb.cnt, alert_count: al.cnt, monthly_spend: ms.total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/dashboard/alerts', auth, async (req, res) => {
  try {
    res.json(await db.all2(`
      SELECT p.*,b.name as branch_name,
        CASE WHEN p.daily_usage>0 THEN ROUND(p.current_stock/p.daily_usage,1) ELSE 999 END as days_remaining
      FROM products p LEFT JOIN branches b ON p.branch_id=b.id
      WHERE p.daily_usage>0 AND (p.current_stock/p.daily_usage)<=2 ORDER BY days_remaining ASC`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/dashboard/low-stock', auth, async (req, res) => {
  try {
    res.json(await db.all2(`
      SELECT p.*,b.name as branch_name,
        CASE WHEN p.daily_usage>0 THEN ROUND(p.current_stock/p.daily_usage,1) ELSE 999 END as days_remaining
      FROM products p LEFT JOIN branches b ON p.branch_id=b.id
      WHERE p.daily_usage>0 AND (p.current_stock/p.daily_usage)<=7 ORDER BY days_remaining ASC`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/categories', auth, async (req, res) => {
  try { res.json(await db.all2('SELECT * FROM categories ORDER BY name')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/report', auth, async (req, res) => {
  const { month, year } = req.query;
  const now = new Date();
  const period = `${year||now.getFullYear()}-${String(month||now.getMonth()+1).padStart(2,'0')}`;
  try {
    res.json(await db.all2(`
      SELECT b.id as branch_id,b.name as branch_name,
        COUNT(pu.id) as purchase_count,
        COALESCE(SUM(pu.quantity*pu.unit_price),0) as total_amount,
        (SELECT pr2.name FROM products pr2 LEFT JOIN purchases pu2 ON pu2.product_id=pr2.id
          WHERE pr2.branch_id=b.id AND strftime('%Y-%m',pu2.purchase_date)=?
          GROUP BY pr2.id ORDER BY SUM(pu2.quantity*pu2.unit_price) DESC LIMIT 1) as top_product
      FROM branches b
      LEFT JOIN products pr ON pr.branch_id=b.id
      LEFT JOIN purchases pu ON pu.product_id=pr.id AND strftime('%Y-%m',pu.purchase_date)=?
      GROUP BY b.id ORDER BY total_amount DESC`, [period, period]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

init().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 SaTashkent Dashboard → http://localhost:${PORT}`);
    console.log('   Login: admin / admin123');
  });
}).catch(e => { console.error('DB init xatosi:', e); process.exit(1); });
