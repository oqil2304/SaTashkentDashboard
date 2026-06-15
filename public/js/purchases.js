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
  const STATUS_LABELS = {
    manual_pending:   ['⏳ Jarayonda',  '#92400e', '#fffbeb', '#fde68a'],
    awaiting_invoice: ['📄 Faktura kutilmoqda', '#1e40af', '#eff6ff', '#bfdbfe'],
    invoice_received: ['✅ Faktura keldi', '#166534', '#f0fdf4', '#bbf7d0'],
    approved:         ['✅ Tasdiqlangan', '#166534', '#f0fdf4', '#bbf7d0'],
  };
  let total = 0;
  tbody.innerHTML = list.map(p => {
    const isPending = !!p._type;
    const sum = (p.quantity || 0) * (p.unit_price || 0);
    if (!isPending) total += sum;
    const [slabel, sc, sbg, sbd] = STATUS_LABELS[p.status] || [];
    const statusBadge = isPending
      ? `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${sbg};border:1px solid ${sbd};color:${sc}">${slabel}</span>`
      : '';
    const rowStyle = isPending ? 'background:#fffdf0;opacity:.92' : '';
    return `<tr style="${rowStyle}">
      <td style="color:#64748b">${esc((p.purchase_date||'').slice(0,10))}</td>
      <td style="font-weight:600">${esc(p.product_name || '—')} ${statusBadge}</td>
      <td><span class="badge badge-gray">${esc(p.branch_name || '—')}</span></td>
      <td>${p.quantity} ${esc(p.unit || '')}</td>
      <td>${isPending ? '<span style="color:#94a3b8">—</span>' : fmtMoney(p.unit_price)}</td>
      <td style="font-weight:700;color:var(--teal)">${isPending ? '<span style="color:#94a3b8">—</span>' : fmtMoney(sum)}</td>
      <td style="color:#64748b">${esc(p.supplier || '—')}</td>
      <td style="white-space:nowrap;text-align:right">
        ${isPending
          ? `<button class="btn btn-sm btn-danger btn-icon" onclick="cancelOrder(${p.id})" title="Bekor qilish"><i class="ti ti-x"></i></button>`
          : `<button class="btn btn-sm btn-secondary btn-icon" onclick="openEditPurchase(${p.id})"><i class="ti ti-edit"></i></button>
             <button class="btn btn-sm btn-danger btn-icon" onclick="delPurchase(${p.id})"><i class="ti ti-trash"></i></button>`
        }
      </td>
    </tr>`;
  }).join('');
  const tot = document.getElementById('purchases-total');
  if (tot) tot.innerHTML = `Jami: <strong style="color:var(--teal);font-size:15px">${fmtMoney(total)}</strong> (${list.length} ta yozuv)`;
}

const PURCH_CATS = ['Oziq-ovqat', "Yoqilg'i", "Uy-ro'zg'or", 'Elektr', 'Ofis', 'Boshqa'];

// Ulangan ta'minotchilar dropdown
function _supDropdown(selId) {
  const linked = suppliers.filter(s => s.telegram_chat_id);
  const opts = linked.map(s =>
    `<option value="${s.id}" ${s.id == selId ? 'selected' : ''}>✅ ${esc(s.name)}</option>`
  ).join('');
  return `<select class="form-control" id="xs" onchange="_purchSupChange()">
    <option value="">— Qo'lda kiritish / Ta'minotchisiz —</option>
    ${opts}
    ${!linked.length ? '<option disabled>Ta\'minotchi ulangan emas</option>' : ''}
  </select>`;
}

function _purchSupChange() {
  const val = document.getElementById('xs')?.value;
  const hint = document.getElementById('xs-hint');
  if (!hint) return;
  if (val) {
    hint.innerHTML = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 13px;color:#166534">
      <i class="ti ti-brand-telegram"></i> Ta'minotchiga bot orqali faktura so'raladi. Tovar faktura → to'lov tasdiqlanganidan keyin omborga tushadi.
    </div>`;
  } else {
    hint.innerHTML = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:9px 13px;color:#166534">
      <i class="ti ti-info-circle"></i> Sotib olish qoʻshilganda omborga avtomatik qoʻshiladi.
    </div>`;
  }
}

// Filial tanlanganida datalist ni yangilash
function _purchBranchChange() {
  const brId = document.getElementById('xbr').value;
  const dl = document.getElementById('xp-list');
  if (!dl) return;
  const prods = brId ? products.filter(p => p.branch_id == brId) : products;
  dl.innerHTML = prods.map(p => `<option value="${esc(p.name)}"></option>`).join('');
  _purchProductChange();
}

// Mahsulot nomi yozilganda — omborada bormi yo'qligini aniqlash
function _purchProductChange() {
  const brId  = document.getElementById('xbr')?.value;
  const pName = document.getElementById('xp')?.value.trim();
  const newRow = document.getElementById('xp-new-fields');
  if (!newRow) return;
  const found = products.find(p =>
    p.name.toLowerCase() === (pName || '').toLowerCase() && (!brId || p.branch_id == brId)
  );
  // Yangi mahsulot maydonlarini ko'rsatish/yashirish
  newRow.style.display = (!pName || found) ? 'none' : 'flex';
  const hint = document.getElementById('xp-hint');
  if (hint) {
    if (!pName) { hint.textContent = ''; hint.style.display = 'none'; return; }
    hint.style.display = 'block';
    if (found) {
      hint.style.color = '#166534';
      hint.innerHTML = `<i class="ti ti-check"></i> Ombordan: <b>${found.current_stock} ${esc(found.unit || '')}</b>`;
    } else {
      hint.style.color = '#9a3412';
      hint.innerHTML = `<i class="ti ti-info-circle"></i> Omborда yo'q — yangi mahsulot yaratiladi`;
    }
  }
}

