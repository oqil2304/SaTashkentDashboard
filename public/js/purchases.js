// ─── purchases.js — Sotib olishlar bo'limi ───────────────────────────────────
console.log('[purchases.js] yuklandi');

function renderPurchases(c) {
  console.log('[purchases.js] renderPurchases, purchases:', purchases.length);
  const brOpts = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Sotib olishlar tarixi</div>
      <button class="btn btn-primary" onclick="openAddPurchase(null)"><i class="ti ti-plus"></i>Qoʻshish</button>
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

function openAddPurchase(preId) {
  const prOpts = products.map(p =>
    `<option value="${p.id}" ${p.id == preId ? 'selected' : ''}>${esc(p.name)} (${esc(brName(p.branch_id))})</option>`
  ).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Sotib olish qoʻshish</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Mahsulot *</label>
        <select class="form-control" id="xp"><option value="">Tanlang</option>${prOpts}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Miqdor *</label>
          <input class="form-control" id="xq" type="number" step="0.01" placeholder="10"></div>
        <div class="form-group"><label class="form-label">Birlik narxi (soʻm)</label>
          <input class="form-control" id="xpr" type="number" placeholder="15000"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Sana</label>
          <input class="form-control" id="xd" type="date" value="${today()}"></div>
        <div class="form-group"><label class="form-label">Yetkazib beruvchi</label>
          <input class="form-control" id="xs" placeholder="Kompaniya nomi"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label>
        <input class="form-control" id="xn" placeholder="Qoʻshimcha maʼlumot"></div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 13px;font-size:12px;color:#166534;margin-bottom:4px">
        <i class="ti ti-info-circle"></i> Sotib olish qoʻshilganda omborga avtomatik qoʻshiladi.
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="savePurchase(null)"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

function openEditPurchase(id) {
  const p = purchases.find(x => x.id == id); if (!p) return;
  const prOpts = products.map(pr =>
    `<option value="${pr.id}" ${pr.id == p.product_id ? 'selected' : ''}>${esc(pr.name)} (${esc(brName(pr.branch_id))})</option>`
  ).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Sotib olishni tahrirlash</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Mahsulot *</label>
        <select class="form-control" id="xp"><option value="">Tanlang</option>${prOpts}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Miqdor *</label>
          <input class="form-control" id="xq" type="number" step="0.01" value="${p.quantity}"></div>
        <div class="form-group"><label class="form-label">Birlik narxi (soʻm)</label>
          <input class="form-control" id="xpr" type="number" value="${p.unit_price}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Sana</label>
          <input class="form-control" id="xd" type="date" value="${p.purchase_date}"></div>
        <div class="form-group"><label class="form-label">Yetkazib beruvchi</label>
          <input class="form-control" id="xs" value="${esc(p.supplier || '')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label>
        <input class="form-control" id="xn" value="${esc(p.note || '')}"></div>
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
