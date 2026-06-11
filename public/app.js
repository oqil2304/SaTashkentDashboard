// ─── State ────────────────────────────────────────────────────────────────────
let currentSection = 'overview';
let branches = [];
let products = [];
let purchases = [];
let categories = [];
let currentUser = null;

// ─── API ──────────────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) { window.location.href = '/'; throw new Error('Unauthorized'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server xatosi');
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtMoney(n) { return Number(n||0).toLocaleString('uz-UZ') + " so'm"; }
function today() { return new Date().toISOString().split('T')[0]; }
function daysLeft(stock, du) { if (!du || du <= 0) return Infinity; return stock / du; }
function brName(id) { return branches.find(b => b.id == id)?.name || '—'; }

function statusBadge(days) {
  if (!isFinite(days)) return `<span class="badge badge-gray">—</span>`;
  if (days <= 0)  return `<span class="badge badge-red"><i class="ti ti-alert-triangle"></i> Tugagan</span>`;
  if (days <= 2)  return `<span class="badge badge-red"><i class="ti ti-alarm"></i> ${days.toFixed(1)} kun</span>`;
  if (days <= 7)  return `<span class="badge badge-amber"><i class="ti ti-clock"></i> ${days.toFixed(1)} kun</span>`;
  if (days <= 14) return `<span class="badge badge-blue">${Math.round(days)} kun</span>`;
  return `<span class="badge badge-teal">${Math.round(days)} kun</span>`;
}

function daysColor(days) {
  if (!isFinite(days) || days > 7) return 'var(--teal)';
  if (days <= 2) return 'var(--red)';
  return 'var(--amber)';
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = { success: 'ti-check', error: 'ti-alert-circle', info: 'ti-info-circle' }[type] || 'ti-info-circle';
  el.innerHTML = `<i class="ti ${icon}"></i><span>${esc(msg)}</span>`;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay') || e === true)
    document.getElementById('modal-overlay').classList.remove('open');
}

// ─── Load data ────────────────────────────────────────────────────────────────
async function loadAll() {
  try {
    const results = await Promise.all([
      api('GET', '/api/branches'),
      api('GET', '/api/products'),
      api('GET', '/api/purchases'),
      api('GET', '/api/categories'),
    ]);
    branches   = results[0];
    products   = results[1];
    purchases  = results[2];
    categories = results[3];
    updateAlertBadge();
  } catch (e) {
    console.error('loadAll error:', e);
  }
}

function alertProducts() {
  return products.filter(p => p.daily_usage > 0 && daysLeft(p.current_stock, p.daily_usage) <= 2);
}

function updateAlertBadge() {
  const cnt = alertProducts().length;
  const badge = document.getElementById('alert-count');
  if (!badge) return;
  badge.textContent = cnt;
  badge.style.display = cnt > 0 ? 'flex' : 'none';
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function navigate(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item[data-section]').forEach(el =>
    el.classList.toggle('active', el.dataset.section === section));
  const titles = {
    overview: "Umumiy ko'rinish", products: 'Mahsulotlar',
    purchases: 'Sotib olishlar',  branches: 'Filiallar', report: 'Hisobot'
  };
  document.getElementById('page-title').textContent = titles[section] || section;
  if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
  renderSection(section);
}

function renderSection(s) {
  const c = document.getElementById('content');
  switch (s) {
    case 'overview':  renderOverview(c);  break;
    case 'products':  renderProducts(c);  break;
    case 'purchases': renderPurchases(c); break;
    case 'branches':  renderBranches(c);  break;
    case 'report':    renderReport(c);    break;
  }
}

