// ─── State ────────────────────────────────────────────────────────────────────
let currentSection = 'overview';
let branches = [];
let products = [];
let purchases = [];
let alerts = [];
let categories = [];
let currentUser = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    currentUser = await api('GET', '/api/me');
    if (currentUser && currentUser.username) {
      const avatarEl = document.getElementById('user-avatar');
      const usernameEl = document.getElementById('sidebar-username');
      if (avatarEl) avatarEl.textContent = currentUser.username[0].toUpperCase();
      if (usernameEl) usernameEl.textContent = currentUser.username;
    }
  } catch (e) {
    window.location.href = '/';
    return;
  }

  await loadAllData();
  setupNav();
  setupLogout();
  setupSidebarToggle();
  navigateTo('overview');
}

async function loadAllData() {
  try {
    [branches, products, purchases, categories] = await Promise.all([
      api('GET', '/api/branches'),
      api('GET', '/api/products'),
      api('GET', '/api/purchases'),
      api('GET', '/api/categories')
    ]);
    const alertData = await api('GET', '/api/dashboard/alerts');
    alerts = alertData;
    updateAlertBadge(alerts.length);
  } catch (e) {
    console.error('Data load error:', e);
  }
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      navigateTo(section);
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });
}

function setupLogout() {
  const btn = document.getElementById('logout-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await api('POST', '/api/auth/logout');
      window.location.href = '/';
    });
  }
}

function setupSidebarToggle() {
  const btn = document.getElementById('sidebar-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }
  document.getElementById('alert-btn')?.addEventListener('click', () => {
    navigateTo('overview');
  });
}

function navigateTo(section) {
  currentSection = section;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });
  const titles = {
    overview: "Umumiy ko'rinish",
    products: 'Mahsulotlar',
    purchases: 'Sotib olishlar',
    branches: 'Filiallar',
    report: 'Hisobot'
  };
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = titles[section] || section;
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading-state"><i class="ti ti-loader-2 spin"></i><span>Yuklanmoqda...</span></div>';
  switch (section) {
    case 'overview':  renderOverview(); break;
    case 'products':  renderProducts(); break;
    case 'purchases': renderPurchases(); break;
    case 'branches':  renderBranches(); break;
    case 'report':    renderReport(); break;
  }
}

