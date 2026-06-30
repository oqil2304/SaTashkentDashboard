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
          <th>Sana</th><th>Mahsulot</th><th>Filial</th><th>Miqdor</th><th>Birlik narx</th><th>Dostavka</th><th>Jami</th><th>Yetkazuvchi</th><th></th>
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
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="ti ti-shopping-cart-off"></i><p>Sotib olish topilmadi</p></div></td></tr>`;
    const tot = document.getElementById('purchases-total');
    if (tot) tot.textContent = '';
    return;
  }
  const STATUS_LABELS = {
    manual_pending:   ['⏳ Jarayonda',  '#92400e', '#fffbeb', '#fde68a'],
    awaiting_invoice: ['📄 Faktura kutilmoqda', '#1e40af', '#eff6ff', '#bfdbfe'],
    invoice_received: ['✅ Faktura keldi', '#166534', '#f0fdf4', '#bbf7d0'],
    approved:         ['✅ Tasdiqlangan', '#166534', '#f0fdf4', '#bbf7d0'],
    in_transit:       ['🚚 Yo\'lda', '#0369a1', '#e0f2fe', '#7dd3fc'],
  };
  let total = 0, totalDelivery = 0;
  tbody.innerHTML = list.map(p => {
    const isPending = !!p._type;
    const sum = (p.quantity || 0) * (p.unit_price || 0) + (p.delivery_cost || 0);
    if (!isPending) { total += sum; totalDelivery += (p.delivery_cost || 0); }
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
      <td>${p.delivery_cost ? `<span style="color:#d97706;font-weight:600">${fmtMoney(p.delivery_cost)}</span>` : `<span style="color:#22c55e">Bepul</span>`}</td>
      <td style="font-weight:700;color:var(--teal)">${isPending ? '<span style="color:#94a3b8">—</span>' : fmtMoney(sum)}</td>
      <td style="color:#64748b">${esc(p.supplier || '—')}</td>
      <td style="white-space:nowrap;text-align:right">
        ${isPending
          ? (p.status === 'in_transit'
              ? `<button class="btn btn-sm btn-success btn-icon" onclick="arrivedOrder(${p.id})" title="Keldi">✅ Keldi</button>
                 <button class="btn btn-sm btn-danger btn-icon" onclick="cancelOrder(${p.id})" title="Bekor qilish"><i class="ti ti-x"></i></button>`
              : `<button class="btn btn-sm btn-danger btn-icon" onclick="cancelOrder(${p.id})" title="Bekor qilish"><i class="ti ti-x"></i></button>`)
          : `<button class="btn btn-sm btn-secondary btn-icon" onclick="openEditPurchase(${p.id})"><i class="ti ti-edit"></i></button>
             <button class="btn btn-sm btn-danger btn-icon" onclick="delPurchase(${p.id})"><i class="ti ti-trash"></i></button>`
        }
      </td>
    </tr>`;
  }).join('');
  const tot = document.getElementById('purchases-total');
  if (tot) tot.innerHTML = `Jami: <strong style="color:var(--teal);font-size:15px">${fmtMoney(total)}</strong>` +
    (totalDelivery ? ` (shu jumladan dostavka: <strong style="color:#d97706">${fmtMoney(totalDelivery)}</strong>)` : '') +
    ` (${list.length} ta yozuv)`;
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

// Katalog mahsulotlar ro'yxati (admin kiritgan)
function _catalogList() {
  return (typeof catalogItems !== 'undefined' && catalogItems.length) ? catalogItems : [];
}

// Belgilangan mahsulotlar bo'yicha ta'minotchini avtomatik tanlash
function _autoFillSupplier() {
  const brId = document.getElementById('xbr')?.value;
  const xs   = document.getElementById('xs');
  if (!xs) return;
  // Birinchi belgilangan mahsulotga mos ombor mahsulotini topamiz
  const checked = document.querySelector('.xp-check:checked');
  if (!checked) return;
  const name = checked.dataset.name || '';
  const prod = products.find(p =>
    p.name.toLowerCase() === name.toLowerCase() && (!brId || p.branch_id == brId)
  ) || products.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!prod || !prod.supplier_id) return;
  const sup = suppliers.find(s => s.id == prod.supplier_id && s.telegram_chat_id);
  if (!sup) return;
  const bids = sup.branch_ids ? String(sup.branch_ids).split(',').map(x => x.trim()) : [];
  if (bids.length && brId && !bids.includes(String(brId))) return;
  if (xs.value !== String(sup.id)) { xs.value = String(sup.id); _purchSupChange(); }
}