// ─── OVERVIEW ────────────────────────────────────────────────────────────────
function renderOverview(c) {
  const alerts   = alertProducts();
  const lowStock = products.filter(p => p.daily_usage > 0 && daysLeft(p.current_stock, p.daily_usage) <= 7);
  const urgentCount = alerts.length;
  const soonCount   = products.filter(p => { const d = daysLeft(p.current_stock, p.daily_usage); return d > 2 && d <= 7; }).length;
  const now = new Date();
  const ym  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthlySpend = purchases
    .filter(p => (p.purchase_date||'').startsWith(ym))
    .reduce((s, p) => s + (p.quantity||0)*(p.unit_price||0), 0);

  c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon teal"><i class="ti ti-box"></i></div>
        <div><div class="stat-label">Jami mahsulot</div><div class="stat-value">${products.length}</div></div></div>
      <div class="stat-card"><div class="stat-icon red"><i class="ti ti-alarm"></i></div>
        <div><div class="stat-label">Shoshilinch (≤2 kun)</div>
          <div class="stat-value" style="color:var(--red)">${urgentCount}</div></div></div>
      <div class="stat-card"><div class="stat-icon amber"><i class="ti ti-clock"></i></div>
        <div><div class="stat-label">Kam qoldi (≤7 kun)</div>
          <div class="stat-value" style="color:var(--amber)">${soonCount}</div></div></div>
      <div class="stat-card"><div class="stat-icon blue"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Oylik xarajat</div>
          <div class="stat-value" style="font-size:18px">${fmtMoney(monthlySpend)}</div></div></div>
    </div>

    ${urgentCount ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:14px;padding:14px 18px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px">
      <i class="ti ti-bell-ringing" style="font-size:22px;color:var(--red);flex-shrink:0;margin-top:2px"></i>
      <div>
        <div style="font-size:14px;font-weight:700;color:#991b1b;margin-bottom:4px">⚠️ ${urgentCount} ta mahsulot tugab qolmoqda!</div>
        <div style="font-size:12px;color:#b91c1c">${alerts.map(a=>`<b>${esc(a.name)}</b> (${esc(brName(a.branch_id))}) — ${daysLeft(a.current_stock,a.daily_usage)<=0?'Tugagan':daysLeft(a.current_stock,a.daily_usage).toFixed(1)+' kun'}`).join(' · ')}</div>
      </div>
    </div>` : ''}

    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div style="font-size:15px;font-weight:700"><i class="ti ti-clock" style="color:#94a3b8;margin-right:6px"></i>Kam qolgan mahsulotlar (≤7 kun)</div>
      <button class="btn btn-primary btn-sm" onclick="openAddProduct()"><i class="ti ti-plus"></i>Qo'shish</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Mahsulot</th><th>Filial</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th><th></th>
          </tr></thead>
          <tbody>
            ${lowStock.length ? lowStock.map(p => {
              const d = daysLeft(p.current_stock, p.daily_usage);
              return `<tr>
                <td><div style="font-weight:600">${esc(p.name)}</div>${p.category?`<div style="font-size:11px;color:#94a3b8">${esc(p.category)}</div>`:''}</td>
                <td><span class="badge badge-gray">${esc(p.branch_name||brName(p.branch_id))}</span></td>
                <td style="font-weight:600;color:${daysColor(d)}">${p.current_stock} ${esc(p.unit)}</td>
                <td style="color:#64748b">${p.daily_usage} ${esc(p.unit)}/kun</td>
                <td style="font-weight:700;color:${daysColor(d)}">${isFinite(d)?d.toFixed(1)+' kun':'—'}</td>
                <td>${statusBadge(d)}</td>
                <td><button class="btn btn-sm btn-primary" onclick="openAddPurchase(${p.id})"><i class="ti ti-shopping-cart"></i>Sotib olish</button></td>
              </tr>`;
            }).join('') : `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-mood-happy"></i><p>Barcha mahsulotlar yetarli!</p></div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
function renderProducts(c) {
  const brOpts = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  const catSet = [...new Set(products.map(p => p.category).filter(Boolean))];
  const catOpts = catSet.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Barcha mahsulotlar</div>
      <button class="btn btn-primary" onclick="openAddProduct()"><i class="ti ti-plus"></i>Qo'shish</button>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="pf-br" onchange="applyProductFilter()"><option value="">Barcha filiallar</option>${brOpts}</select>
      <select class="form-select" id="pf-cat" onchange="applyProductFilter()"><option value="">Barcha kategoriyalar</option>${catOpts}</select>
      <input class="form-input" id="pf-q" placeholder="Qidirish..." oninput="applyProductFilter()">
    </div>
    <div class="card"><div class="table-wrap">
      <table>
        <thead><tr>
          <th>Mahsulot</th><th>Kategoriya</th><th>Filial</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th><th></th>
        </tr></thead>
        <tbody id="products-tbody"></tbody>
      </table>
    </div></div>`;
  applyProductFilter();
}

function applyProductFilter() {
  const bf  = document.getElementById('pf-br')?.value  || '';
  const cf  = document.getElementById('pf-cat')?.value || '';
  const qf  = (document.getElementById('pf-q')?.value || '').toLowerCase();
  const list = products.filter(p =>
    (!bf || p.branch_id == bf) &&
    (!cf || p.category === cf) &&
    (!qf || (p.name||'').toLowerCase().includes(qf))
  );
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-inbox"></i><p>Mahsulot topilmadi</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(p => {
    const d = daysLeft(p.current_stock, p.daily_usage);
    return `<tr>
      <td><div style="font-weight:600">${esc(p.name)}</div>${p.note?`<div style="font-size:11px;color:#94a3b8">${esc(p.note)}</div>`:''}</td>
      <td>${p.category?`<span class="badge badge-blue">${esc(p.category)}</span>`:'—'}</td>
      <td><span class="badge badge-gray">${esc(p.branch_name||brName(p.branch_id))}</span></td>
      <td style="font-weight:600">${p.current_stock} ${esc(p.unit)}</td>
      <td style="color:#64748b">${p.daily_usage} ${esc(p.unit)}/kun</td>
      <td style="font-weight:700;color:${daysColor(d)}">${isFinite(d)?d.toFixed(1):'—'}</td>
      <td>${statusBadge(d)}</td>
      <td style="white-space:nowrap;text-align:right">
        <button class="btn btn-sm btn-secondary btn-icon" onclick="openAddPurchase(${p.id})" title="Sotib olish"><i class="ti ti-shopping-cart"></i></button>
        <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditProduct(${p.id})" title="Tahrirlash"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="delProduct(${p.id})" title="O'chirish"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// ─── PURCHASES ───────────────────────────────────────────────────────────────
function renderPurchases(c) {
  const brOpts = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Sotib olishlar tarixi</div>
      <button class="btn btn-primary" onclick="openAddPurchase(null)"><i class="ti ti-plus"></i>Qo'shish</button>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="xf-br" onchange="applyPurchaseFilter()"><option value="">Barcha filiallar</option>${brOpts}</select>
      <input type="date" class="form-input" id="xf-from" onchange="applyPurchaseFilter()">
      <input type="date" class="form-input" id="xf-to"   onchange="applyPurchaseFilter()">
      <input class="form-input" id="xf-q" placeholder="Qidirish..." oninput="applyPurchaseFilter()">
    </div>
    <div class="card"><div class="table-wrap">
      <table>
        <thead><tr>
          <th>Sana</th><th>Mahsulot</th><th>Filial</th><th>Miqdor</th><th>Birlik narx</th><th>Jami</th><th>Yetkazuvchi</th><th></th>
        </tr></thead>
        <tbody id="purchases-tbody"></tbody>
      </table>
    </div></div>
    <div id="purchases-total" style="text-align:right;padding:8px 20px;font-size:13px;color:#64748b"></div>`;
  applyPurchaseFilter();
}

function applyPurchaseFilter() {
  const bf  = document.getElementById('xf-br')?.value   || '';
  const df  = document.getElementById('xf-from')?.value || '';
  const dt  = document.getElementById('xf-to')?.value   || '';
  const qf  = (document.getElementById('xf-q')?.value   || '').toLowerCase();
  const list = purchases.filter(p =>
    (!bf || p.branch_id == bf) &&
    (!df || (p.purchase_date||'') >= df) &&
    (!dt || (p.purchase_date||'') <= dt) &&
    (!qf || (p.product_name||'').toLowerCase().includes(qf) || (p.supplier||'').toLowerCase().includes(qf))
  );
  const tbody = document.getElementById('purchases-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ti ti-shopping-cart-off"></i><p>Sotib olish topilmadi</p></div></td></tr>`;
    const tot = document.getElementById('purchases-total');
    if (tot) tot.textContent = '';
    return;
  }
  let total = 0;
  tbody.innerHTML = list.map(p => {
    const sum = (p.quantity||0) * (p.unit_price||0);
    total += sum;
    return `<tr>
      <td style="color:#64748b">${esc(p.purchase_date)}</td>
      <td style="font-weight:600">${esc(p.product_name||'—')}</td>
      <td><span class="badge badge-gray">${esc(p.branch_name||'—')}</span></td>
      <td>${p.quantity} ${esc(p.unit||'')}</td>
      <td>${fmtMoney(p.unit_price)}</td>
      <td style="font-weight:700;color:var(--teal)">${fmtMoney(sum)}</td>
      <td style="color:#64748b">${esc(p.supplier||'—')}</td>
      <td style="white-space:nowrap;text-align:right">
        <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditPurchase(${p.id})"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="delPurchase(${p.id})"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
  const tot = document.getElementById('purchases-total');
  if (tot) tot.innerHTML = `Jami: <strong style="color:var(--teal);font-size:15px">${fmtMoney(total)}</strong> (${list.length} ta yozuv)`;
}

// ─── BRANCHES ────────────────────────────────────────────────────────────────
function renderBranches(c) {
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Filiallar</div>
      <button class="btn btn-primary" onclick="openAddBranch()"><i class="ti ti-plus"></i>Filial qo'shish</button>
    </div>
    <div class="branches-grid">
      ${branches.map(b => {
        const bProds  = products.filter(p => p.branch_id == b.id);
        const urgCnt  = bProds.filter(p => daysLeft(p.current_stock, p.daily_usage) <= 2).length;
        const totSpend= purchases.filter(p => p.branch_id == b.id).reduce((s, p) => s + (p.quantity||0)*(p.unit_price||0), 0);
        return `<div class="branch-card">
          <div class="branch-card-header">
            <div class="branch-icon"><i class="ti ti-building-store"></i></div>
            <div class="branch-actions">
              ${urgCnt?`<span class="badge badge-red"><i class="ti ti-alarm"></i>${urgCnt} shoshilinch</span>`:''}
              <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditBranch(${b.id})"><i class="ti ti-edit"></i></button>
              <button class="btn btn-sm btn-danger btn-icon" onclick="delBranch(${b.id})"><i class="ti ti-trash"></i></button>
            </div>
          </div>
          <div class="branch-name">${esc(b.name)}</div>
          <div class="branch-address">${esc(b.address||'—')}</div>
          <div class="branch-meta">
            ${b.manager?`<div class="branch-meta-item"><i class="ti ti-user" style="font-size:13px"></i>${esc(b.manager)}</div>`:''}
            ${b.phone?`<div class="branch-meta-item"><i class="ti ti-phone" style="font-size:13px"></i>${esc(b.phone)}</div>`:''}
          </div>
          <div class="branch-stats">
            <div class="branch-stat"><div class="branch-stat-value">${bProds.length}</div><div class="branch-stat-label">Mahsulot turi</div></div>
            <div class="branch-stat"><div class="branch-stat-value" style="color:var(--teal);font-size:16px">${Number(totSpend).toLocaleString('uz-UZ')}</div><div class="branch-stat-label">Jami xarajat (so'm)</div></div>
          </div>
          ${bProds.length ? `<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
            ${bProds.slice(0,5).map(p => {
              const d = daysLeft(p.current_stock, p.daily_usage);
              return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f8fafc;gap:8px">
                <span style="font-size:13px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span>
                ${statusBadge(d)}
              </div>`;
            }).join('')}
            ${bProds.length>5?`<div style="font-size:12px;color:#94a3b8;margin-top:6px">+${bProds.length-5} ta boshqa</div>`:''}
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
}

// ─── REPORT ───────────────────────────────────────────────────────────────────
function renderReport(c) {
  const now = new Date();
  let selYear  = now.getFullYear();
  let selMonth = now.getMonth() + 1;

  const monthOpts = Array.from({length:12},(_,i) => {
    const d = new Date(selYear, i);
    return `<option value="${i+1}" ${i+1===selMonth?'selected':''}>${d.toLocaleString('uz-UZ',{month:'long'})}</option>`;
  }).join('');
  const yearOpts = [selYear-1, selYear, selYear+1].map(y => `<option value="${y}" ${y===selYear?'selected':''}>${y}</option>`).join('');

  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Oylik hisobot</div>
      <div style="display:flex;gap:8px">
        <select class="form-select" id="rep-month" onchange="applyReport()">${monthOpts}</select>
        <select class="form-select" id="rep-year"  onchange="applyReport()">${yearOpts}</select>
      </div>
    </div>
    <div id="report-body"></div>`;
  applyReport();
}

function applyReport() {
  const month  = parseInt(document.getElementById('rep-month')?.value || new Date().getMonth()+1);
  const year   = parseInt(document.getElementById('rep-year')?.value  || new Date().getFullYear());
  const ym     = `${year}-${String(month).padStart(2,'0')}`;
  const body   = document.getElementById('report-body');
  if (!body) return;

  const monthPurchases = purchases.filter(p => (p.purchase_date||'').startsWith(ym));
  const totalAll = monthPurchases.reduce((s, p) => s + (p.quantity||0)*(p.unit_price||0), 0);

  const branchStats = branches.map(b => {
    const bPurch = monthPurchases.filter(p => p.branch_id == b.id);
    const total  = bPurch.reduce((s, p) => s + (p.quantity||0)*(p.unit_price||0), 0);
    const topMap = {};
    bPurch.forEach(p => { topMap[p.product_name] = (topMap[p.product_name]||0) + (p.quantity||0)*(p.unit_price||0); });
    const top = Object.entries(topMap).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';
    return { ...b, purchase_count: bPurch.length, total_amount: total, top_product: top };
  }).sort((a,b) => b.total_amount - a.total_amount);

  body.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card"><div class="stat-icon blue"><i class="ti ti-building-store"></i></div>
        <div><div class="stat-label">Faol filiallar</div><div class="stat-value">${branchStats.filter(b=>b.total_amount>0).length}</div></div></div>
      <div class="stat-card"><div class="stat-icon teal"><i class="ti ti-shopping-cart"></i></div>
        <div><div class="stat-label">Jami sotib olishlar</div><div class="stat-value">${monthPurchases.length}</div></div></div>
      <div class="stat-card"><div class="stat-icon amber"><i class="ti ti-coin"></i></div>
        <div><div class="stat-label">Jami xarajat</div><div class="stat-value" style="font-size:18px">${fmtMoney(totalAll)}</div></div></div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="table-wrap"><table>
        <thead><tr><th>Filial</th><th>Sotib olishlar</th><th>Eng ko'p olingan</th><th>Jami xarajat</th><th>Ulush</th></tr></thead>
        <tbody>
          ${branchStats.map(b => {
            const pct = totalAll > 0 ? (b.total_amount/totalAll*100).toFixed(1) : 0;
            return `<tr>
              <td style="font-weight:600">${esc(b.name)}</td>
              <td>${b.purchase_count}</td>
              <td style="color:#64748b">${esc(b.top_product)}</td>
              <td style="font-weight:700;color:var(--teal)">${fmtMoney(b.total_amount)}</td>
              <td><div style="display:flex;align-items:center;gap:8px">
                <div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;min-width:60px">
                  <div style="height:100%;background:var(--teal);border-radius:3px;width:${pct}%"></div>
                </div>
                <span style="font-size:12px;color:#64748b;flex-shrink:0">${pct}%</span>
              </div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>
    <div class="card">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-weight:700;font-size:15px">Batafsil sotib olishlar</div>
      <div class="table-wrap"><table>
        <thead><tr><th>Sana</th><th>Mahsulot</th><th>Filial</th><th>Miqdor</th><th>Narx</th><th>Jami</th><th>Yetkazuvchi</th></tr></thead>
        <tbody>
          ${monthPurchases.length ? monthPurchases.map(p => `<tr>
            <td style="color:#64748b">${esc(p.purchase_date)}</td>
            <td style="font-weight:600">${esc(p.product_name||'—')}</td>
            <td><span class="badge badge-gray">${esc(p.branch_name||'—')}</span></td>
            <td>${p.quantity} ${esc(p.unit||'')}</td>
            <td>${fmtMoney(p.unit_price)}</td>
            <td style="font-weight:600;color:var(--teal)">${fmtMoney((p.quantity||0)*(p.unit_price||0))}</td>
            <td style="color:#64748b">${esc(p.supplier||'—')}</td>
          </tr>`).join('') : `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-calendar-off"></i><p>Bu oyda sotib olish yo'q</p></div></td></tr>`}
        </tbody>
      </table></div>
    </div>`;
}

// ─── CRUD: Products ───────────────────────────────────────────────────────────
function openAddProduct() {
  const brOpts  = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  const catOpts = ['Oziq-ovqat', "Yoqilg'i", "Uy-ro'zg'or", 'Elektr', 'Ofis', 'Boshqa'].map(c => `<option>${esc(c)}</option>`).join('');
  openModal(`
    <div class="modal-header"><div class="modal-title">Mahsulot qo'shish</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nomi *</label><input class="form-control" id="mn" placeholder="Guruch"></div>
        <div class="form-group"><label class="form-label">Kategoriya</label><select class="form-control" id="mc"><option value="">Tanlang</option>${catOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Filial *</label><select class="form-control" id="mb"><option value="">Tanlang</option>${brOpts}</select></div>
        <div class="form-group"><label class="form-label">Birlik</label><input class="form-control" id="mu" placeholder="kg, dona, litr..."></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ombordagi miqdor</label><input class="form-control" id="ms" type="number" value="0"></div>
        <div class="form-group"><label class="form-label">Kunlik sarflanish</label><input class="form-control" id="md" type="number" step="0.1" value="1"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label><input class="form-control" id="mnote" placeholder="Qo'shimcha ma'lumot"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveProduct(null)"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

function openEditProduct(id) {
  const p = products.find(x => x.id == id); if (!p) return;
  const brOpts  = branches.map(b => `<option value="${b.id}" ${b.id==p.branch_id?'selected':''}>${esc(b.name)}</option>`).join('');
  const catOpts = ['Oziq-ovqat', "Yoqilg'i", "Uy-ro'zg'or", 'Elektr', 'Ofis', 'Boshqa'].map(c => `<option ${c===p.category?'selected':''}>${esc(c)}</option>`).join('');
  openModal(`
    <div class="modal-header"><div class="modal-title">Mahsulotni tahrirlash</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nomi *</label><input class="form-control" id="mn" value="${esc(p.name)}"></div>
        <div class="form-group"><label class="form-label">Kategoriya</label><select class="form-control" id="mc"><option value="">Tanlang</option>${catOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Filial</label><select class="form-control" id="mb"><option value="">Tanlang</option>${brOpts}</select></div>
        <div class="form-group"><label class="form-label">Birlik</label><input class="form-control" id="mu" value="${esc(p.unit||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ombordagi miqdor</label><input class="form-control" id="ms" type="number" value="${p.current_stock}"></div>
        <div class="form-group"><label class="form-label">Kunlik sarflanish</label><input class="form-control" id="md" type="number" step="0.1" value="${p.daily_usage}"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label><input class="form-control" id="mnote" value="${esc(p.note||'')}"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveProduct(${id})"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

async function saveProduct(id) {
  const name = document.getElementById('mn').value.trim();
  if (!name) { toast('Nomi kerak', 'error'); return; }
  const body = {
    name, category: document.getElementById('mc').value,
    branch_id: document.getElementById('mb').value || null,
    unit: document.getElementById('mu').value,
    current_stock: parseFloat(document.getElementById('ms').value)||0,
    daily_usage:   parseFloat(document.getElementById('md').value)||1,
    note: document.getElementById('mnote').value
  };
  try {
    if (id) await api('PUT', `/api/products/${id}`, body);
    else    await api('POST', '/api/products', body);
    toast(id ? 'Yangilandi' : "Qo'shildi");
    closeModal(true);
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

async function delProduct(id) {
  if (!confirm("Mahsulotni o'chirishni tasdiqlaysizmi?")) return;
  try {
    await api('DELETE', `/api/products/${id}`);
    toast("O'chirildi");
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

// ─── CRUD: Purchases ──────────────────────────────────────────────────────────
function openAddPurchase(preId) {
  const prOpts = products.map(p => `<option value="${p.id}" ${p.id==preId?'selected':''}>${esc(p.name)} (${esc(brName(p.branch_id))})</option>`).join('');
  openModal(`
    <div class="modal-header"><div class="modal-title">Sotib olish qo'shish</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Mahsulot *</label><select class="form-control" id="xp"><option value="">Tanlang</option>${prOpts}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Miqdor *</label><input class="form-control" id="xq" type="number" step="0.01" placeholder="10"></div>
        <div class="form-group"><label class="form-label">Birlik narxi (so'm)</label><input class="form-control" id="xpr" type="number" placeholder="15000"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Sana</label><input class="form-control" id="xd" type="date" value="${today()}"></div>
        <div class="form-group"><label class="form-label">Yetkazib beruvchi</label><input class="form-control" id="xs" placeholder="Kompaniya nomi"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label><input class="form-control" id="xn" placeholder="Qo'shimcha ma'lumot"></div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 13px;font-size:12px;color:#166534;margin-bottom:4px">
        <i class="ti ti-info-circle"></i> Sotib olish qo'shilganda omborga avtomatik qo'shiladi.
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="savePurchase(null)"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

function openEditPurchase(id) {
  const p = purchases.find(x => x.id == id); if (!p) return;
  const prOpts = products.map(pr => `<option value="${pr.id}" ${pr.id==p.product_id?'selected':''}>${esc(pr.name)} (${esc(brName(pr.branch_id))})</option>`).join('');
  openModal(`
    <div class="modal-header"><div class="modal-title">Sotib olishni tahrirlash</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Mahsulot *</label><select class="form-control" id="xp"><option value="">Tanlang</option>${prOpts}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Miqdor *</label><input class="form-control" id="xq" type="number" step="0.01" value="${p.quantity}"></div>
        <div class="form-group"><label class="form-label">Birlik narxi (so'm)</label><input class="form-control" id="xpr" type="number" value="${p.unit_price}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Sana</label><input class="form-control" id="xd" type="date" value="${p.purchase_date}"></div>
        <div class="form-group"><label class="form-label">Yetkazib beruvchi</label><input class="form-control" id="xs" value="${esc(p.supplier||'')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label><input class="form-control" id="xn" value="${esc(p.note||'')}"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="savePurchase(${id})"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

async function savePurchase(id) {
  const product_id = document.getElementById('xp').value;
  const quantity   = parseFloat(document.getElementById('xq').value);
  if (!product_id) { toast('Mahsulotni tanlang', 'error'); return; }
  if (!quantity || quantity <= 0) { toast('Miqdorni kiriting', 'error'); return; }
  const body = {
    product_id, quantity,
    unit_price:    parseFloat(document.getElementById('xpr').value)||0,
    purchase_date: document.getElementById('xd').value || today(),
    supplier:      document.getElementById('xs').value,
    note:          document.getElementById('xn').value
  };
  try {
    if (id) await api('PUT', `/api/purchases/${id}`, body);
    else    await api('POST', '/api/purchases', body);
    toast(id ? 'Yangilandi' : "Qo'shildi");
    closeModal(true);
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

async function delPurchase(id) {
  if (!confirm("Sotib olishni o'chirishni tasdiqlaysizmi?")) return;
  try {
    await api('DELETE', `/api/purchases/${id}`);
    toast("O'chirildi");
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

// ─── CRUD: Branches ───────────────────────────────────────────────────────────
function openAddBranch() {
  openModal(`
    <div class="modal-header"><div class="modal-title">Filial qo'shish</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nomi *</label><input class="form-control" id="bn" placeholder="Filial №5"></div>
        <div class="form-group"><label class="form-label">Manzil</label><input class="form-control" id="ba" placeholder="Toshkent, ko'cha..."></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Mas'ul shaxs</label><input class="form-control" id="bm" placeholder="Ism Familiya"></div>
        <div class="form-group"><label class="form-label">Telefon</label><input class="form-control" id="bp" placeholder="+998 90 123 45 67"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveBranch(null)"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

function openEditBranch(id) {
  const b = branches.find(x => x.id == id); if (!b) return;
  openModal(`
    <div class="modal-header"><div class="modal-title">Filialni tahrirlash</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nomi *</label><input class="form-control" id="bn" value="${esc(b.name)}"></div>
        <div class="form-group"><label class="form-label">Manzil</label><input class="form-control" id="ba" value="${esc(b.address||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Mas'ul shaxs</label><input class="form-control" id="bm" value="${esc(b.manager||'')}"></div>
        <div class="form-group"><label class="form-label">Telefon</label><input class="form-control" id="bp" value="${esc(b.phone||'')}"></div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveBranch(${id})"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

async function saveBranch(id) {
  const name = document.getElementById('bn').value.trim();
  if (!name) { toast('Nomi kerak', 'error'); return; }
  const body = {
    name, address: document.getElementById('ba').value,
    manager: document.getElementById('bm').value,
    phone:   document.getElementById('bp').value
  };
  try {
    if (id) await api('PUT', `/api/branches/${id}`, body);
    else    await api('POST', '/api/branches', body);
    toast(id ? 'Yangilandi' : "Qo'shildi");
    closeModal(true);
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

async function delBranch(id) {
  if (!confirm("Filialni o'chirishni tasdiqlaysizmi?")) return;
  try {
    await api('DELETE', `/api/branches/${id}`);
    toast("O'chirildi");
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    currentUser = await api('GET', '/api/me');
    const av = document.getElementById('user-avatar');
    const un = document.getElementById('sidebar-username');
    if (av) av.textContent = (currentUser.username||'A')[0].toUpperCase();
    if (un) un.textContent = currentUser.username;
  } catch (e) {
    window.location.href = '/';
    return;
  }

  await loadAll();

  document.querySelectorAll('.nav-item[data-section]').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.section); })
  );

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await api('POST', '/api/auth/logout');
    window.location.href = '/';
  });

  document.getElementById('sidebar-toggle')?.addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open')
  );

  document.getElementById('alert-btn')?.addEventListener('click', () => navigate('overview'));

  navigate('overview');

  setInterval(async () => { await loadAll(); updateAlertBadge(); }, 5 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