function updateAlertBadge(count) {
  const badge = document.getElementById('alert-count');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ─── Overview ─────────────────────────────────────────────────────────────────
async function renderOverview() {
  const content = document.getElementById('content');
  try {
    const [stats, alertList, lowStock] = await Promise.all([
      api('GET', '/api/dashboard/stats'),
      api('GET', '/api/dashboard/alerts'),
      api('GET', '/api/dashboard/low-stock')
    ]);
    alerts = alertList;
    updateAlertBadge(alerts.length);

    const alertRows = alertList.map(p => `
      <tr>
        <td><strong>${escHtml(p.name)}</strong></td>
        <td>${escHtml(p.branch_name || '—')}</td>
        <td>${p.current_stock} ${escHtml(p.unit || '')}</td>
        <td>${p.daily_usage} ${escHtml(p.unit || '')}/kun</td>
        <td><strong>${p.days_remaining}</strong> kun</td>
        <td>${getStatusBadge(p.days_remaining)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6"><div class="empty-state"><i class="ti ti-circle-check"></i>Hech qanday kritik mahsulot yoq</div></td></tr>';

    const lowFiltered = lowStock.filter(p => p.days_remaining > 2);
    const lowRows = lowFiltered.map(p => `
      <tr>
        <td><strong>${escHtml(p.name)}</strong></td>
        <td>${escHtml(p.branch_name || '—')}</td>
        <td>${p.current_stock} ${escHtml(p.unit || '')}</td>
        <td>${p.daily_usage} ${escHtml(p.unit || '')}/kun</td>
        <td><strong>${p.days_remaining}</strong> kun</td>
        <td>${getStatusBadge(p.days_remaining)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6"><div class="empty-state"><i class="ti ti-check"></i>Kamomad yoq</div></td></tr>';

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon teal"><i class="ti ti-box"></i></div>
          <div>
            <div class="stat-label">Jami mahsulotlar</div>
            <div class="stat-value">${stats.total_products}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon red"><i class="ti ti-alert-triangle"></i></div>
          <div>
            <div class="stat-label">Shoshilinch ogohlantirishlar</div>
            <div class="stat-value ${stats.alert_count > 0 ? 'red' : ''}">${stats.alert_count}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue"><i class="ti ti-building-store"></i></div>
          <div>
            <div class="stat-label">Filiallar soni</div>
            <div class="stat-value">${stats.total_branches}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber"><i class="ti ti-currency-dollar"></i></div>
          <div>
            <div class="stat-label">Oylik xarajat</div>
            <div class="stat-value" style="font-size:16px">${formatCurrency(stats.monthly_spend)}</div>
          </div>
        </div>
      </div>
      <div class="section-grid">
        <div class="card">
          <div class="card-header">
            <div class="card-title" style="color:var(--red)">
              <i class="ti ti-alert-triangle"></i> Kritik mahsulotlar (2 kun va kam)
            </div>
            <span class="badge badge-red">${alertList.length} ta</span>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table>
                <thead><tr>
                  <th>Mahsulot</th><th>Filial</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th>
                </tr></thead>
                <tbody>${alertRows}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title" style="color:var(--amber)">
              <i class="ti ti-clock-alert"></i> Kam qolgan mahsulotlar (7 kun va kam)
            </div>
            <span class="badge badge-amber">${lowFiltered.length} ta</span>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table>
                <thead><tr>
                  <th>Mahsulot</th><th>Filial</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th>
                </tr></thead>
                <tbody>${lowRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Malumot yuklashda xato</div>';
  }
}

// ─── Products ─────────────────────────────────────────────────────────────────
function renderProducts() {
  const content = document.getElementById('content');
  const branchOptions = branches.map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');
  const catOptions = categories.map(c => `<option value="${escHtml(c.name)}">${escHtml(c.name)}</option>`).join('');

  content.innerHTML = `
    <div class="section-header">
      <div class="section-title">Mahsulotlar</div>
      <button class="btn btn-primary" onclick="openProductModal()">
        <i class="ti ti-plus"></i> Mahsulot qoshish
      </button>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="filter-branch" onchange="filterProducts()">
        <option value="">Barcha filiallar</option>
        ${branchOptions}
      </select>
      <select class="form-select" id="filter-category" onchange="filterProducts()">
        <option value="">Barcha kategoriyalar</option>
        ${catOptions}
      </select>
      <input class="form-input" id="filter-search" placeholder="Mahsulot nomi boyicha qidirish..." oninput="filterProducts()" />
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Mahsulot</th>
            <th>Filial</th>
            <th>Kategoriya</th>
            <th>Birlik</th>
            <th>Kunlik sarflanish</th>
            <th>Omborda</th>
            <th>Qolgan kunlar</th>
            <th>Holat</th>
            <th>Amallar</th>
          </tr></thead>
          <tbody id="products-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
  filterProducts();
}

function filterProducts() {
  const branchId = document.getElementById('filter-branch')?.value || '';
  const category = document.getElementById('filter-category')?.value || '';
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase();

  let filtered = products.filter(p => {
    if (branchId && String(p.branch_id) !== branchId) return false;
    if (category && p.category !== category) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    return true;
  });

  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><i class="ti ti-inbox"></i>Mahsulot topilmadi</div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const days = getDaysRemaining(p);
    return `
      <tr>
        <td><strong>${escHtml(p.name)}</strong>${p.note ? '<br><small style="color:var(--text-muted)">' + escHtml(p.note) + '</small>' : ''}</td>
        <td>${escHtml(p.branch_name || '—')}</td>
        <td>${p.category ? '<span class="badge badge-gray">' + escHtml(p.category) + '</span>' : '—'}</td>
        <td>${escHtml(p.unit || '—')}</td>
        <td>${p.daily_usage}</td>
        <td><strong>${p.current_stock}</strong></td>
        <td><strong>${days === 9999 ? '∞' : days}</strong> kun</td>
        <td>${getStatusBadge(days)}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm btn-icon" onclick="openProductModal(${p.id})" title="Tahrirlash">
              <i class="ti ti-pencil"></i>
            </button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="deleteProduct(${p.id})" title="Ochirish">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openProductModal(id) {
  const product = id ? products.find(p => p.id === id) : null;
  const title = product ? 'Mahsulotni tahrirlash' : 'Mahsulot qoshish';

  const branchOptions = branches.map(b =>
    '<option value="' + b.id + '"' + (product && product.branch_id === b.id ? ' selected' : '') + '>' + escHtml(b.name) + '</option>'
  ).join('');

  const catOptions = categories.map(c =>
    '<option value="' + escHtml(c.name) + '"' + (product && product.category === c.name ? ' selected' : '') + '>' + escHtml(c.name) + '</option>'
  ).join('');

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <form id="product-form" onsubmit="saveProduct(event, ${id || 'null'})">
        <div class="form-group">
          <label class="form-label">Mahsulot nomi *</label>
          <input class="form-control" name="name" required value="${product ? escHtml(product.name) : ''}" placeholder="Mahsulot nomi" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Filial</label>
            <select class="form-control" name="branch_id">
              <option value="">Tanlang</option>
              ${branchOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Kategoriya</label>
            <select class="form-control" name="category">
              <option value="">Tanlang</option>
              ${catOptions}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Birlik</label>
            <input class="form-control" name="unit" value="${product ? escHtml(product.unit || '') : ''}" placeholder="kg, dona, l ..." />
          </div>
          <div class="form-group">
            <label class="form-label">Kunlik sarflanish</label>
            <input class="form-control" type="number" step="0.1" min="0" name="daily_usage" value="${product ? product.daily_usage : 1}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Joriy zaxira</label>
            <input class="form-control" type="number" step="0.1" min="0" name="current_stock" value="${product ? product.current_stock : 0}" />
          </div>
          <div class="form-group">
            <label class="form-label">Minimal zaxira</label>
            <input class="form-control" type="number" step="0.1" min="0" name="min_stock" value="${product ? product.min_stock : 0}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Izoh</label>
          <textarea class="form-control" name="note" rows="2" placeholder="Qoshimcha malumot...">${product ? escHtml(product.note || '') : ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Bekor qilish</button>
          <button type="submit" class="btn btn-primary"><i class="ti ti-check"></i> Saqlash</button>
        </div>
      </form>
    </div>
  `);
}

async function saveProduct(e, id) {
  e.preventDefault();
  const form = e.target;
  const data = {
    name: form.name.value,
    branch_id: form.branch_id.value || null,
    category: form.category.value,
    unit: form.unit.value,
    daily_usage: parseFloat(form.daily_usage.value) || 1,
    current_stock: parseFloat(form.current_stock.value) || 0,
    min_stock: parseFloat(form.min_stock.value) || 0,
    note: form.note.value
  };
  try {
    if (id) {
      const updated = await api('PUT', '/api/products/' + id, data);
      const idx = products.findIndex(p => p.id === id);
      if (idx !== -1) products[idx] = updated;
    } else {
      const created = await api('POST', '/api/products', data);
      products.push(created);
    }
    closeModal();
    showToast(id ? 'Mahsulot yangilandi' : 'Mahsulot qoshildi', 'success');
    filterProducts();
    const alertData = await api('GET', '/api/dashboard/alerts');
    alerts = alertData;
    updateAlertBadge(alerts.length);
  } catch (err) {
    showToast('Xato: ' + err.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm("Bu mahsulotni ochirishni tasdiqlaysizmi?")) return;
  try {
    await api('DELETE', '/api/products/' + id);
    products = products.filter(p => p.id !== id);
    purchases = purchases.filter(p => p.product_id !== id);
    showToast("Mahsulot ochirildi", 'success');
    filterProducts();
  } catch (err) {
    showToast('Xato: ' + err.message, 'error');
  }
}

// ─── Purchases ────────────────────────────────────────────────────────────────
function renderPurchases() {
  const content = document.getElementById('content');
  const branchOptions = branches.map(b => '<option value="' + b.id + '">' + escHtml(b.name) + '</option>').join('');

  content.innerHTML = `
    <div class="section-header">
      <div class="section-title">Sotib olishlar</div>
      <button class="btn btn-primary" onclick="openPurchaseModal()">
        <i class="ti ti-plus"></i> Xarid qoshish
      </button>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="pur-filter-branch" onchange="filterPurchases()">
        <option value="">Barcha filiallar</option>
        ${branchOptions}
      </select>
      <input class="form-input" type="date" id="pur-filter-from" onchange="filterPurchases()" style="width:160px" />
      <input class="form-input" type="date" id="pur-filter-to" onchange="filterPurchases()" style="width:160px" />
      <button class="btn btn-secondary" onclick="clearPurFilters()"><i class="ti ti-x"></i> Tozalash</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Sana</th>
            <th>Mahsulot</th>
            <th>Filial</th>
            <th>Miqdor</th>
            <th>Narx (som)</th>
            <th>Jami</th>
            <th>Yetkazuvchi</th>
            <th>Amallar</th>
          </tr></thead>
          <tbody id="purchases-tbody"></tbody>
        </table>
      </div>
    </div>
  `;
  filterPurchases();
}

function clearPurFilters() {
  const fromEl = document.getElementById('pur-filter-from');
  const toEl = document.getElementById('pur-filter-to');
  const branchEl = document.getElementById('pur-filter-branch');
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  if (branchEl) branchEl.value = '';
  filterPurchases();
}

function filterPurchases() {
  const branchId = document.getElementById('pur-filter-branch')?.value || '';
  const dateFrom = document.getElementById('pur-filter-from')?.value || '';
  const dateTo = document.getElementById('pur-filter-to')?.value || '';

  let filtered = purchases.filter(p => {
    if (branchId && String(p.branch_id) !== branchId) return false;
    if (dateFrom && p.purchase_date < dateFrom) return false;
    if (dateTo && p.purchase_date > dateTo) return false;
    return true;
  });

  const tbody = document.getElementById('purchases-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><i class="ti ti-inbox"></i>Xarid topilmadi</div></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td>${formatDate(p.purchase_date)}</td>
      <td><strong>${escHtml(p.product_name || '—')}</strong></td>
      <td>${escHtml(p.branch_name || '—')}</td>
      <td>${p.quantity} ${escHtml(p.unit || '')}</td>
      <td>${formatCurrency(p.unit_price)}</td>
      <td><strong>${formatCurrency(p.quantity * p.unit_price)}</strong></td>
      <td>${escHtml(p.supplier || '—')}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-secondary btn-sm btn-icon" onclick="openPurchaseModal(${p.id})" title="Tahrirlash">
            <i class="ti ti-pencil"></i>
          </button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deletePurchase(${p.id})" title="Ochirish">
            <i class="ti ti-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openPurchaseModal(id) {
  const purchase = id ? purchases.find(p => p.id === id) : null;
  const title = purchase ? 'Xaridni tahrirlash' : 'Xarid qoshish';

  const productsByBranch = {};
  branches.forEach(b => { productsByBranch[b.id] = { name: b.name, prods: [] }; });
  products.forEach(p => {
    if (p.branch_id && productsByBranch[p.branch_id]) {
      productsByBranch[p.branch_id].prods.push(p);
    }
  });

  let productOptions = '';
  Object.values(productsByBranch).forEach(g => {
    if (g.prods.length > 0) {
      productOptions += '<optgroup label="' + escHtml(g.name) + '">';
      g.prods.forEach(p => {
        productOptions += '<option value="' + p.id + '"' + (purchase && purchase.product_id === p.id ? ' selected' : '') + '>' + escHtml(p.name) + '</option>';
      });
      productOptions += '</optgroup>';
    }
  });

  const today = new Date().toISOString().split('T')[0];

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <form id="purchase-form" onsubmit="savePurchase(event, ${id || 'null'})">
        <div class="form-group">
          <label class="form-label">Mahsulot *</label>
          <select class="form-control" name="product_id" required>
            <option value="">Mahsulot tanlang</option>
            ${productOptions}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Miqdor *</label>
            <input class="form-control" type="number" step="0.1" min="0.1" name="quantity" required
              value="${purchase ? purchase.quantity : ''}" placeholder="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Birlik narxi (som)</label>
            <input class="form-control" type="number" step="1" min="0" name="unit_price"
              value="${purchase ? purchase.unit_price : ''}" placeholder="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Xarid sanasi</label>
            <input class="form-control" type="date" name="purchase_date"
              value="${purchase ? purchase.purchase_date : today}" />
          </div>
          <div class="form-group">
            <label class="form-label">Yetkazuvchi</label>
            <input class="form-control" name="supplier"
              value="${purchase ? escHtml(purchase.supplier || '') : ''}" placeholder="Yetkazuvchi nomi" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Izoh</label>
          <textarea class="form-control" name="note" rows="2">${purchase ? escHtml(purchase.note || '') : ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Bekor qilish</button>
          <button type="submit" class="btn btn-primary"><i class="ti ti-check"></i> Saqlash</button>
        </div>
      </form>
    </div>
  `);
}

async function savePurchase(e, id) {
  e.preventDefault();
  const form = e.target;
  const data = {
    product_id: parseInt(form.product_id.value),
    quantity: parseFloat(form.quantity.value),
    unit_price: parseFloat(form.unit_price.value) || 0,
    purchase_date: form.purchase_date.value,
    supplier: form.supplier.value,
    note: form.note.value
  };
  try {
    if (id) {
      const updated = await api('PUT', '/api/purchases/' + id, data);
      const idx = purchases.findIndex(p => p.id === id);
      if (idx !== -1) purchases[idx] = updated;
    } else {
      const created = await api('POST', '/api/purchases', data);
      purchases.unshift(created);
    }
    products = await api('GET', '/api/products');
    closeModal();
    showToast(id ? 'Xarid yangilandi' : 'Xarid qoshildi', 'success');
    filterPurchases();
    const alertData = await api('GET', '/api/dashboard/alerts');
    alerts = alertData;
    updateAlertBadge(alerts.length);
  } catch (err) {
    showToast('Xato: ' + err.message, 'error');
  }
}

async function deletePurchase(id) {
  if (!confirm("Bu xaridni ochirishni tasdiqlaysizmi? Mahsulot zaxirasi ham kamayadi.")) return;
  try {
    await api('DELETE', '/api/purchases/' + id);
    purchases = purchases.filter(p => p.id !== id);
    products = await api('GET', '/api/products');
    showToast("Xarid ochirildi", 'success');
    filterPurchases();
  } catch (err) {
    showToast('Xato: ' + err.message, 'error');
  }
}

// ─── Branches ─────────────────────────────────────────────────────────────────
async function renderBranches() {
  const content = document.getElementById('content');
  try {
    branches = await api('GET', '/api/branches');
    const allProducts = await api('GET', '/api/products');
    const alertList = await api('GET', '/api/dashboard/alerts');
    const alertProductIds = new Set(alertList.map(p => p.id));

    const cards = branches.map(b => {
      const branchProds = allProducts.filter(p => p.branch_id === b.id);
      const lowCount = branchProds.filter(p => alertProductIds.has(p.id)).length;
      return `
        <div class="branch-card" onclick="showBranchProducts(${b.id})">
          <div class="branch-card-header">
            <div class="branch-icon"><i class="ti ti-building-store"></i></div>
            <div class="branch-actions" onclick="event.stopPropagation()">
              <button class="btn btn-secondary btn-sm btn-icon" onclick="openBranchModal(${b.id})" title="Tahrirlash">
                <i class="ti ti-pencil"></i>
              </button>
              <button class="btn btn-danger btn-sm btn-icon" onclick="deleteBranch(${b.id})" title="Ochirish">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </div>
          <div class="branch-name">${escHtml(b.name)}</div>
          <div class="branch-address"><i class="ti ti-map-pin" style="font-size:12px"></i> ${escHtml(b.address || '—')}</div>
          <div class="branch-meta">
            ${b.manager ? '<div class="branch-meta-item"><i class="ti ti-user"></i> ' + escHtml(b.manager) + '</div>' : ''}
            ${b.phone ? '<div class="branch-meta-item"><i class="ti ti-phone"></i> ' + escHtml(b.phone) + '</div>' : ''}
          </div>
          <div class="branch-stats">
            <div class="branch-stat">
              <div class="branch-stat-value">${branchProds.length}</div>
              <div class="branch-stat-label">Mahsulot</div>
            </div>
            <div class="branch-stat">
              <div class="branch-stat-value" style="color:${lowCount > 0 ? 'var(--red)' : 'var(--teal)'}">${lowCount}</div>
              <div class="branch-stat-label">Kritik</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    content.innerHTML = `
      <div class="section-header">
        <div class="section-title">Filiallar</div>
        <button class="btn btn-primary" onclick="openBranchModal()">
          <i class="ti ti-plus"></i> Filial qoshish
        </button>
      </div>
      <div class="branches-grid">${cards || '<div class="empty-state"><i class="ti ti-building-store"></i>Hech qanday filial yoq</div>'}</div>
    `;
  } catch (e) {
    content.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Xato yuz berdi</div>';
  }
}

function showBranchProducts(branchId) {
  const branch = branches.find(b => b.id === branchId);
  if (!branch) return;
  const branchProds = products.filter(p => p.branch_id === branchId);

  if (branchProds.length === 0) {
    showToast('Bu filialda mahsulot yoq', 'info');
    return;
  }

  const rows = branchProds.map(p => {
    const days = getDaysRemaining(p);
    return `
      <tr>
        <td><strong>${escHtml(p.name)}</strong></td>
        <td>${p.category ? '<span class="badge badge-gray">' + escHtml(p.category) + '</span>' : '—'}</td>
        <td>${p.current_stock} ${escHtml(p.unit || '')}</td>
        <td>${p.daily_usage}</td>
        <td>${days === 9999 ? '∞' : days} kun</td>
        <td>${getStatusBadge(days)}</td>
      </tr>
    `;
  }).join('');

  openModal(`
    <div class="modal-header">
      <div class="modal-title"><i class="ti ti-building-store"></i> ${escHtml(branch.name)} – Mahsulotlar</div>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Mahsulot</th><th>Kategoriya</th><th>Omborda</th><th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `);
}

function openBranchModal(id) {
  const branch = id ? branches.find(b => b.id === id) : null;
  const title = branch ? 'Filialni tahrirlash' : 'Filial qoshish';

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <form id="branch-form" onsubmit="saveBranch(event, ${id || 'null'})">
        <div class="form-group">
          <label class="form-label">Filial nomi *</label>
          <input class="form-control" name="name" required value="${branch ? escHtml(branch.name) : ''}" placeholder="Filial nomi" />
        </div>
        <div class="form-group">
          <label class="form-label">Manzil</label>
          <input class="form-control" name="address" value="${branch ? escHtml(branch.address || '') : ''}" placeholder="Shahar, kochasi, uy raqami" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Menejer</label>
            <input class="form-control" name="manager" value="${branch ? escHtml(branch.manager || '') : ''}" placeholder="F.I.O." />
          </div>
          <div class="form-group">
            <label class="form-label">Telefon</label>
            <input class="form-control" name="phone" value="${branch ? escHtml(branch.phone || '') : ''}" placeholder="+998 __ ___ ____" />
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Bekor qilish</button>
          <button type="submit" class="btn btn-primary"><i class="ti ti-check"></i> Saqlash</button>
        </div>
      </form>
    </div>
  `);
}

async function saveBranch(e, id) {
  e.preventDefault();
  const form = e.target;
  const data = {
    name: form.name.value,
    address: form.address.value,
    manager: form.manager.value,
    phone: form.phone.value
  };
  try {
    if (id) {
      const updated = await api('PUT', '/api/branches/' + id, data);
      const idx = branches.findIndex(b => b.id === id);
      if (idx !== -1) branches[idx] = updated;
    } else {
      const created = await api('POST', '/api/branches', data);
      branches.push(created);
    }
    closeModal();
    showToast(id ? 'Filial yangilandi' : 'Filial qoshildi', 'success');
    renderBranches();
  } catch (err) {
    showToast('Xato: ' + err.message, 'error');
  }
}

async function deleteBranch(id) {
  if (!confirm("Bu filialni ochirishni tasdiqlaysizmi?")) return;
  try {
    await api('DELETE', '/api/branches/' + id);
    branches = branches.filter(b => b.id !== id);
    showToast("Filial ochirildi", 'success');
    renderBranches();
  } catch (err) {
    showToast('Xato: ' + err.message, 'error');
  }
}

// ─── Report ───────────────────────────────────────────────────────────────────
async function renderReport() {
  const content = document.getElementById('content');
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 3; y--) {
    yearOptions.push('<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' + y + '</option>');
  }

  const monthNames = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
  const monthOptions = monthNames.map((m, i) =>
    '<option value="' + (i + 1) + '"' + (i + 1 === currentMonth ? ' selected' : '') + '>' + m + '</option>'
  ).join('');

  content.innerHTML = `
    <div class="section-header">
      <div class="section-title">Hisobot</div>
    </div>
    <div class="filter-bar" style="margin-bottom:20px">
      <select class="form-select" id="report-year" onchange="loadReport()">${yearOptions.join('')}</select>
      <select class="form-select" id="report-month" onchange="loadReport()">${monthOptions}</select>
    </div>
    <div id="report-content">
      <div class="loading-state"><i class="ti ti-loader-2 spin"></i><span>Yuklanmoqda...</span></div>
    </div>
  `;
  loadReport();
}

async function loadReport() {
  const year = document.getElementById('report-year')?.value;
  const month = document.getElementById('report-month')?.value;
  const reportContent = document.getElementById('report-content');
  if (!reportContent) return;

  try {
    const data = await api('GET', '/api/report?year=' + year + '&month=' + month);
    const totalPurchases = data.reduce((s, r) => s + r.purchase_count, 0);
    const totalAmount = data.reduce((s, r) => s + r.total_amount, 0);
    const monthNames = ['','Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

    const rows = data.map(r => {
      const pct = totalAmount > 0 ? Math.round(r.total_amount / totalAmount * 100) : 0;
      return `
        <tr>
          <td><strong>${escHtml(r.branch_name)}</strong></td>
          <td><span class="badge badge-blue">${r.purchase_count}</span></td>
          <td><strong>${formatCurrency(r.total_amount)}</strong></td>
          <td>${r.top_product ? escHtml(r.top_product) : '<span style="color:var(--text-muted)">—</span>'}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;background:#f1f5f9;border-radius:4px;height:6px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:var(--teal);border-radius:4px"></div>
              </div>
              <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">${pct}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    reportContent.innerHTML = `
      <div class="report-summary">
        <div class="stat-card">
          <div class="stat-icon teal"><i class="ti ti-building-store"></i></div>
          <div>
            <div class="stat-label">Filiallar soni</div>
            <div class="stat-value">${data.length}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue"><i class="ti ti-shopping-cart"></i></div>
          <div>
            <div class="stat-label">Jami xaridlar</div>
            <div class="stat-value">${totalPurchases}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber"><i class="ti ti-currency-dollar"></i></div>
          <div>
            <div class="stat-label">Jami xarajat</div>
            <div class="stat-value" style="font-size:16px">${formatCurrency(totalAmount)}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">${monthNames[parseInt(month)]} ${year} – Filiallar kesimida hisobot</div>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Filial</th>
                <th>Xarid soni</th>
                <th>Jami summa</th>
                <th>Eng kop xaridlar mahsuloti</th>
                <th>Ulush (%)</th>
              </tr></thead>
              <tbody>
                ${rows}
                <tr style="background:#f8fafc;font-weight:700">
                  <td>Jami</td>
                  <td>${totalPurchases}</td>
                  <td>${formatCurrency(totalAmount)}</td>
                  <td colspan="2">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    reportContent.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>Hisobot yuklanmadi</div>';
  }
}

// ─── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const box = document.getElementById('modal-box');
  box.innerHTML = html;
  overlay.classList.add('open');
  setTimeout(() => {
    const first = box.querySelector('input, select, textarea');
    if (first) first.focus();
  }, 50);
}

function closeModal(event) {
  if (event && event.target !== document.getElementById('modal-overlay')) return;
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.remove('open');
  document.getElementById('modal-box').innerHTML = '';
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type) {
  type = type || 'success';
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: 'ti-circle-check', error: 'ti-circle-x', info: 'ti-info-circle' };
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = '<i class="ti ' + (icons[type] || icons.info) + '"></i>' + escHtml(message);
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCurrency(amount) {
  if (!amount && amount !== 0) return '—';
  const num = Math.round(amount);
  return num.toLocaleString('ru-RU').replace(/\s/g, ' ') + " so'm";
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  } catch(e) {
    return dateStr;
  }
}

function getDaysRemaining(product) {
  if (!product.daily_usage || product.daily_usage <= 0) return 9999;
  return Math.round((product.current_stock / product.daily_usage) * 10) / 10;
}

function getStatusBadge(days) {
  if (days === 9999) return '<span class="badge badge-gray">Cheksiz</span>';
  if (days <= 0)  return '<span class="badge badge-red"><i class="ti ti-alert-circle"></i> Tugagan</span>';
  if (days <= 2)  return '<span class="badge badge-red"><i class="ti ti-alert-triangle"></i> Kritik</span>';
  if (days <= 7)  return '<span class="badge badge-amber"><i class="ti ti-clock"></i> Kam qoldi</span>';
  if (days <= 14) return '<span class="badge badge-blue"><i class="ti ti-info-circle"></i> Diqqat</span>';
  return '<span class="badge badge-teal"><i class="ti ti-circle-check"></i> Yetarli</span>';
}

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── API wrapper ──────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin'
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Unauthorized');
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Server xatosi');
  }
  return data;
}
