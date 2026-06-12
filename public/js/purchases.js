// ─── purchases.js — Sotib olishlar bo'limi ───────────────────────────────────
console.log('[purchases.js] yuklandi');

function renderPurchases(c) {
  console.log('[purchases.js] renderPurchases, purchases:', purchases.length);
  const brOpts = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Sotib olishlar tarixi</div>
      <button class="btn btn-primary" onclick="openAddPurchase(null)"><i class="ti ti-shopping-cart"></i>Sotib olish</button>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="xf-br" onchange="applyPurchaseFilter()">
        <option value="">Barcha filiallar</option>${brOpts}
      </select>
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
  const bf = document.getElementById('xf-br')?.value   || '';
  const df = document.getElementById('xf-from')?.value || '';
  const dt = document.getElementById('xf-to')?.value   || '';
  const qf = (document.getElementById('xf-q')?.value   || '').toLowerCase();
  const list = purchases.filter(p =>
    (!bf || p.branch_id == bf) &&
    (!df || (p.purchase_date || '') >= df) &&
    (!dt || (p.purchase_date || '') <= dt) &&
    (!qf || (p.product_name || '').toLowerCase().includes(qf) || (p.supplier || '').toLowerCase().includes(qf))
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
    const sum = (p.quantity || 0) * (p.unit_price || 0);
    total += sum;
    return `<tr>
      <td style="color:#64748b">${esc(p.purchase_date)}</td>
      <td style="font-weight:600">${esc(p.product_name || '—')}</td>
      <td><span class="badge badge-gray">${esc(p.branch_name || '—')}</span></td>
      <td>${p.quantity} ${esc(p.unit || '')}</td>
      <td>${fmtMoney(p.unit_price)}</td>
      <td style="font-weight:700;color:var(--teal)">${fmtMoney(sum)}</td>
      <td style="color:#64748b">${esc(p.supplier || '—')}</td>
      <td style="white-space:nowrap;text-align:right">
        <button class="btn btn-sm btn-secondary btn-icon" onclick="openEditPurchase(${p.id})"><i class="ti ti-edit"></i></button>
        <button class="btn btn-sm btn-danger btn-icon" onclick="delPurchase(${p.id})"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
  const tot = document.getElementById('purchases-total');
  if (tot) tot.innerHTML = `Jami: <strong style="color:var(--teal);font-size:15px">${fmtMoney(total)}</strong> (${list.length} ta yozuv)`;
}

// Filial tanlanganida datalist ni yangilash
function _purchBranchChange() {
  const brId = document.getElementById('xbr').value;
  const dl = document.getElementById('xp-list');
  if (!dl) return;
  const prods = brId ? products.filter(p => p.branch_id == brId) : products;
  dl.innerHTML = prods.map(p => `<option value="${esc(p.name)}"></option>`).join('');
}

function _purchModal(title, saveFn, opts = {}) {
  const firstBr = branches[0];
  const brOpts  = branches.map(b =>
    `<option value="${b.id}" ${b.id == opts.branch_id ? 'selected' : (opts.branch_id == null && b.id == firstBr?.id ? 'selected' : '')}>${esc(b.name)}</option>`
  ).join('');

  openModal(`
    <div class="modal-header">
      <div class="modal-title">${title}</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Filial *</label>
          <select class="form-control" id="xbr" onchange="_purchBranchChange()">
            ${brOpts}
          </select></div>
        <div class="form-group"><label class="form-label">Mahsulot *</label>
          <input class="form-control" id="xp" list="xp-list" placeholder="Mahsulot nomi" value="${esc(opts.product_name || '')}" autocomplete="off">
          <datalist id="xp-list"></datalist>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Miqdor *</label>
          <input class="form-control" id="xq" type="number" step="0.01" placeholder="10" value="${opts.quantity || ''}"></div>
        <div class="form-group"><label class="form-label">Birlik narxi (soʻm)</label>
          <input class="form-control" id="xpr" type="number" placeholder="15000" value="${opts.unit_price || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Sana</label>
          <input class="form-control" id="xd" type="date" value="${opts.purchase_date || today()}"></div>
        <div class="form-group"><label class="form-label">Yetkazib beruvchi</label>
          <input class="form-control" id="xs" placeholder="Kompaniya nomi" value="${esc(opts.supplier || '')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label>
        <input class="form-control" id="xn" placeholder="Qoʻshimcha maʼlumot" value="${esc(opts.note || '')}"></div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 13px;font-size:12px;color:#166534;margin-bottom:4px">
        <i class="ti ti-info-circle"></i> Sotib olish qoʻshilganda omborga avtomatik qoʻshiladi.
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="${saveFn}"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);

  // Datalistni darhol to'ldirish
  _purchBranchChange();
}

function openAddPurchase(preId) {
  const preProd   = preId ? products.find(p => p.id == preId) : null;
  const branchId  = preProd ? preProd.branch_id : (branches[0]?.id ?? null);
  _purchModal('Sotib olish qoʻshish', 'savePurchase(null)', {
    branch_id:    branchId,
    product_name: preProd?.name || ''
  });
}

function openEditPurchase(id) {
  const p = purchases.find(x => x.id == id); if (!p) return;
  _purchModal('Sotib olishni tahrirlash', `savePurchase(${id})`, {
    branch_id:    p.branch_id,
    product_name: p.product_name || '',
    quantity:     p.quantity,
    unit_price:   p.unit_price,
    purchase_date: p.purchase_date,
    supplier:     p.supplier || '',
    note:         p.note || ''
  });
}

async function savePurchase(id) {
  const brId    = document.getElementById('xbr').value;
  const pName   = document.getElementById('xp').value.trim();
  const quantity = parseFloat(document.getElementById('xq').value);
  if (!pName)             { toast('Mahsulot nomini kiriting', 'error'); return; }
  if (!quantity || quantity <= 0) { toast('Miqdorni kiriting', 'error'); return; }

  // Mahsulotni nom va filial bo'yicha topamiz
  const prod = products.find(p =>
    p.name.toLowerCase() === pName.toLowerCase() && (!brId || p.branch_id == brId)
  ) || products.find(p => p.name.toLowerCase() === pName.toLowerCase());

  if (!prod) { toast(`"${pName}" mahsuloti topilmadi`, 'error'); return; }

  const body = {
    product_id:    prod.id,
    quantity,
    unit_price:    parseFloat(document.getElementById('xpr').value) || 0,
    purchase_date: document.getElementById('xd').value || today(),
    supplier:      document.getElementById('xs').value,
    note:          document.getElementById('xn').value
  };
  try {
    if (id) await api('PUT', `/api/purchases/${id}`, body);
    else    await api('POST', '/api/purchases', body);
    toast(id ? 'Yangilandi' : "Qoʻshildi");
    closeModal(true);
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

async function delPurchase(id) {
  if (!confirm("Sotib olishni oʻchirishni tasdiqlaysizmi?")) return;
  try {
    await api('DELETE', `/api/purchases/${id}`);
    toast("Oʻchirildi");
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}
