// ─── catalog.js — Mahsulotlar katalogi bo'limi ───────────────────────────────
console.log('[catalog.js] yuklandi');

let catalogItems = [];

async function loadCatalog() {
  try { catalogItems = await api('GET', '/api/catalog'); } catch (_) { catalogItems = []; }
}

function renderCatalog(c) {
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Mahsulotlar katalogi</div>
      <button class="btn btn-primary" onclick="openAddCatalog()"><i class="ti ti-plus"></i>Yangi mahsulot</button>
    </div>
    <div class="filter-bar">
      <input class="form-input" id="cat-q" placeholder="Qidirish..." oninput="renderCatalogTable()">
    </div>
    <div class="card"><div class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>Nomi</th><th>Birlik</th><th></th></tr></thead>
        <tbody id="catalog-tbody"></tbody>
      </table>
    </div></div>`;
  renderCatalogTable();
}

function renderCatalogTable() {
  const q = (document.getElementById('cat-q')?.value || '').toLowerCase();
  const list = catalogItems.filter(it => !q || (it.name || '').toLowerCase().includes(q) || (it.unit || '').toLowerCase().includes(q));
  const tbody = document.getElementById('catalog-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="ti ti-package-off"></i><p>Mahsulot topilmadi</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((it, i) => `<tr>
    <td style="color:#94a3b8">${i + 1}</td>
    <td style="font-weight:600">${esc(it.name)}</td>
    <td><span class="badge badge-gray">${esc(it.unit || '—')}</span></td>
    <td style="text-align:right;white-space:nowrap">
      <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditCatalog(${it.id})"><i class="ti ti-edit"></i></button>
      <button class="btn btn-sm btn-danger btn-icon" onclick="delCatalog(${it.id})"><i class="ti ti-trash"></i></button>
    </td>
  </tr>`).join('');
}

function _catalogModal(title, saveFn, opts = {}) {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Nomi *</label>
        <input class="form-control" id="cit-name" placeholder="Masalan: Un (Bug'doy)" value="${esc(opts.name || '')}">
      </div>
      <div class="form-group"><label class="form-label">Birlik</label>
        <input class="form-control" id="cit-unit" list="cit-unit-list" placeholder="kg, dona, litr..." value="${esc(opts.unit || '')}">
        <datalist id="cit-unit-list">
          <option value="kg"><option value="gr"><option value="litr"><option value="ml">
          <option value="dona"><option value="quti"><option value="rulon"><option value="metr">
        </datalist>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="${saveFn}"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
  document.getElementById('cit-name')?.focus();
}

function openAddCatalog() {
  _catalogModal('Yangi mahsulot qo\'shish', 'saveCatalog(null)');
}

function openEditCatalog(id) {
  const it = catalogItems.find(x => x.id == id); if (!it) return;
  _catalogModal('Mahsulotni tahrirlash', `saveCatalog(${id})`, { name: it.name, unit: it.unit });
}

async function saveCatalog(id) {
  const name = document.getElementById('cit-name')?.value.trim();
  const unit = document.getElementById('cit-unit')?.value.trim();
  if (!name) { toast('Nomini kiriting', 'error'); return; }
  try {
    if (id) {
      const updated = await api('PUT', `/api/catalog/${id}`, { name, unit });
      const idx = catalogItems.findIndex(x => x.id == id);
      if (idx >= 0) catalogItems[idx] = updated;
    } else {
      const created = await api('POST', '/api/catalog', { name, unit });
      catalogItems.push(created);
    }
    toast(id ? 'Yangilandi' : 'Qo\'shildi');
    closeModal(true);
    renderCatalogTable();
  } catch (e) { toast(e.message, 'error'); }
}

async function delCatalog(id) {
  if (!confirm('Mahsulotni o\'chirishni tasdiqlaysizmi?')) return;
  try {
    await api('DELETE', `/api/catalog/${id}`);
    catalogItems = catalogItems.filter(x => x.id != id);
    toast('O\'chirildi');
    renderCatalogTable();
  } catch (e) { toast(e.message, 'error'); }
}
