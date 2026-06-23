require('dotenv').config();
const express      = require('express');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const path         = require('path');
const fs           = require('fs');
const multer       = require('multer');
const { db, init, saveDb } = require('./db');
const { startBot, notifyLowStock, autoCheckUrgent, completeOrder, sendToSupplier, getBotUsername } = require('./bot');

// Avatar upload konfiguratsiyasi
const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, 'public/uploads/avatars'),
  filename: (req, file, cb) => cb(null, `u${req.user.id}_${Date.now()}${path.extname(file.originalname)}`)
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Faqat rasm fayl qabul qilinadi'));
  }
});

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

// Admin yoki filial omborchisi yozish huquqi (o'z filiali uchun)
function canWrite(req, res, next) {
  if (req.user?.role === 'admin' || req.user?.role === 'branch') return next();
  return res.status(403).json({ error: 'Bu amal uchun yozish huquqi kerak' });
}

// Branch user uchun filial ID ni olish (token va DB dan)
async function getUserBranchId(userId) {
  const u = await db.get2('SELECT branch_id FROM users WHERE id=?', [userId]);
  return u?.branch_id || null;
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

// Ochiq ro'yxatdan o'tish o'chirilgan — faqat admin foydalanuvchi yaratadi
app.post('/api/auth/register', (req, res) => {
  res.status(403).json({ error: 'Ro\'yxatdan o\'tish yopiq. Foydalanuvchi yaratish uchun administratorga murojaat qiling.' });
});

// Admin — yangi foydalanuvchi yaratish
app.post('/api/admin/users', auth, adminOnly, async (req, res) => {
  const { username, password, full_name, email, phone, role, branch_id } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Login va parol kerak' });
  if (String(password).length < 4) return res.status(400).json({ error: 'Parol kamida 4 ta belgidan iborat bo\'lsin' });
  try {
    const uname = String(username).trim();
    const exists = await db.get2('SELECT id FROM users WHERE lower(username)=?', [uname.toLowerCase()]);
    if (exists) return res.status(409).json({ error: 'Bu login allaqachon mavjud' });
    await db.run2(
      "INSERT INTO users (username,password_hash,role,status,full_name,email,phone,branch_id,created_at) VALUES (?,?,?,'active',?,?,?,?,datetime('now'))",
      [uname, bcrypt.hashSync(password, 10), role || 'user', full_name || '', email || '', phone || '', branch_id || null]
    );
    res.status(201).json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Parolni o'z-o'zidan tiklash o'chirilgan — parolni faqat admin yangilaydi
app.post('/api/auth/forgot', (req, res) => {
  res.status(403).json({ error: 'Parolni tiklash yopiq. Iltimos, administratorga murojaat qiling.' });
});
app.post('/api/auth/reset', (req, res) => {
  res.status(403).json({ error: 'Parolni tiklash yopiq. Iltimos, administratorga murojaat qiling.' });
});

app.post('/api/auth/logout', (req, res) => { res.clearCookie('token'); res.json({ success: true }); });

app.get('/api/me', auth, async (req, res) => {
  try {
    const u = await db.get2('SELECT id,username,role,email,phone,full_name,status,created_at,branch_id,avatar FROM users WHERE id=?', [req.user.id]);
    res.json(u || { id: req.user.id, username: req.user.username, role: req.user.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Avatar yuklash
app.post('/api/profile/avatar', auth, (req, res, next) => avatarUpload.single('avatar')(req, res, err => {
  if (err) return res.status(400).json({ error: err.message });
  next();
}), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fayl kerak' });
  try {
    // Eski avatarni o'chirish
    const old = await db.get2('SELECT avatar FROM users WHERE id=?', [req.user.id]);
    if (old?.avatar) {
      const oldPath = path.join(__dirname, 'public', old.avatar);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    const avatarUrl = '/uploads/avatars/' + req.file.filename;
    await db.run2('UPDATE users SET avatar=? WHERE id=?', [avatarUrl, req.user.id]);
    res.json({ success: true, avatar: avatarUrl });
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
    res.json(await db.all2(`SELECT u.id,u.username,u.role,u.email,u.phone,u.full_name,u.status,u.created_at,u.branch_id,u.avatar,b.name as branch_name
      FROM users u LEFT JOIN branches b ON u.branch_id=b.id ORDER BY u.id`));
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
  if (!['admin', 'branch', 'viewer', 'user'].includes(role)) return res.status(400).json({ error: 'Notoʻgʻri rol' });
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Oʻz rolingizni oʻzgartira olmaysiz' });
  try {
    await db.run2('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Foydalanuvchiga filial belgilash
app.put('/api/users/:id/branch', auth, adminOnly, async (req, res) => {
  const { branch_id } = req.body || {};
  try {
    await db.run2('UPDATE users SET branch_id=? WHERE id=?', [branch_id || null, req.params.id]);
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
  try {
    if (req.user.role === 'branch') {
      const brId = await getUserBranchId(req.user.id);
      if (brId) return res.json(await db.all2('SELECT * FROM branches WHERE id=?', [brId]));
    }
    res.json(await db.all2('SELECT * FROM branches ORDER BY id'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/branches', auth, adminOnly, async (req, res) => {
  const { name, address, manager, phone, location_url } = req.body;
  if (!name) return res.status(400).json({ error: 'Nomi kerak' });
  try {
    const r = await db.run2('INSERT INTO branches (name,address,manager,phone,location_url) VALUES (?,?,?,?,?)', [name, address||'', manager||'', phone||'', location_url||'']);
    res.status(201).json(await db.get2('SELECT * FROM branches WHERE id=?', [r.lastID]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/branches/:id', auth, adminOnly, async (req, res) => {
  const { name, address, manager, phone, location_url } = req.body;
  try {
    await db.run2('UPDATE branches SET name=?,address=?,manager=?,phone=?,location_url=? WHERE id=?', [name, address||'', manager||'', phone||'', location_url||'', req.params.id]);
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
  // Filial omborchisi faqat o'z filialini ko'radi
  if (req.user.role === 'branch') {
    const brId = await getUserBranchId(req.user.id);
    if (brId) { sql += ' AND p.branch_id=?'; params.push(brId); }
  }
  try { res.json(await db.all2(sql + ' ORDER BY p.id', params)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/products', auth, canWrite, async (req, res) => {
  const { branch_id, name, category, unit, daily_usage, current_stock, min_stock, supplier_id, note } = req.body;
  if (!name) return res.status(400).json({ error: 'Nomi kerak' });
  try {
    const r = await db.run2(
      'INSERT INTO products (branch_id,name,category,unit,daily_usage,current_stock,min_stock,supplier_id,note) VALUES (?,?,?,?,?,?,?,?,?)',
      [branch_id||null, name, category||'', unit||'', daily_usage||0, current_stock||0, min_stock||0, supplier_id||null, note||'']
    );
    res.status(201).json(await db.get2('SELECT p.*,b.name as branch_name FROM products p LEFT JOIN branches b ON p.branch_id=b.id WHERE p.id=?', [r.lastID]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/products/:id', auth, canWrite, async (req, res) => {
  const { branch_id, name, category, unit, daily_usage, current_stock, min_stock, supplier_id, note } = req.body;
  try {
    await db.run2('UPDATE products SET branch_id=?,name=?,category=?,unit=?,daily_usage=?,current_stock=?,min_stock=?,supplier_id=?,note=? WHERE id=?',
      [branch_id||null, name, category||'', unit||'', daily_usage||0, current_stock||0, min_stock||0, supplier_id||null, note||'', req.params.id]);
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

// Purchases — haqiqiy xaridlar + jarayondagi buyurtmalar (supply_orders)
app.get('/api/purchases', auth, async (req, res) => {
  let sql = `SELECT pu.*,pr.name as product_name,pr.unit,b.name as branch_name,b.id as branch_id,
             COALESCE(s.name, pu.supplier) as supplier
             FROM purchases pu
             LEFT JOIN products pr ON pu.product_id=pr.id
             LEFT JOIN branches b ON pr.branch_id=b.id
             LEFT JOIN suppliers s ON s.id=pu.supplier_id
             WHERE 1=1`;
  const params = [];
  if (req.query.product_id) { sql += ' AND pu.product_id=?'; params.push(req.query.product_id); }
  if (req.query.branch_id)  { sql += ' AND b.id=?'; params.push(req.query.branch_id); }
  if (req.query.date_from)  { sql += ' AND pu.purchase_date>=?'; params.push(req.query.date_from); }
  if (req.query.date_to)    { sql += ' AND pu.purchase_date<=?'; params.push(req.query.date_to); }
  if (req.user.role === 'branch') {
    const brId = await getUserBranchId(req.user.id);
    if (brId) { sql += ' AND b.id=?'; params.push(brId); }
  }
  try {
    const done = await db.all2(sql + ' ORDER BY pu.purchase_date DESC,pu.id DESC', params);
    // Jarayondagi buyurtmalarni ham qo'shamiz (manual yoki bot orqali)
    const pending = await db.all2(
      `SELECT so.id, so.product_id, so.product_name, so.qty AS quantity, so.unit,
              so.unit_price, so.supplier_name AS supplier, so.status, so.note, so.delivery_cost,
              so.created_at AS purchase_date, NULL AS branch_id, NULL AS branch_name,
              '_order' AS _type, so.supplier_id
       FROM supply_orders so
       WHERE so.status NOT IN ('delivered','cancelled')
       ORDER BY so.created_at DESC LIMIT 100`
    );
    res.json([...pending, ...done]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/purchases', auth, canWrite, async (req, res) => {
  const { product_id, quantity, unit_price, purchase_date, supplier, note, delivery_cost, supplier_id } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'Mahsulot va miqdor kerak' });
  try {
    const r = await db.run2(
      'INSERT INTO purchases (product_id,quantity,unit_price,purchase_date,supplier,note,remaining_qty,delivery_cost,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [product_id, quantity, unit_price||0, purchase_date||new Date().toISOString().split('T')[0], supplier||'', note||'', quantity, delivery_cost||0, supplier_id||null]
    );
    await db.run2('UPDATE products SET current_stock=current_stock+? WHERE id=?', [quantity, product_id]);
    res.status(201).json(await db.get2(
      'SELECT pu.*,pr.name as product_name,pr.unit,b.name as branch_name,b.id as branch_id,COALESCE(s.name,pu.supplier) as supplier FROM purchases pu LEFT JOIN products pr ON pu.product_id=pr.id LEFT JOIN branches b ON pr.branch_id=b.id LEFT JOIN suppliers s ON s.id=pu.supplier_id WHERE pu.id=?',
      [r.lastID]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/purchases/:id', auth, canWrite, async (req, res) => {
  const { product_id, quantity, unit_price, purchase_date, supplier, note, delivery_cost, supplier_id } = req.body;
  try {
    const old = await db.get2('SELECT * FROM purchases WHERE id=?', [req.params.id]);
    if (!old) return res.status(404).json({ error: 'Topilmadi' });
    await db.run2('UPDATE products SET current_stock=current_stock-? WHERE id=?', [old.quantity, old.product_id]);
    await db.run2('UPDATE products SET current_stock=current_stock+? WHERE id=?', [quantity, product_id]);
    await db.run2('UPDATE purchases SET product_id=?,quantity=?,unit_price=?,purchase_date=?,supplier=?,note=?,delivery_cost=?,supplier_id=? WHERE id=?',
      [product_id, quantity, unit_price||0, purchase_date, supplier||'', note||'', delivery_cost||0, supplier_id||null, req.params.id]);
    res.json(await db.get2(
      'SELECT pu.*,pr.name as product_name,pr.unit,b.name as branch_name,b.id as branch_id,COALESCE(s.name,pu.supplier) as supplier FROM purchases pu LEFT JOIN products pr ON pu.product_id=pr.id LEFT JOIN branches b ON pr.branch_id=b.id LEFT JOIN suppliers s ON s.id=pu.supplier_id WHERE pu.id=?',
      [req.params.id]
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/purchases/:id', auth, canWrite, async (req, res) => {
  try {
    const p = await db.get2('SELECT * FROM purchases WHERE id=?', [req.params.id]);
    if (p) await db.run2('UPDATE products SET current_stock=current_stock-? WHERE id=?', [p.quantity, p.product_id]);
    await db.run2('DELETE FROM purchases WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Consumptions (Rasxod — ombordan chiqim)
const CONS_SELECT = `SELECT co.*, pr.name as product_name, pr.unit,
    fb.name as from_branch_name, tb.name as to_branch_name,
    co.unit_price as unit_price
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
  if (req.user.role === 'branch') {
    const brId = await getUserBranchId(req.user.id);
    if (brId) { sql += ' AND (co.from_branch_id=? OR co.to_branch_id=?)'; params.push(brId, brId); }
  }
  try { res.json(await db.all2(sql + ' ORDER BY co.consume_date DESC, co.id DESC', params)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/consumptions', auth, canWrite, async (req, res) => {
  const { product_id, quantity, to_branch_id, consume_date, note } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ error: 'Mahsulot va miqdor kerak' });
  try {
    const prod = await db.get2('SELECT * FROM products WHERE id=?', [product_id]);
    if (!prod) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    if (Number(quantity) > Number(prod.current_stock))
      return res.status(400).json({ error: `Omborda yetarli emas (mavjud: ${prod.current_stock} ${prod.unit || ''})` });
    const ids = await fifoConsume(product_id, quantity, to_branch_id, consume_date || new Date().toISOString().split('T')[0], note || '');
    const rows = await Promise.all(ids.map(id => db.get2(CONS_SELECT + ' WHERE co.id=?', [id])));
    res.status(201).json(rows[0]); // birinchi yozuvni qaytaramiz (UI uchun)
    // Rasxoddan keyin ombor kamaygan bo'lishi mumkin — shoshilinch/tugaganlarni tekshirish
    if (typeof autoCheckUrgent === 'function') autoCheckUrgent().catch(() => {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/consumptions/:id', auth, canWrite, async (req, res) => {
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

// ── Ta'minotchilar API ────────────────────────────────────────────────────
// branch_ids ni normallashtirish: massiv yoki "1,2,3" → "1,2,3" satr
function normBranchIds(v) {
  if (Array.isArray(v)) return v.filter(Boolean).join(',');
  if (v == null) return '';
  return String(v).split(',').map(x => x.trim()).filter(Boolean).join(',');
}

app.get('/api/suppliers', auth, async (req, res) => {
  try {
    res.json(await db.all2(`SELECT * FROM suppliers ORDER BY name`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/suppliers', auth, adminOnly, async (req, res) => {
  try {
    const { name, telegram_chat_id, telegram_username, phone, products_note, note, branch_ids } = req.body;
    if (!name) return res.status(400).json({ error: 'Ism kerak' });
    const bids = normBranchIds(branch_ids);
    const r = await db.run2(
      `INSERT INTO suppliers (name, telegram_chat_id, telegram_username, phone, products_note, note, branch_ids, created_at)
       VALUES (?,?,?,?,?,?,?,datetime('now'))`,
      [name, telegram_chat_id || '', telegram_username || '', phone || '', products_note || '', note || '', bids]
    );
    saveDb();
    res.json({ id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/suppliers/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, telegram_chat_id, telegram_username, phone, products_note, note, branch_ids } = req.body;
    const bids = normBranchIds(branch_ids);
    await db.run2(
      `UPDATE suppliers SET name=?, telegram_chat_id=?, telegram_username=?, phone=?, products_note=?, note=?, branch_ids=? WHERE id=?`,
      [name, telegram_chat_id || '', telegram_username || '', phone || '', products_note || '', note || '', bids, req.params.id]
    );
    saveDb();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/suppliers/:id', auth, adminOnly, async (req, res) => {
  try {
    await db.run2('DELETE FROM suppliers WHERE id=?', [req.params.id]);
    saveDb();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ta'minotchi ulash yo'riqnomasi
app.get('/api/suppliers/:id/link', auth, adminOnly, async (req, res) => {
  const botUsername = getBotUsername() || process.env.BOT_USERNAME || '';
  if (!botUsername) return res.status(503).json({ error: 'Bot hali ishga tushmagan, biroz kuting' });
  res.json({ link: `https://t.me/${botUsername}?start=supplier_${req.params.id}` });
});

// Qo'lda yaratilgan buyurtma — ta'minotchiga bot orqali xabar yuboradi
app.post('/api/purchases/manual-order', auth, canWrite, async (req, res) => {
  const { product_id, quantity, unit_price, supplier_id, note, branch_id, delivery_cost } = req.body;
  if (!product_id || !quantity || !supplier_id) return res.status(400).json({ error: 'Mahsulot, miqdor va ta\'minotchi kerak' });
  try {
    const prod = await db.get2('SELECT * FROM products WHERE id=?', [product_id]);
    const sup  = await db.get2('SELECT * FROM suppliers WHERE id=?', [supplier_id]);
    if (!prod) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    if (!sup)  return res.status(404).json({ error: 'Ta\'minotchi topilmadi' });
    if (!sup.telegram_chat_id) return res.status(400).json({ error: 'Ta\'minotchi botga ulanmagan' });
    const bId = branch_id || prod.branch_id || null;
    const r = await db.run2(
      `INSERT INTO supply_orders (product_id, product_name, qty, unit, unit_price, supplier_id, supplier_name, supplier_chat_id, status, note, branch_id, delivery_cost, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
      [product_id, prod.name, quantity, prod.unit || '', unit_price || 0,
       sup.id, sup.name, sup.telegram_chat_id, 'manual_pending', note || '', bId, delivery_cost || 0]
    );
    saveDb();
    const order = await db.get2('SELECT * FROM supply_orders WHERE id=?', [r.lastID]);
    await sendToSupplier(order);
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Buyurtmalar (supply_orders) API ─────────────────────────────────────
app.get('/api/supply-orders', auth, async (req, res) => {
  try {
    res.json(await db.all2(
      `SELECT * FROM supply_orders ORDER BY created_at DESC LIMIT 200`
    ));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/supply-orders/:id/cancel', auth, canWrite, async (req, res) => {
  try {
    await db.run2("UPDATE supply_orders SET status='cancelled', updated_at=datetime('now') WHERE id=?", [req.params.id]);
    saveDb();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/supply-orders/:id/arrived', auth, canWrite, async (req, res) => {
  try {
    const order = await db.get2('SELECT * FROM supply_orders WHERE id=?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Topilmadi' });
    if (order.status !== 'in_transit') return res.status(400).json({ error: 'Zakaz yo\'lda emas' });

    let members = null;
    try { members = order.members_json ? JSON.parse(order.members_json) : null; } catch (_) {}
    if (!members || !members.length)
      members = [{ product_id: order.product_id, name: order.product_name, qty: order.qty, unit: order.unit }];

    let firstRow = true;
    for (const m of members) {
      if (!m.product_id || !(m.qty > 0)) continue;
      const delivery = firstRow ? (order.delivery_cost || 0) : 0;
      firstRow = false;
      await db.run2(
        `INSERT INTO purchases (product_id, quantity, unit_price, purchase_date, supplier, supplier_id, note, remaining_qty, delivery_cost, created_at)
         VALUES (?, ?, ?, date('now'), ?, ?, 'Telegram bot orqali zakaz', ?, ?, datetime('now'))`,
        [m.product_id, m.qty, order.unit_price || 0, order.supplier_name || '', order.supplier_id || null, m.qty, delivery]);
      await db.run2('UPDATE products SET current_stock = current_stock + ? WHERE id=?', [m.qty, m.product_id]);
    }
    await db.run2("UPDATE supply_orders SET status='delivered', updated_at=datetime('now') WHERE id=?", [order.id]);
    saveDb();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin ombor tekshiruvi — botga buyurtma ro'yxatini yuborish
app.post('/api/bot/check-stock', auth, adminOnly, async (req, res) => {
  try {
    await notifyLowStock(true);
    res.json({ ok: true, message: 'Tekshiruv bajarildi — Telegram ga yuborildi' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Finance saytdan webhook
app.post('/api/bot/finance-webhook', async (req, res) => {
  try {
    const { order_id, status } = req.body;
    if (status === 'paid' && typeof completeOrder === 'function') await completeOrder(order_id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

init().then(async () => {
  // Kunlik sarf tizimini ishga tushirish (server start bo'lganda)
  await catchUpDailyConsumptions();
  scheduleDailyConsumption();
  // Telegram bot ishga tushirish
  startBot();
  app.listen(PORT, () => {
    console.log(`🚀 SaTashkent Dashboard → http://localhost:${PORT}`);
    console.log('   Login: admin / admin123');
  });
}).catch(e => { console.error('DB init xatosi:', e); process.exit(1); });

// ── FIFO rasxod: eski partiyadan boshlab narx bo'yicha ajratish ───────────────
async function fifoConsume(product_id, total_qty, to_branch_id, consume_date, note) {
  const prod = await db.get2('SELECT * FROM products WHERE id=?', [product_id]);
  if (!prod) return [];
  const batches = await db.all2(
    'SELECT * FROM purchases WHERE product_id=? AND remaining_qty > 0 ORDER BY purchase_date ASC, id ASC',
    [product_id]
  );
  const records = [];
  let remaining = +total_qty;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(+(batch.remaining_qty), remaining);
    const r = await db.run2(
      'INSERT INTO consumptions (product_id,quantity,from_branch_id,to_branch_id,consume_date,note,unit_price) VALUES (?,?,?,?,?,?,?)',
      [product_id, +take.toFixed(4), prod.branch_id, to_branch_id || prod.branch_id,
       consume_date, note, batch.unit_price || 0]
    );
    await db.run2('UPDATE purchases SET remaining_qty = remaining_qty - ? WHERE id=?', [take, batch.id]);
    records.push(r.lastID);
    remaining = +(remaining - take).toFixed(4);
  }
  // Qolgan miqdor uchun partiya topilmasa — narxsiz yozuv
  if (remaining > 0) {
    const r = await db.run2(
      'INSERT INTO consumptions (product_id,quantity,from_branch_id,to_branch_id,consume_date,note,unit_price) VALUES (?,?,?,?,?,?,?)',
      [product_id, remaining, prod.branch_id, to_branch_id || prod.branch_id, consume_date, note, 0]
    );
    records.push(r.lastID);
  }
  await db.run2('UPDATE products SET current_stock = current_stock - ? WHERE id=?', [total_qty, product_id]);
  return records;
}

// ── Kunlik sarf: bir kun uchun barcha mahsulotlarni rasxod qilish ──────────────
async function runDailyConsumption(dateStr) {
  // Bu kun allaqachon ishlanganmi?
  const exists = await db.get2(
    "SELECT id FROM consumptions WHERE consume_date=? AND note='auto_daily' LIMIT 1",
    [dateStr]
  );
  if (exists) return false; // allaqachon ishlangan

  const prods = await db.all2('SELECT * FROM products WHERE daily_usage > 0');
  for (const p of prods) {
    const qty = Math.min(Number(p.daily_usage), Number(p.current_stock));
    if (qty <= 0) continue;
    await fifoConsume(p.id, qty, p.branch_id, dateStr, 'auto_daily');
  }
  console.log(`✅ Kunlik sarf ${dateStr}: ${prods.filter(p=>p.daily_usage>0).length} ta mahsulot`);
  return true;
}

// O'tkazib yuborilgan kunlarni to'ldirish (max 30 kun)
async function catchUpDailyConsumptions() {
  const setting = await db.get2("SELECT value FROM settings WHERE key='last_daily_run'");
  const lastRun = setting ? new Date(setting.value) : null;
  const today   = new Date(); today.setHours(0,0,0,0);

  if (!lastRun) {
    // Birinchi marta — faqat bugundan boshlash
    const todayStr = today.toISOString().split('T')[0];
    await db.run2("INSERT OR REPLACE INTO settings (key,value) VALUES ('last_daily_run',?)", [todayStr]);
    return;
  }

  const cursor = new Date(lastRun); cursor.setDate(cursor.getDate() + 1); cursor.setHours(0,0,0,0);
  let days = 0;
  while (cursor <= today && days < 30) {
    const dateStr = cursor.toISOString().split('T')[0];
    await runDailyConsumption(dateStr);
    await db.run2("INSERT OR REPLACE INTO settings (key,value) VALUES ('last_daily_run',?)", [dateStr]);
    cursor.setDate(cursor.getDate() + 1);
    days++;
  }
}

// Har kun yarim tunda yangi kunlik sarf
function scheduleDailyConsumption() {
  function msUntilMidnight() {
    const now = new Date(), midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 30, 0); // 00:00:30
    return midnight - now;
  }
  setTimeout(async function tick() {
    const todayStr = new Date().toISOString().split('T')[0];
    await runDailyConsumption(todayStr);
    await db.run2("INSERT OR REPLACE INTO settings (key,value) VALUES ('last_daily_run',?)", [todayStr]);
    // Kunlik sarfdan keyin shoshilinch/tugagan tovarlarni avtomatik tekshirish
    if (typeof autoCheckUrgent === 'function') autoCheckUrgent().catch(() => {});
    setTimeout(tick, msUntilMidnight());
  }, msUntilMidnight());
}
