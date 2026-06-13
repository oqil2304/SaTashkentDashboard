// ─── consumptions.js — Rasxodlar (ombordan chiqim) bo'limi ───────────────────
console.log('[consumptions.js] yuklandi');

function renderConsumptions(c) {
  console.log('[consumptions.js] renderConsumptions, consumptions:', consumptions.length);
  const brOpts = branches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  c.innerHTML = `
    <div class="section-header">
      <div class="section-title">Rasxodlar tarixi</div>
      <button class="btn btn-primary" onclick="openAddConsumption(null)"><i class="ti ti-package-export"></i>Rasxod qilish</button>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="cf-br" onchange="applyConsumptionFilter()">
        <option value="">Barcha filiallar (kim uchun)</option>${brOpts}
      </select>
      <input type="date" class="form-input" id="cf-from" onchange="applyConsumptionFilter()">
      <input type="date" class="form-input" id="cf-to"   onchange="applyConsumptionFilter()">
      <input class="form-input" id="cf-q" placeholder="Qidirish..." oninput="applyConsumptionFilter()">
    </div>
    <div class="card"><div class="table-wrap">
      <table>
        <thead><tr>
          <th>Sana</th><th>Mahsulot</th><th>Ombor (qayerdan)</th><th>Filial uchun</th><th>Miqdor</th><th>Izoh</th><th></th>
        </tr></thead>
        <tbody id="consumptions-tbody"></tbody>
      </table>
    </div></div>`;
  applyConsumptionFilter();
}

function applyConsumptionFilter() {
  const bf = document.getElementById('cf-br')?.value   || '';
  const df = document.getElementById('cf-from')?.value || '';
  const dt = document.getElementById('cf-to')?.value   || '';
  const qf = (document.getElementById('cf-q')?.value   || '').toLowerCase();
  const list = consumptions.filter(co =>
    (!bf || co.to_branch_id == bf) &&
    (!df || (co.consume_date || '') >= df) &&
    (!dt || (co.consume_date || '') <= dt) &&
    (!qf || (co.product_name || '').toLowerCase().includes(qf) || (co.note || '').toLowerCase().includes(qf))
  );
  const tbody = document.getElementById('consumptions-tbody');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="ti ti-package-export"></i><p>Rasxod topilmadi</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(co => {
    const cross = co.from_branch_id != co.to_branch_id;
    return `<tr>
      <td style="color:#64748b">${esc(co.consume_date)}</td>
      <td style="font-weight:600">${esc(co.product_name || '—')}</td>
      <td><span class="badge badge-gray">${esc(co.from_branch_name || '—')}</span></td>
      <td><span class="badge ${cross ? 'badge-amber' : 'badge-blue'}">${esc(co.to_branch_name || '—')}${cross ? ' ⇄' : ''}</span></td>
      <td style="font-weight:700;color:var(--red)">−${co.quantity} ${esc(co.unit || '')}</td>
      <td style="color:#64748b">${co.note === 'auto_daily' ? '<span style="color:#0d9488;font-weight:500">Kunlik sarf</span>' : esc(co.note || '—')}</td>
      <td style="white-space:nowrap;text-align:right">
        <button class="btn btn-sm btn-danger btn-icon" onclick="delConsumption(${co.id})" title="Bekor qilish"><i class="ti ti-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function openAddConsumption(preId) {
  const preProd  = preId ? products.find(p => p.id == preId) : null;
  const branchId = preProd ? preProd.branch_id : (branches[0]?.id ?? null);

  // Manba ombor (qayerdan) tanlovi — mahsulot shu omborda turadi
  const srcBrOpts = branches.map(b =>
    `<option value="${b.id}" ${b.id == branchId ? 'selected' : ''}>${esc(b.name)}</option>`
  ).join('');
  // Maqsadli filial (kim uchun) — boshqa filial ham bo'lishi mumkin
  const dstBrOpts = branches.map(b =>
    `<option value="${b.id}" ${b.id == branchId ? 'selected' : ''}>${esc(b.name)}</option>`
  ).join('');

  openModal(`
    <div class="modal-header">
      <div class="modal-title">Rasxod qilish (ombordan chiqim)</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Ombor (qayerdan) *</label>
          <select class="form-control" id="cs-src" onchange="_consSrcChange()">${srcBrOpts}</select></div>
        <div class="form-group"><label class="form-label">Mahsulot *</label>
          <select class="form-control" id="cs-prod" onchange="_consProdChange()"></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Miqdor *</label>
          <input class="form-control" id="cs-qty" type="number" step="0.01" placeholder="1"></div>
        <div class="form-group"><label class="form-label">Qaysi filial uchun *</label>
          <select class="form-control" id="cs-dst">${dstBrOpts}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Sana</label>
          <input class="form-control" id="cs-date" type="date" value="${today()}"></div>
        <div class="form-group"><label class="form-label">Izoh</label>
          <input class="form-control" id="cs-note" placeholder="Qoʻshimcha maʼlumot"></div>
      </div>
      <div id="cs-info" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:9px 13px;font-size:12px;color:#9a3412;margin-bottom:4px">
        <i class="ti ti-info-circle"></i> Rasxod qilinganda tovar tanlangan ombordan kamayadi.
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveConsumption()"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);

  _consSrcChange(preProd?.id);
}

// Manba ombor o'zgarganda — shu filialdagi mahsulotlar ro'yxatini yangilash
function _consSrcChange(preselectProdId) {
  const srcId = document.getElementById('cs-src').value;
  const sel = document.getElementById('cs-prod');
  if (!sel) return;
  const prods = products.filter(p => p.branch_id == srcId);
  sel.innerHTML = prods.length
    ? prods.map(p => `<option value="${p.id}" ${p.id == preselectProdId ? 'selected' : ''}>${esc(p.name)} — ${p.current_stock} ${esc(p.unit || '')}</option>`).join('')
    : `<option value="">Bu omborda mahsulot yo'q</option>`;
  _consProdChange();
}

// Tanlangan mahsulot bo'yicha mavjud miqdorni ko'rsatish
function _consProdChange() {
  const pid = document.getElementById('cs-prod')?.value;
  const info = document.getElementById('cs-info');
  const p = products.find(x => x.id == pid);
  if (info && p) {
    info.innerHTML = `<i class="ti ti-info-circle"></i> Omborda mavjud: <b>${p.current_stock} ${esc(p.unit || '')}</b>. Rasxod qilinganda shu ombordan kamayadi.`;
  }
}

async function saveConsumption() {
  const product_id   = document.getElementById('cs-prod').value;
  const quantity     = parseFloat(document.getElementById('cs-qty').value);
  const to_branch_id = document.getElementById('cs-dst').value;
  if (!product_id) { toast('Mahsulotni tanlang', 'error'); return; }
  if (!quantity || quantity <= 0) { toast('Miqdorni kiriting', 'error'); return; }

  const p = products.find(x => x.id == product_id);
  if (p && quantity > p.current_stock) {
    toast(`Omborda yetarli emas (mavjud: ${p.current_stock} ${p.unit || ''})`, 'error');
    return;
  }

  const body = {
    product_id, quantity, to_branch_id,
    consume_date: document.getElementById('cs-date').value || today(),
    note:         document.getElementById('cs-note').value
  };
  try {
    await api('POST', '/api/consumptions', body);
    toast('Rasxod qilindi');
    closeModal(true);
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

async function delConsumption(id) {
  if (!confirm("Rasxodni bekor qilasizmi? Tovar omborga qaytariladi.")) return;
  try {
    await api('DELETE', `/api/consumptions/${id}`);
    toast("Bekor qilindi");
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}
