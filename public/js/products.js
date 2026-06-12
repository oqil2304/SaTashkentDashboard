// ─── products.js — Mahsulotlar bo'limi ───────────────────────────────────────
console.log('[products.js] yuklandi');

function renderProducts(c) {
  console.log('[products.js] renderProducts, products:', products.length);
  const brOpts  = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  const catSet  = [...new Set(products.map(p => p.category).filter(Boolean))];
  const catOpts = catSet.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('');

  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Barcha mahsulotlar</div>
      <button class="btn btn-primary" onclick="openAddProduct()"><i class="ti ti-plus"></i>Qoʻshish</button>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="pf-br" onchange="applyProductFilter()">
        <option value="">Barcha filiallar</option>${brOpts}
      </select>
      <select class="form-select" id="pf-cat" onchange="applyProductFilter()">
        <option value="">Barcha kategoriyalar</option>${catOpts}
      </select>
      <input class="form-input" id="pf-q" placeholder="Qidirish..." oninput="applyProductFilter()">
    </div>
    <div class="card"><div class="table-wrap">
      <table>
        <thead><tr>
          <th>Mahsulot</th><th>Kategoriya</th><th>Filial</th><th>Omborda</th>
          <th>Kunlik sarflanish</th><th>Qolgan kun</th><th>Holat</th><th></th>
        </tr></thead>
        <tbody id="products-tbody"></tbody>
      </table>
    </div></div>`;
  applyProductFilter();
}

function applyProductFilter() {
  const bf  = document.getElementById('pf-br')?.value  || '';
  const cf  = document.getElementById('pf-cat')?.value || '';
  const qf  = (document.getElementById('pf-q')?.value  || '').toLowerCase();
  const list = products.filter(p =>
    (!bf || p.branch_id == bf) &&
    (!cf || p.category === cf) &&
    (!qf || (p.name || '').toLowerCase().includes(qf))
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
      <td>
        <div style="font-weight:600">${esc(p.name)}</div>
        ${p.note ? `<div style="font-size:11px;color:#94a3b8">${esc(p.note)}</div>` : ''}
      </td>
      <td>${p.category ? `<span class="badge badge-blue">${esc(p.category)}</span>` : '—'}</td>
      <td><span class="badge badge-gray">${esc(p.branch_name || brName(p.branch_id))}</span></td>
      <td style="font-weight:600">${p.current_stock} ${esc(p.unit)}</td>
      <td style="color:#64748b">${p.daily_usage} ${esc(p.unit)}/kun</td>
      <td style="font-weight:700;color:${daysColor(d)}">${isFinite(d) ? d.toFixed(1) : '—'}</td>
      <td>${statusBadge(d)}</td>
      <td style="white-space:nowrap;text-align:right">
        <button class="btn btn-sm btn-secondary btn-icon" onclick="openAddPurchase(${p.id})" title="Sotib olish"><i class="ti ti-shopping-cart"></i></button>
        <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditProduct(${p.id})" title="Tahrirlash"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="delProduct(${p.id})" title="Oʻchirish"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

const CAT_LIST = ['Oziq-ovqat', "Yoqilg'i", "Uy-ro'zg'or", 'Elektr', 'Ofis', 'Boshqa'];

function openAddProduct() {
  const brOpts  = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  const catOpts = CAT_LIST.map(c => `<option>${esc(c)}</option>`).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Mahsulot qoʻshish</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nomi *</label><input class="form-control" id="mn" placeholder="Guruch"></div>
        <div class="form-group"><label class="form-label">Kategoriya</label>
          <select class="form-control" id="mc"><option value="">Tanlang</option>${catOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Filial *</label>
          <select class="form-control" id="mb"><option value="">Tanlang</option>${brOpts}</select></div>
        <div class="form-group"><label class="form-label">Birlik</label>
          <input class="form-control" id="mu" placeholder="kg, dona, litr..."></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ombordagi miqdor</label>
          <input class="form-control" id="ms" type="number" value="0"></div>
        <div class="form-group"><label class="form-label">Kunlik sarflanish</label>
          <input class="form-control" id="md" type="number" step="0.1" value="1"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label>
        <input class="form-control" id="mnote" placeholder="Qoʻshimcha maʼlumot"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveProduct(null)"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

function openEditProduct(id) {
  const p = products.find(x => x.id == id); if (!p) return;
  const brOpts  = branches.map(b => `<option value="${b.id}" ${b.id == p.branch_id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  const catOpts = CAT_LIST.map(c => `<option ${c === p.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Mahsulotni tahrirlash</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nomi *</label>
          <input class="form-control" id="mn" value="${esc(p.name)}"></div>
        <div class="form-group"><label class="form-label">Kategoriya</label>
          <select class="form-control" id="mc"><option value="">Tanlang</option>${catOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Filial</label>
          <select class="form-control" id="mb"><option value="">Tanlang</option>${brOpts}</select></div>
        <div class="form-group"><label class="form-label">Birlik</label>
          <input class="form-control" id="mu" value="${esc(p.unit || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ombordagi miqdor</label>
          <input class="form-control" id="ms" type="number" value="${p.current_stock}"></div>
        <div class="form-group"><label class="form-label">Kunlik sarflanish</label>
          <input class="form-control" id="md" type="number" step="0.1" value="${p.daily_usage}"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label>
        <input class="form-control" id="mnote" value="${esc(p.note || '')}"></div>
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
    branch_id:     document.getElementById('mb').value || null,
    unit:          document.getElementById('mu').value,
    current_stock: parseFloat(document.getElementById('ms').value) || 0,
    daily_usage:   parseFloat(document.getElementById('md').value) || 1,
    note:          document.getElementById('mnote').value
  };
  try {
    if (id) await api('PUT', `/api/products/${id}`, body);
    else    await api('POST', '/api/products', body);
    toast(id ? 'Yangilandi' : "Qoʻshildi");
    closeModal(true);
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

async function delProduct(id) {
  if (!confirm("Mahsulotni oʻchirishni tasdiqlaysizmi?")) return;
  try {
    await api('DELETE', `/api/products/${id}`);
    toast("Oʻchirildi");
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}