function _purchModal(title, saveFn, opts = {}) {
  const firstBr = branches[0];
  const brOpts  = branches.map(b =>
    `<option value="${b.id}" ${b.id == opts.branch_id ? 'selected' : (opts.branch_id == null && b.id == firstBr?.id ? 'selected' : '')}>${esc(b.name)}</option>`
  ).join('');
  const catOpts = [...new Set([...PURCH_CATS, ...products.map(p => p.category).filter(Boolean)])]
    .map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

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
        <div class="form-group">
          <label class="form-label">Mahsulot *</label>
          <input class="form-control" id="xp" list="xp-list"
            placeholder="Mahsulot nomi (yozing yoki tanlang)"
            value="${esc(opts.product_name || '')}" autocomplete="off"
            oninput="_purchProductChange()">
          <datalist id="xp-list"></datalist>
          <div id="xp-hint" style="font-size:11px;margin-top:4px;display:none"></div>
        </div>
      </div>

      <!-- Yangi mahsulot uchun qo'shimcha maydonlar (omborda yo'q bo'lsa) -->
      <div class="form-row" id="xp-new-fields" style="display:none;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;gap:10px">
        <div class="form-group" style="margin:0;flex:1"><label class="form-label">Kategoriya</label>
          <input class="form-control" id="xcat" list="xcat-list" placeholder="Oziq-ovqat, Ofis..." autocomplete="off">
          <datalist id="xcat-list">${catOpts}</datalist>
        </div>
        <div class="form-group" style="margin:0;flex:1"><label class="form-label">Birlik</label>
          <input class="form-control" id="xunit" list="xunit-list" placeholder="kg, dona, litr...">
          <datalist id="xunit-list">
            <option value="kg"><option value="gr"><option value="litr"><option value="ml">
            <option value="dona"><option value="quti"><option value="rulon"><option value="metr">
          </datalist>
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
          ${_supDropdown(opts.supplier_id)}
        </div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label>
        <input class="form-control" id="xn" placeholder="Qoʻshimcha maʼlumot" value="${esc(opts.note || '')}"></div>
      <div id="xs-hint" style="font-size:12px;margin-bottom:8px"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="${saveFn}"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);

  _purchBranchChange();
  _purchSupChange();
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
  const brId      = document.getElementById('xbr').value;
  const pName     = document.getElementById('xp').value.trim();
  const quantity  = parseFloat(document.getElementById('xq').value);
  const suppId    = document.getElementById('xs')?.value || '';
  const unitPrice = parseFloat(document.getElementById('xpr').value) || 0;
  if (!pName)                     { toast('Mahsulot nomini kiriting', 'error'); return; }
  if (!quantity || quantity <= 0) { toast('Miqdorni kiriting', 'error'); return; }

  // Mahsulotni nom va filial bo'yicha topamiz
  let prod = products.find(p =>
    p.name.toLowerCase() === pName.toLowerCase() && (!brId || p.branch_id == brId)
  ) || products.find(p => p.name.toLowerCase() === pName.toLowerCase());

  // Omborda yo'q bo'lsa — yangi mahsulot yaratamiz
  if (!prod) {
    try {
      prod = await api('POST', '/api/products', {
        name:        pName,
        branch_id:   brId || null,
        category:    document.getElementById('xcat')?.value || '',
        unit:        document.getElementById('xunit')?.value || '',
        daily_usage: 0,
        current_stock: 0
      });
      products.push(prod);
    } catch (e) { toast('Mahsulot yaratishda xato: ' + e.message, 'error'); return; }
  }

  // Ulangan ta'minotchi tanlangan → bot orqali buyurtma
  if (suppId && !id) {
    try {
      await api('POST', '/api/purchases/manual-order', {
        product_id:  prod.id,
        quantity,
        unit_price:  unitPrice,
        supplier_id: suppId,
        note:        document.getElementById('xn')?.value || ''
      });
      toast("Ta'minotchiga faktura so'rovi yuborildi ✅");
      closeModal(true);
      await loadAll();
      renderSection(currentSection);
    } catch (e) { toast(e.message, 'error'); }
    return;
  }

  // Oddiy — to'g'ridan-to'g'ri omborga
  const sup = suppId ? (suppliers.find(s => s.id == suppId)?.name || '') : '';
  const body = {
    product_id:    prod.id,
    quantity,
    unit_price:    unitPrice,
    purchase_date: document.getElementById('xd')?.value || today(),
    supplier:      sup,
    note:          document.getElementById('xn')?.value || ''
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

async function cancelOrder(id) {
  if (!confirm('Buyurtmani bekor qilasizmi?')) return;
  try {
    await api('PUT', `/api/supply-orders/${id}/cancel`);
    toast('Bekor qilindi');
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