// Katalog ro'yxatini qidiruv bo'yicha filtrlash
function _filterCatalog() {
  const q = (document.getElementById('xp-search')?.value || '').toLowerCase();
  document.querySelectorAll('#xp-checklist .xp-row').forEach(row => {
    const n = (row.dataset.name || '').toLowerCase();
    row.style.display = (!q || n.includes(q)) ? 'flex' : 'none';
  });
}

// Mahsulot belgilanganda — miqdor maydonini ko'rsatish/yashirish
function _toggleCatalogItem(cb) {
  const row = cb.closest('.xp-row');
  if (row) {
    const qty = row.querySelector('.xp-qty');
    if (qty) { qty.style.display = cb.checked ? 'block' : 'none'; if (cb.checked) qty.focus(); }
    row.style.background = cb.checked ? '#f0fdf4' : '';
  }
  _autoFillSupplier();
}

function _catalogChecklistHtml() {
  const list = _catalogList();
  if (!list.length) {
    return `<div style="padding:14px;text-align:center;color:#9a3412;font-size:13px">
      Katalog bo'sh. Avval <b>Mahsulotlar</b> bo'limidan mahsulot qo'shing.</div>`;
  }
  return list.map(it => `
    <label class="xp-row" data-name="${esc(it.name)}" style="display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:6px;cursor:pointer;border-bottom:1px solid #f1f5f9">
      <input type="checkbox" class="xp-check" value="${it.id}" data-name="${esc(it.name)}" data-unit="${esc(it.unit || '')}" onchange="_toggleCatalogItem(this)" style="width:17px;height:17px;flex-shrink:0">
      <span style="flex:1;font-weight:500">${esc(it.name)} <span style="color:#94a3b8;font-size:11px;font-weight:400">${esc(it.unit || '')}</span></span>
      <input type="number" class="xp-qty form-control" step="0.01" placeholder="miqdor" style="width:100px;display:none;padding:6px 8px" onclick="event.preventDefault()">
    </label>`).join('');
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
          <select class="form-control" id="xbr" onchange="_autoFillSupplier()">
            ${brOpts}
          </select></div>
        <div class="form-group"><label class="form-label">Yetkazib beruvchi</label>
          ${_supDropdown(opts.supplier_id)}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Mahsulotlar * <span style="font-weight:400;color:#94a3b8">(bir nechta tanlash mumkin)</span></label>
        <input class="form-control" id="xp-search" placeholder="🔍 Qidirish..." oninput="_filterCatalog()" style="margin-bottom:8px">
        <div id="xp-checklist" style="max-height:240px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px">
          ${_catalogChecklistHtml()}
        </div>
      </div>

      <div class="form-row">
        <div class="form-group"><label class="form-label">Sana</label>
          <input class="form-control" id="xd" type="date" value="${opts.purchase_date || today()}"></div>
        <div class="form-group"><label class="form-label">Izoh</label>
          <input class="form-control" id="xn" placeholder="Qoʻshimcha maʼlumot" value="${esc(opts.note || '')}"></div>
      </div>
      <div id="xs-hint" style="font-size:12px;margin-bottom:8px"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="${saveFn}"><i class="ti ti-check"></i>Buyurtma berish</button>
      </div>
    </div>`, 'full');

  _purchSupChange();
}

function openAddPurchase(preId) {
  const preProd  = preId ? products.find(p => p.id == preId) : null;
  const branchId = preProd ? preProd.branch_id : (branches[0]?.id ?? null);
  _purchModal('Sotib olish — buyurtma', 'savePurchase(null)', { branch_id: branchId });
}

// Tahrirlash — mavjud bitta sotib olishni o'zgartirish (oddiy forma)
function openEditPurchase(id) {
  const p = purchases.find(x => x.id == id); if (!p) return;
  const brOpts = branches.map(b =>
    `<option value="${b.id}" ${b.id == p.branch_id ? 'selected' : ''}>${esc(b.name)}</option>`
  ).join('');
  openModal(`
    <div class="modal-header">
      <div class="modal-title">Sotib olishni tahrirlash</div>
      <button class="modal-close" onclick="closeModal(true)"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Mahsulot</label>
        <input class="form-control" value="${esc(p.product_name || '')}" disabled></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Filial</label>
          <select class="form-control" id="exbr" disabled>${brOpts}</select></div>
        <div class="form-group"><label class="form-label">Miqdor *</label>
          <input class="form-control" id="exq" type="number" step="0.01" value="${p.quantity || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Birlik narxi (soʻm)</label>
          <input class="form-control" id="expr" type="number" value="${p.unit_price || ''}"></div>
        <div class="form-group"><label class="form-label">Sana</label>
          <input class="form-control" id="exd" type="date" value="${(p.purchase_date||today()).slice(0,10)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Izoh</label>
        <input class="form-control" id="exn" value="${esc(p.note || '')}"></div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="closeModal(true)">Bekor</button>
        <button class="btn btn-primary" onclick="saveEditPurchase(${id}, ${p.product_id || 'null'})"><i class="ti ti-check"></i>Saqlash</button>
      </div>
    </div>`);
}

async function saveEditPurchase(id, productId) {
  const quantity = parseFloat(document.getElementById('exq').value);
  if (!quantity || quantity <= 0) { toast('Miqdorni kiriting', 'error'); return; }
  const body = {
    product_id:    productId,
    quantity,
    unit_price:    parseFloat(document.getElementById('expr').value) || 0,
    purchase_date: document.getElementById('exd')?.value || today(),
    branch_id:     document.getElementById('exbr')?.value || null,
    note:          document.getElementById('exn')?.value || ''
  };
  try {
    await api('PUT', `/api/purchases/${id}`, body);
    toast('Yangilandi');
    closeModal(true);
    await loadAll();
    renderSection(currentSection);
  } catch (e) { toast(e.message, 'error'); }
}

// Tanlangan katalog mahsulotini ombordagi mahsulotga moslash (yo'q bo'lsa yaratish)
async function _findOrCreateProduct(name, unit, brId) {
  let prod = products.find(p =>
    p.name.toLowerCase() === name.toLowerCase() && (!brId || p.branch_id == brId)
  );
  if (prod) return prod;
  prod = await api('POST', '/api/products', {
    name, branch_id: brId || null, unit: unit || '', daily_usage: 0, current_stock: 0
  });
  products.push(prod);
  return prod;
}

async function savePurchase(id) {
  const brId   = document.getElementById('xbr').value;
  const suppId = document.getElementById('xs')?.value || '';
  const note   = document.getElementById('xn')?.value || '';
  const pdate  = document.getElementById('xd')?.value || today();

  // Belgilangan mahsulotlarni yig'amiz
  const items = [];
  document.querySelectorAll('#xp-checklist .xp-check:checked').forEach(cb => {
    const row = cb.closest('.xp-row');
    const qty = parseFloat(row?.querySelector('.xp-qty')?.value);
    items.push({ name: cb.dataset.name, unit: cb.dataset.unit || '', qty });
  });

  if (!items.length)              { toast('Kamida bitta mahsulot tanlang', 'error'); return; }
  if (items.some(i => !i.qty || i.qty <= 0)) {
    toast('Har bir tanlangan mahsulot uchun miqdor kiriting', 'error'); return;
  }
  if (!brId)                      { toast('Filialni tanlang', 'error'); return; }

  try {
    // Ulangan ta'minotchi tanlangan → bot orqali buyurtma
    // Ombor mahsuloti YARATILMAYDI — faqat nom/miqdor/filial saqlanadi
    // Ombor faqat admin "Keldi" bosganda yangilanadi
    if (suppId) {
      const members = items.map(it => ({ name: it.name, qty: it.qty, unit: it.unit }));
      await api('POST', '/api/purchases/manual-order', {
        members,
        supplier_id: suppId,
        branch_id:   brId,
        note
      });
      toast("Ta'minotchiga faktura so'rovi yuborildi ✅");
    } else {
      // Ta'minotchisiz — mahsulotni ombordan topamiz yoki yaratamiz, to'g'ridan qo'shamiz
      for (const it of items) {
        const prod = await _findOrCreateProduct(it.name, it.unit, brId);
        await api('POST', '/api/purchases', {
          product_id: prod.id, quantity: it.qty, unit_price: 0,
          purchase_date: pdate, supplier: '', supplier_id: null, note
        });
      }
      toast(`${items.length} ta mahsulot omborga qo'shildi ✅`);
    }
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

async function arrivedOrder(id) {
  if (!confirm('Tovar omborga kelganligini tasdiqlaysizmi?')) return;
  const dlvRaw = prompt('Dostavka narxi (so\'m)?\n0 yoki bo\'sh = bepul');
  if (dlvRaw === null) return;
  const deliveryCost = parseFloat(dlvRaw) || 0;
  const res = await fetch(`/api/supply-orders/${id}/arrived`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delivery_cost: deliveryCost })
  });
  if (res.ok) { toast('Tovar omborga kiritildi!'); await loadAll(); renderSection(currentSection); }
  else alert('Xatolik yuz berdi');
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
